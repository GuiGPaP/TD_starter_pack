import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { REFERENCE_COMMENT, TOOL_NAMES } from "../../../core/constants.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";
import type { DeploySnapshotRegistry } from "../deploy/snapshotRegistry.js";
import { formatUndoDeployResult } from "../presenter/index.js";
import { detailOnlyFormattingSchema } from "../types.js";
import { withLiveGuard } from "../toolGuards.js";

const undoLastDeploySchema = detailOnlyFormattingSchema.extend({
	confirm: z
		.boolean()
		.default(false)
		.describe(
			"Set to true to actually delete added operators. Default: false (dry-run preview only)",
		),
	snapshotId: z
		.string()
		.optional()
		.describe("Snapshot ID to rollback to. Default: most recent snapshot"),
});

type UndoLastDeployParams = z.input<typeof undoLastDeploySchema>;

export function registerRollbackTools(
	server: McpServer,
	tdClient: TouchDesignerClient,
	serverMode: ServerMode,
	snapshotRegistry: DeploySnapshotRegistry,
	_logger: ILogger,
): void {
	const wrap = (
		toolName: string,
		handler: (params: UndoLastDeployParams) => Promise<string>,
		_refComment: string,
	) => {
		return async (params: UndoLastDeployParams) => {
			const text = await handler(params);
			return { content: [{ text, type: "text" as const }] };
		};
	};

	server.tool(
		TOOL_NAMES.UNDO_LAST_DEPLOY,
		"Undo a previous deploy by deleting operators added since the pre-deploy snapshot. Dry-run by default.",
		undoLastDeploySchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.UNDO_LAST_DEPLOY,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.UNDO_LAST_DEPLOY,
				async (params: UndoLastDeployParams) => {
					const { confirm, snapshotId, detailLevel, responseFormat } =
						params;

					const snapshot = snapshotRegistry.get(snapshotId);
					if (!snapshot) {
						const msg = snapshotId
							? `No snapshot found with ID: ${snapshotId}`
							: "No deploy snapshots available. Deploy something first.";
						return formatUndoDeployResult(
							{
								error: msg,
								opsToDelete: [],
								parentPath: "",
								snapshotId: snapshotId ?? "",
							},
							{ detailLevel: detailLevel ?? "summary", responseFormat },
						);
					}

					// Get current operators under the same parent
					const result = await tdClient.getNodes({
						parentPath: snapshot.parentPath,
					});

					const currentOps = new Set<string>();
					if (result.success && result.data?.nodes) {
						for (const node of result.data.nodes) {
							if (node.path) currentOps.add(node.path);
						}
					}

					// Find operators added since snapshot
					const snapshotSet = new Set(snapshot.operators);
					const addedOps = [...currentOps].filter(
						(p) => !snapshotSet.has(p),
					);

					if (addedOps.length === 0) {
						return formatUndoDeployResult(
							{
								message:
									"No new operators found since snapshot — nothing to undo.",
								opsToDelete: [],
								parentPath: snapshot.parentPath,
								snapshotId: snapshot.id,
							},
							{ detailLevel: detailLevel ?? "summary", responseFormat },
						);
					}

					if (!confirm) {
						return formatUndoDeployResult(
							{
								dryRun: true,
								message: `Would delete ${addedOps.length} operator(s) added by ${snapshot.toolName}`,
								opsToDelete: addedOps,
								parentPath: snapshot.parentPath,
								snapshotId: snapshot.id,
							},
							{ detailLevel: detailLevel ?? "summary", responseFormat },
						);
					}

					// Actually delete
					const deleteScript = addedOps
						.map((p) => `op('${p}').destroy()`)
						.join("\n");
					const execResult = await tdClient.execPythonScript({
						mode: "full-exec",
						script: deleteScript,
					});

					const success = execResult.success;
					return formatUndoDeployResult(
						{
							confirmed: true,
							message: success
								? `Deleted ${addedOps.length} operator(s)`
								: `Rollback script failed: ${execResult.error}`,
							opsToDelete: addedOps,
							parentPath: snapshot.parentPath,
							snapshotId: snapshot.id,
							success,
						},
						{ detailLevel: detailLevel ?? "summary", responseFormat },
					);
				},
				REFERENCE_COMMENT,
			),
		),
	);
}
