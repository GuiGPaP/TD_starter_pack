import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";
import type { KnowledgeRegistry } from "../../resources/registry.js";
import type { TDTemplateEntry } from "../../resources/types.js";
import {
	formatDeployTemplateResult,
	formatTemplateDetail,
	formatTemplateSearchResults,
} from "../presenter/index.js";
import { withLiveGuard } from "../toolGuards.js";
import { detailOnlyFormattingSchema } from "../types.js";

// --- Schemas ---

const searchTemplatesSchema = detailOnlyFormattingSchema.extend({
	category: z
		.string()
		.describe("Filter by template category (e.g., generative, media, 3d)")
		.optional(),
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
		.describe("Search query — matches against title, tags, operators, category")
		.optional(),
	tags: z.array(z.string()).describe("Filter by tags (OR logic)").optional(),
});
type SearchTemplatesParams = z.input<typeof searchTemplatesSchema>;

const getTemplateSchema = detailOnlyFormattingSchema.extend({
	id: z.string().min(1).describe("Network template ID to retrieve"),
});
type GetTemplateParams = z.input<typeof getTemplateSchema>;

const deployTemplateSchema = detailOnlyFormattingSchema.extend({
	dryRun: z
		.boolean()
		.describe("Preview deploy plan without executing")
		.optional(),
	id: z.string().min(1).describe("Template ID to deploy"),
	parentPath: z
		.string()
		.min(1)
		.describe("Parent COMP path to deploy into (e.g., /project1)"),
});
type DeployTemplateParams = z.input<typeof deployTemplateSchema>;

// --- Local matching ---

function matchesTemplateQuery(
	entry: TDTemplateEntry,
	params: SearchTemplatesParams,
): boolean {
	const p = entry.payload;

	if (params.category && p.category !== params.category) return false;
	if (params.difficulty && p.difficulty !== params.difficulty) return false;
	if (params.tags && params.tags.length > 0) {
		const entryTags = new Set(p.tags ?? []);
		if (!params.tags.some((t) => entryTags.has(t))) return false;
	}

	if (params.query) {
		const q = params.query.toLowerCase();
		const haystacks = [
			entry.id,
			entry.title,
			entry.content.summary,
			...(entry.aliases ?? []),
			...entry.searchKeywords,
			p.category,
			...(p.tags ?? []),
			...p.operators.map((o) => o.opType),
			...p.operators.map((o) => o.family),
			...p.operators.map((o) => o.name),
		];
		if (!haystacks.some((h) => h.toLowerCase().includes(q))) return false;
	}

	return true;
}

// --- Deploy helpers ---

interface TemplateDeployResult {
	connections: number;
	errors: string[];
	operators: string[];
	parameters: number;
	parentPath: string;
	templateId: string;
}

function pushCreateOperatorLines(
	lines: string[],
	operators: TDTemplateEntry["payload"]["operators"],
): void {
	for (const op of operators) {
		const x = op.x ?? 0;
		const y = op.y ?? 0;
		lines.push(
			"try:",
			`    n = parent_node.create("${op.opType}", "${op.name}")`,
			`    n.nodeX = ${x}`,
			`    n.nodeY = ${y}`,
			`    created_ops["${op.name}"] = n`,
			"except Exception as e:",
			`    errors.append(f"Failed to create ${op.name}: {e}")`,
			"",
		);
	}
}

function pushConnectionLines(
	lines: string[],
	connections: TDTemplateEntry["payload"]["connections"],
): void {
	lines.push("# Wire connections", "conn_count = 0");
	for (const c of connections) {
		lines.push(
			"try:",
			`    from_op = created_ops.get("${c.from}")`,
			`    to_op = created_ops.get("${c.to}")`,
			"    if from_op and to_op:",
			`        to_op.inputConnectors[${c.toInput}].connect(from_op.outputConnectors[${c.fromOutput}])`,
			"        conn_count += 1",
			"except Exception as e:",
			`    errors.append(f"Failed to connect ${c.from} -> ${c.to}: {e}")`,
			"",
		);
	}
}

function pushParameterLines(
	lines: string[],
	parameters: Record<string, unknown> | undefined,
): void {
	lines.push("# Set parameters", "param_count = 0");
	if (!parameters) return;
	for (const [opName, params] of Object.entries(parameters)) {
		for (const [parName, parValue] of Object.entries(
			params as Record<string, unknown>,
		)) {
			lines.push(
				"try:",
				`    n = created_ops.get("${opName}")`,
				`    if n and hasattr(n.par, "${parName}"):`,
				`        n.par.${parName}.val = ${JSON.stringify(parValue)}`,
				"        param_count += 1",
				"except Exception as e:",
				`    errors.append(f"Failed to set ${opName}.${parName}: {e}")`,
				"",
			);
		}
	}
}

function buildTemplateDeployScript(
	template: TDTemplateEntry,
	parentPath: string,
	templateId: string,
): string {
	const p = template.payload;
	const lines: string[] = [
		`parent_path = "${parentPath}"`,
		"parent_node = op(parent_path)",
		"if parent_node is None or not parent_node.valid:",
		`    raise ValueError(f"Parent COMP not found: {parent_path}")`,
		"if not parent_node.isCOMP:",
		`    raise ValueError(f"Target must be a COMP: {parent_path}")`,
		"",
		"created_ops = {}",
		"errors = []",
		"",
		"# Create operators",
	];
	pushCreateOperatorLines(lines, p.operators);
	pushConnectionLines(lines, p.connections);
	pushParameterLines(lines, p.parameters);
	lines.push(
		"result = {",
		`    "templateId": "${templateId}",`,
		`    "parentPath": parent_path,`,
		`    "operators": [f"{parent_path}/{name}" for name in created_ops],`,
		`    "connections": conn_count,`,
		`    "parameters": param_count,`,
		`    "errors": errors,`,
		"}",
	);
	return lines.join("\n");
}

// --- Registration ---

export function registerNetworkTemplateTools(
	server: McpServer,
	logger: ILogger,
	registry: KnowledgeRegistry,
	serverMode: ServerMode,
	tdClient: TouchDesignerClient,
	snapshotRegistry?: import("../deploy/snapshotRegistry.js").DeploySnapshotRegistry,
): void {
	// search_network_templates
	server.tool(
		TOOL_NAMES.SEARCH_NETWORK_TEMPLATES,
		"Search deployable network templates by query, category, difficulty, or tags (offline)",
		searchTemplatesSchema.strict().shape,
		async (params: SearchTemplatesParams) => {
			try {
				const all = registry
					.getByKind("template")
					.filter((e): e is TDTemplateEntry => e.kind === "template");

				const matches = all.filter((e) => matchesTemplateQuery(e, params));
				const limit = params.maxResults ?? 10;
				const results = matches.slice(0, limit);

				const text = formatTemplateSearchResults(results, {
					detailLevel: params.detailLevel ?? "summary",
					responseFormat: params.responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.SEARCH_NETWORK_TEMPLATES,
				);
			}
		},
	);

	// get_network_template
	server.tool(
		TOOL_NAMES.GET_NETWORK_TEMPLATE,
		"Get a complete network template with operators, connections, and parameters (offline)",
		getTemplateSchema.strict().shape,
		async (params: GetTemplateParams) => {
			try {
				const entry = registry.getById(params.id);

				if (!entry || entry.kind !== "template") {
					const allIds = registry
						.getIndexByKind("template")
						.map((e) => e.id)
						.join(", ");
					return {
						content: [
							{
								text: `Template '${params.id}' not found. Available: ${allIds || "(none)"}`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				const text = formatTemplateDetail(entry as TDTemplateEntry, {
					detailLevel: params.detailLevel ?? "summary",
					responseFormat: params.responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.GET_NETWORK_TEMPLATE);
			}
		},
	);

	// deploy_network_template (requires live TD)
	server.tool(
		TOOL_NAMES.DEPLOY_NETWORK_TEMPLATE,
		"Deploy a network template into TouchDesigner: creates operators, wires connections, sets parameters",
		deployTemplateSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.DEPLOY_NETWORK_TEMPLATE,
			serverMode,
			tdClient,
			async (params: DeployTemplateParams) => {
				try {
					const entry = registry.getById(params.id);
					if (!entry || entry.kind !== "template") {
						return {
							content: [
								{
									text: `Template '${params.id}' not found.`,
									type: "text" as const,
								},
							],
							isError: true,
						};
					}

					const tpl = entry as TDTemplateEntry;
					const script = buildTemplateDeployScript(
						tpl,
						params.parentPath,
						params.id,
					);

					if (params.dryRun) {
						const plan = {
							connections: tpl.payload.connections?.length ?? 0,
							operators: tpl.payload.operators.map((o) => ({
								name: o.name,
								opType: o.opType,
								path: `${params.parentPath}/${o.name}`,
							})),
							parameters: tpl.payload.parameters?.length ?? 0,
							parentPath: params.parentPath,
							script,
							status: "dry_run" as const,
							templateId: params.id,
						};
						const text = [
							`## Dry-run: ${params.id} → ${params.parentPath}`,
							"",
							`Would create ${plan.operators.length} operator(s), ${plan.connections} connection(s), ${plan.parameters} parameter(s).`,
							"",
							"### Operators",
							...plan.operators.map((o) => `- \`${o.path}\` (${o.opType})`),
							"",
							"### Script preview",
							"```python",
							script,
							"```",
						].join("\n");
						return { content: [{ text, type: "text" as const }] };
					}

					// Pre-deploy snapshot
					let snapshotId: string | undefined;
					if (snapshotRegistry) {
						snapshotId = await snapshotRegistry.capture(
							tdClient,
							params.parentPath,
							TOOL_NAMES.DEPLOY_NETWORK_TEMPLATE,
						);
					}

					const execResult = await tdClient.execPythonScript({
						mode: "full-exec",
						script,
					});
					if (!execResult.success) throw execResult.error;

					const data = execResult.data as { result?: TemplateDeployResult };
					const deployResult = data?.result ?? {
						connections: 0,
						errors: ["No result returned from deploy script"],
						operators: [],
						parameters: 0,
						parentPath: params.parentPath,
						templateId: params.id,
					};

					if (snapshotId) {
						(deployResult as unknown as Record<string, unknown>).snapshotId =
							snapshotId;
					}

					const text = formatDeployTemplateResult(deployResult, {
						detailLevel: params.detailLevel ?? "summary",
						responseFormat: params.responseFormat,
					});
					return { content: [{ text, type: "text" as const }] };
				} catch (error) {
					return handleToolError(
						error,
						logger,
						TOOL_NAMES.DEPLOY_NETWORK_TEMPLATE,
						undefined,
						serverMode,
					);
				}
			},
		),
	);
}
