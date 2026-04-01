import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";
import {
	generateDeployScript,
	generateForceDeployScript,
} from "../../templates/deployScript.js";
import type { AssetRegistry } from "../../templates/registry.js";
import {
	formatAssetDetail,
	formatAssetSearchResults,
	formatDeployResult,
} from "../presenter/index.js";
import { withLiveGuard } from "../toolGuards.js";
import { detailOnlyFormattingSchema } from "../types.js";

// --- Schemas ---

const searchAssetsSchema = detailOnlyFormattingSchema.extend({
	maxResults: z
		.number()
		.int()
		.min(1)
		.max(100)
		.describe("Maximum number of results to return")
		.optional(),
	minTdVersion: z
		.string()
		.describe("Filter assets compatible with this TD version or older")
		.optional(),
	query: z
		.string()
		.min(1)
		.describe(
			"Search query — matches against title, description, tags, aliases, useCases",
		)
		.optional(),
	tags: z.array(z.string()).describe("Filter by tags (OR logic)").optional(),
});
type SearchAssetsParams = z.input<typeof searchAssetsSchema>;

const getAssetSchema = detailOnlyFormattingSchema.extend({
	id: z.string().min(1).describe("Asset ID to retrieve"),
	includeReadme: z
		.boolean()
		.describe("Include the README content in the response")
		.optional(),
});
type GetAssetParams = z.input<typeof getAssetSchema>;

const deployAssetSchema = detailOnlyFormattingSchema.extend({
	containerName: z
		.string()
		.min(1)
		.describe("Custom container name (overrides manifest default)")
		.optional(),
	dryRun: z
		.boolean()
		.describe("Preview deploy plan without executing")
		.optional(),
	force: z
		.boolean()
		.describe("Force redeploy even if same version exists")
		.optional(),
	id: z.string().min(1).describe("Asset ID to deploy"),
	parentPath: z
		.string()
		.min(1)
		.describe("Parent path in TD where the asset will be created"),
});
type DeployAssetParams = z.input<typeof deployAssetSchema>;

// --- Deploy helpers ---

type ToolResponse = {
	content: Array<{ text: string; type: "text" }>;
	isError?: boolean;
};

function validateAssetForDeploy(
	registry: AssetRegistry,
	id: string,
	parentPath: string,
): ToolResponse | undefined {
	if (parentPath === "/") {
		return {
			content: [
				{
					text: 'Cannot deploy to root "/". Specify a valid parent path (e.g., /project1).',
					type: "text" as const,
				},
			],
			isError: true,
		};
	}
	const asset = registry.getById(id);
	if (!asset) {
		return {
			content: [
				{
					text: `Asset not found: "${id}". Use search_td_assets to discover available assets.`,
					type: "text" as const,
				},
			],
			isError: true,
		};
	}
	if (asset.manifest.kind !== "tox-asset") {
		return {
			content: [
				{
					text: `Asset "${id}" is kind "${asset.manifest.kind}" and cannot be deployed. Only tox-asset kind is deployable.`,
					type: "text" as const,
				},
			],
			isError: true,
		};
	}
	if (asset.source !== "builtin") {
		return {
			content: [
				{
					text: `Asset "${id}" is from source "${asset.source}". Custom asset deployment requires explicit trust. See Epic 11.`,
					type: "text" as const,
				},
			],
			isError: true,
		};
	}
	if (!asset.toxPath) {
		return {
			content: [
				{
					text: `Asset "${id}" has no .tox file available.`,
					type: "text" as const,
				},
			],
			isError: true,
		};
	}
	return undefined;
}

async function executeAssetDeploy(
	tdClient: TouchDesignerClient,
	registry: AssetRegistry,
	id: string,
	containerName: string,
	parentPath: string,
	force: boolean,
): Promise<{
	assetId: string;
	message?: string;
	path?: string;
	status: string;
}> {
	const asset = registry.getById(id);
	if (!asset?.toxPath)
		throw new Error(`Asset "${id}" not found or has no .tox file`);
	// Manifest is narrowed to tox-asset by validateAssetForDeploy
	const manifest = asset.manifest as Extract<
		typeof asset.manifest,
		{ kind: "tox-asset" }
	>;
	const scriptOpts = {
		containerName,
		manifest,
		parentPath,
		toxPath: asset.toxPath,
	};
	const script = force
		? generateForceDeployScript({ ...scriptOpts, force: true })
		: generateDeployScript(scriptOpts);

	const scriptResult = await tdClient.execPythonScript<{ result: string }>({
		script,
	});
	if (!scriptResult.success) throw scriptResult.error;

	try {
		return JSON.parse(scriptResult.data.result as string);
	} catch {
		throw new Error(
			`Failed to parse deploy script result: ${String(scriptResult.data.result)}`,
		);
	}
}

async function appendDeployNodeWarnings(
	tdClient: TouchDesignerClient,
	deployResult: { message?: string; path?: string; status: string },
): Promise<void> {
	if (deployResult.status !== "deployed" || !deployResult.path) return;
	try {
		const errResult = await tdClient.getNodeErrors({
			nodePath: deployResult.path,
		});
		if (errResult.success && errResult.data) {
			const errors = errResult.data.errors ?? [];
			if (errors.length > 0) {
				deployResult.message = `${deployResult.message ?? "Deployed"} — WARNING: ${errors.length} error(s) detected in deployed component`;
			}
		}
	} catch {
		/* non-critical */
	}
}

// --- Registration ---

export function registerAssetTools(
	server: McpServer,
	logger: ILogger,
	tdClient: TouchDesignerClient,
	registry: AssetRegistry,
	serverMode: ServerMode,
): void {
	server.tool(
		TOOL_NAMES.SEARCH_TD_ASSETS,
		"Search the catalogue of reusable TouchDesigner assets (offline, no TD connection needed)",
		searchAssetsSchema.strict().shape,
		async (params: SearchAssetsParams = {}) => {
			try {
				const {
					detailLevel,
					maxResults,
					minTdVersion,
					query,
					responseFormat,
					tags,
				} = params;
				const results = registry.search({
					maxResults,
					minTdVersion,
					query,
					tags,
				});
				const text = formatAssetSearchResults(results, {
					detailLevel: detailLevel ?? "summary",
					query,
					responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.SEARCH_TD_ASSETS,
					undefined,
					serverMode,
				);
			}
		},
	);

	server.tool(
		TOOL_NAMES.GET_TD_ASSET,
		"Get detailed information about a specific TouchDesigner asset by ID (offline, no TD connection needed)",
		getAssetSchema.strict().shape,
		async (params: GetAssetParams) => {
			try {
				const { detailLevel, id, includeReadme, responseFormat } = params;
				const asset = registry.getById(id);
				if (!asset) {
					return {
						content: [
							{
								text: `Asset not found: "${id}". Use search_td_assets to discover available assets.`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}
				const text = formatAssetDetail(asset, {
					detailLevel: detailLevel ?? "detailed",
					includeReadme,
					responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.GET_TD_ASSET,
					undefined,
					serverMode,
				);
			}
		},
	);

	server.tool(
		TOOL_NAMES.DEPLOY_TD_ASSET,
		"Deploy a reusable .tox asset into the running TouchDesigner project",
		deployAssetSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.DEPLOY_TD_ASSET,
			serverMode,
			tdClient,
			async (params: DeployAssetParams) => {
				try {
					const {
						containerName: customName,
						detailLevel,
						dryRun,
						force,
						id,
						parentPath,
						responseFormat,
					} = params;

					const validationError = validateAssetForDeploy(
						registry,
						id,
						parentPath,
					);
					if (validationError) return validationError;

					const asset = registry.getById(id);
					if (!asset?.toxPath)
						throw new Error(`Asset "${id}" not found or has no .tox file`);
					const manifest = asset.manifest as Extract<
						typeof asset.manifest,
						{ kind: "tox-asset" }
					>;
					const containerName = customName ?? manifest.deploy.containerName;

					if (dryRun) {
						const text = formatDeployResult(
							{
								assetId: id,
								message: `Would create container "${containerName}" at ${parentPath}/${containerName} with ${manifest.id} v${manifest.version}`,
								path: `${parentPath}/${containerName}`,
								status: "dry_run",
							},
							{ detailLevel, responseFormat },
						);
						return { content: [{ text, type: "text" as const }] };
					}

					const deployResult = await executeAssetDeploy(
						tdClient,
						registry,
						id,
						containerName,
						parentPath,
						force ?? false,
					);
					await appendDeployNodeWarnings(tdClient, deployResult);

					const text = formatDeployResult(deployResult, {
						detailLevel,
						responseFormat,
					});
					return { content: [{ text, type: "text" as const }] };
				} catch (error) {
					return handleToolError(
						error,
						logger,
						TOOL_NAMES.DEPLOY_TD_ASSET,
						undefined,
						serverMode,
					);
				}
			},
		),
	);
}
