import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";
import type {
	DeploySnapshot,
	DeploySnapshotRegistry,
} from "../deploy/snapshotRegistry.js";
import { formatUndoDeployResult } from "../presenter/index.js";
import { withLiveGuard } from "../toolGuards.js";
import { detailOnlyFormattingSchema } from "../types.js";

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

interface RollbackDeps {
	snapshotRegistry: DeploySnapshotRegistry;
	tdClient: TouchDesignerClient;
}

function formatUndoResult(
	data: Parameters<typeof formatUndoDeployResult>[0],
	params: UndoLastDeployParams,
): string {
	return formatUndoDeployResult(data, {
		detailLevel: params.detailLevel ?? "summary",
		responseFormat: params.responseFormat,
	});
}

function formatMissingSnapshot(
	snapshotId: string | undefined,
	params: UndoLastDeployParams,
): string {
	const error = snapshotId
		? `No snapshot found with ID: ${snapshotId}`
		: "No deploy snapshots available. Deploy something first.";

	return formatUndoResult(
		{
			error,
			opsToDelete: [],
			parentPath: "",
			snapshotId: snapshotId ?? "",
		},
		params,
	);
}

async function getCurrentOperatorPaths(
	tdClient: TouchDesignerClient,
	parentPath: string,
): Promise<Set<string>> {
	const result = await tdClient.getNodes({ parentPath });
	const currentOps = new Set<string>();

	if (!result.success || !result.data?.nodes) return currentOps;

	for (const node of result.data.nodes) {
		if (node.path) currentOps.add(node.path);
	}

	return currentOps;
}

function getAddedOperatorPaths(
	snapshot: DeploySnapshot,
	currentOps: ReadonlySet<string>,
): string[] {
	const snapshotSet = new Set(snapshot.operators);
	return [...currentOps].filter((path) => !snapshotSet.has(path));
}

function formatEmptyRollback(
	snapshot: DeploySnapshot,
	params: UndoLastDeployParams,
): string {
	return formatUndoResult(
		{
			message: "No new operators found since snapshot — nothing to undo.",
			opsToDelete: [],
			parentPath: snapshot.parentPath,
			snapshotId: snapshot.id,
		},
		params,
	);
}

function formatDryRunRollback(
	snapshot: DeploySnapshot,
	addedOps: string[],
	params: UndoLastDeployParams,
): string {
	return formatUndoResult(
		{
			dryRun: true,
			message: `Would delete ${addedOps.length} operator(s) added by ${snapshot.toolName}`,
			opsToDelete: addedOps,
			parentPath: snapshot.parentPath,
			snapshotId: snapshot.id,
		},
		params,
	);
}

function buildDeleteScript(operatorPaths: string[]): string {
	return operatorPaths
		.map((operatorPath) => `op(${JSON.stringify(operatorPath)}).destroy()`)
		.join("\n");
}

async function executeRollback(
	snapshot: DeploySnapshot,
	addedOps: string[],
	params: UndoLastDeployParams,
	tdClient: TouchDesignerClient,
): Promise<string> {
	const execResult = await tdClient.execPythonScript({
		mode: "full-exec",
		script: buildDeleteScript(addedOps),
	});
	const success = execResult.success;

	return formatUndoResult(
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
		params,
	);
}

async function handleUndoLastDeploy(
	params: UndoLastDeployParams,
	deps: RollbackDeps,
): Promise<string> {
	const { confirm, snapshotId } = params;
	const snapshot = deps.snapshotRegistry.get(snapshotId);

	if (!snapshot) return formatMissingSnapshot(snapshotId, params);

	const currentOps = await getCurrentOperatorPaths(
		deps.tdClient,
		snapshot.parentPath,
	);
	const addedOps = getAddedOperatorPaths(snapshot, currentOps);

	if (addedOps.length === 0) return formatEmptyRollback(snapshot, params);
	if (!confirm) return formatDryRunRollback(snapshot, addedOps, params);

	return executeRollback(snapshot, addedOps, params, deps.tdClient);
}

export function registerRollbackTools(
	server: McpServer,
	tdClient: TouchDesignerClient,
	serverMode: ServerMode,
	snapshotRegistry: DeploySnapshotRegistry,
	_logger: ILogger,
): void {
	const asToolResult = (
		handler: (params: UndoLastDeployParams) => Promise<string>,
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
			asToolResult((params) =>
				handleUndoLastDeploy(params, { snapshotRegistry, tdClient }),
			),
		),
	);
}
