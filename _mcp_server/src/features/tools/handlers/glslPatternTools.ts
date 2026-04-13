import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";
import type { KnowledgeRegistry } from "../../resources/registry.js";
import type { TDGlslPatternEntry } from "../../resources/types.js";
import { generateGlslDeployScript } from "../glslDeployScript.js";
import {
	formatGlslDeployResult,
	formatGlslPatternDetail,
	formatGlslPatternSearchResults,
} from "../presenter/index.js";
import { withLiveGuard } from "../toolGuards.js";
import { detailOnlyFormattingSchema } from "../types.js";

// --- Schemas ---

const searchGlslPatternsSchema = detailOnlyFormattingSchema.extend({
	difficulty: z
		.enum(["beginner", "intermediate", "advanced"])
		.describe("Filter by difficulty level")
		.optional(),
	maxResults: z
		.number()
		.int()
		.min(1)
		.max(50)
		.describe("Maximum number of results (default: 10)")
		.optional(),
	query: z
		.string()
		.min(1)
		.describe(
			"Search query — matches against id, title, aliases, summary, tags, type, difficulty",
		)
		.optional(),
	tags: z.array(z.string()).describe("Filter by tags (OR logic)").optional(),
	type: z
		.enum(["pixel", "vertex", "compute", "utility"])
		.describe("Filter by shader type")
		.optional(),
});
type SearchGlslPatternsParams = z.input<typeof searchGlslPatternsSchema>;

const getGlslPatternSchema = detailOnlyFormattingSchema.extend({
	id: z.string().min(1).describe("Pattern ID to retrieve"),
	includeCode: z
		.boolean()
		.describe("Include GLSL source code in response (default: true)")
		.optional(),
	includeSetup: z
		.boolean()
		.describe(
			"Include TD setup instructions (operators, uniforms, connections) in response (default: true)",
		)
		.optional(),
});
type GetGlslPatternParams = z.input<typeof getGlslPatternSchema>;

const deployGlslPatternSchema = detailOnlyFormattingSchema.extend({
	dryRun: z
		.boolean()
		.describe("Preview deploy plan without executing")
		.optional(),
	id: z.string().min(1).describe("Pattern ID to deploy"),
	name: z
		.string()
		.min(1)
		.describe("Custom container name (defaults to pattern ID)")
		.optional(),
	parentPath: z
		.string()
		.min(2)
		.describe("Parent path in TD where the pattern container will be created"),
});
type DeployGlslPatternParams = z.input<typeof deployGlslPatternSchema>;

// --- Local text matching ---

function matchesQuery(entry: TDGlslPatternEntry, query: string): boolean {
	const q = query.toLowerCase();
	const haystacks = [
		entry.id,
		entry.title,
		entry.content.summary,
		...(entry.aliases ?? []),
		...entry.searchKeywords,
		entry.payload.type,
		entry.payload.difficulty,
		...(entry.payload.tags ?? []),
	];
	return haystacks.some((h) => h.toLowerCase().includes(q));
}

// --- Deploy helpers ---

type ToolResponse = {
	content: Array<{ text: string; type: "text" }>;
	isError?: boolean;
};

function validateDeployParams(
	id: string,
	parentPath: string,
	registry: KnowledgeRegistry,
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
	const entry = registry.getById(id);
	if (!entry || entry.kind !== "glsl-pattern") {
		return {
			content: [
				{
					text: `GLSL pattern not found: "${id}". Use search_glsl_patterns to discover available patterns.`,
					type: "text" as const,
				},
			],
			isError: true,
		};
	}
	const pattern = entry as TDGlslPatternEntry;
	if (pattern.payload.type === "utility") {
		return {
			content: [
				{
					text: `Pattern "${id}" is a utility library (no main shader). Utility patterns provide reusable functions — they cannot be deployed as standalone operators.`,
					type: "text" as const,
				},
			],
			isError: true,
		};
	}
	return undefined;
}

function buildGlslDryRunPlan(
	pattern: TDGlslPatternEntry,
	containerName: string,
	parentPath: string,
	id: string,
): Record<string, unknown> {
	return {
		connections: pattern.payload.setup.connections ?? [],
		containerName,
		createdNodes: pattern.payload.setup.operators.map((op) => ({
			family: op.family,
			name: op.name,
			type: op.type,
		})),
		parentPath,
		patternId: id,
		status: "dry_run" as const,
		uniforms: pattern.payload.setup.uniforms ?? [],
	};
}

async function executeGlslDeploy(
	tdClient: TouchDesignerClient,
	pattern: TDGlslPatternEntry,
	containerName: string,
	parentPath: string,
): Promise<Record<string, unknown>> {
	const script = generateGlslDeployScript({
		containerName,
		parentPath,
		pattern,
	});
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

async function runGlslPostChecks(
	tdClient: TouchDesignerClient,
	deployResult: Record<string, unknown>,
): Promise<void> {
	if (
		deployResult.status !== "deployed" ||
		typeof deployResult.path !== "string"
	)
		return;

	let postCheckStatus: string | undefined;

	try {
		const errResult = await tdClient.getNodeErrors({
			nodePath: deployResult.path as string,
		});
		if (errResult.success && errResult.data) {
			const errors = (errResult.data as { errors?: unknown[] }).errors ?? [];
			if (errors.length > 0) {
				deployResult.nodeErrorCount = errors.length;
				postCheckStatus = "warnings";
			}
		}
	} catch {
		/* non-critical */
	}

	const shaderDatPaths = deployResult.shaderDatPaths as string[] | undefined;
	if (shaderDatPaths && shaderDatPaths.length > 0) {
		const glslValidation = await collectGlslValidation(
			tdClient,
			shaderDatPaths,
		);
		deployResult.glslValidation = glslValidation;
		if (glslValidation.some((v) => v.valid === false)) {
			postCheckStatus = "warnings";
		}
	}

	if (postCheckStatus) deployResult.postCheckStatus = postCheckStatus;
}

async function collectGlslValidation(
	tdClient: TouchDesignerClient,
	datPaths: string[],
): Promise<Array<Record<string, unknown>>> {
	const results: Array<Record<string, unknown>> = [];
	for (const datPath of datPaths) {
		try {
			const valResult = await tdClient.validateGlslDat({ nodePath: datPath });
			if (valResult.success && valResult.data) {
				const data = valResult.data as Record<string, unknown>;
				const valid = data.valid ?? data.status === "valid";
				results.push({
					errors: valid ? [] : (data.errors ?? []),
					path: datPath,
					valid,
				});
			} else {
				results.push({
					path: datPath,
					reason: "validation call failed",
					status: "skipped",
				});
			}
		} catch {
			results.push({
				path: datPath,
				reason: "validation unavailable",
				status: "skipped",
			});
		}
	}
	return results;
}

// --- Registration ---

export function registerGlslPatternTools(
	server: McpServer,
	logger: ILogger,
	tdClient: TouchDesignerClient,
	registry: KnowledgeRegistry,
	serverMode: ServerMode,
	snapshotRegistry?: import("../deploy/snapshotRegistry.js").DeploySnapshotRegistry,
): void {
	server.tool(
		TOOL_NAMES.SEARCH_GLSL_PATTERNS,
		"Search the catalogue of GLSL shader patterns by type, difficulty, tags, or text query (offline, no TD connection needed)",
		searchGlslPatternsSchema.strict().shape,
		async (params: SearchGlslPatternsParams = {}) => {
			try {
				const {
					detailLevel,
					difficulty,
					maxResults,
					query,
					responseFormat,
					tags,
					type,
				} = params;
				const limit = maxResults ?? 10;

				// Start from all glsl-pattern entries
				let results = registry.getByKind(
					"glsl-pattern",
				) as TDGlslPatternEntry[];

				// Apply filters
				if (type) {
					results = results.filter((e) => e.payload.type === type);
				}
				if (difficulty) {
					results = results.filter((e) => e.payload.difficulty === difficulty);
				}
				if (tags && tags.length > 0) {
					results = results.filter((e) => {
						const entryTags = e.payload.tags ?? [];
						return tags.some((t) => entryTags.includes(t));
					});
				}
				if (query) {
					results = results.filter((e) => matchesQuery(e, query));
				}

				results = results.slice(0, limit);

				const text = formatGlslPatternSearchResults(results, {
					detailLevel: detailLevel ?? "summary",
					query,
					responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.SEARCH_GLSL_PATTERNS,
					undefined,
					serverMode,
				);
			}
		},
	);

	server.tool(
		TOOL_NAMES.GET_GLSL_PATTERN,
		"Get detailed information about a specific GLSL shader pattern by ID, including source code and TD setup (offline, no TD connection needed)",
		getGlslPatternSchema.strict().shape,
		async (params: GetGlslPatternParams) => {
			try {
				const { detailLevel, id, includeCode, includeSetup, responseFormat } =
					params;
				const entry = registry.getById(id);
				if (!entry || entry.kind !== "glsl-pattern") {
					return {
						content: [
							{
								text: `GLSL pattern not found: "${id}". Use search_glsl_patterns to discover available patterns.`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}
				const text = formatGlslPatternDetail(entry as TDGlslPatternEntry, {
					detailLevel: detailLevel ?? "detailed",
					includeCode: includeCode ?? true,
					includeSetup: includeSetup ?? true,
					responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.GET_GLSL_PATTERN,
					undefined,
					serverMode,
				);
			}
		},
	);

	// --- deploy_glsl_pattern ---

	server.tool(
		TOOL_NAMES.DEPLOY_GLSL_PATTERN,
		"Deploy a GLSL shader pattern into the running TouchDesigner project — creates operators, injects code, wires connections",
		deployGlslPatternSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.DEPLOY_GLSL_PATTERN,
			serverMode,
			tdClient,
			async (params: DeployGlslPatternParams) => {
				try {
					const { detailLevel, dryRun, id, name, parentPath, responseFormat } =
						params;

					const validationError = validateDeployParams(
						id,
						parentPath,
						registry,
					);
					if (validationError) return validationError;

					const pattern = registry.getById(id) as TDGlslPatternEntry;
					const containerName = name ?? id;

					if (dryRun) {
						const plan = buildGlslDryRunPlan(
							pattern,
							containerName,
							parentPath,
							id,
						);
						const text = formatGlslDeployResult(plan, {
							detailLevel,
							responseFormat,
						});
						return { content: [{ text, type: "text" as const }] };
					}

					// Pre-deploy snapshot
					let snapshotId: string | undefined;
					if (snapshotRegistry) {
						snapshotId = await snapshotRegistry.capture(
							tdClient,
							parentPath,
							TOOL_NAMES.DEPLOY_GLSL_PATTERN,
						);
					}

					const deployResult = await executeGlslDeploy(
						tdClient,
						pattern,
						containerName,
						parentPath,
					);
					await runGlslPostChecks(tdClient, deployResult);
					if (snapshotId) {
						deployResult.snapshotId = snapshotId;
					}

					const text = formatGlslDeployResult(deployResult, {
						detailLevel,
						responseFormat,
					});
					return { content: [{ text, type: "text" as const }] };
				} catch (error) {
					return handleToolError(
						error,
						logger,
						TOOL_NAMES.DEPLOY_GLSL_PATTERN,
						undefined,
						serverMode,
					);
				}
			},
		),
	);
}
