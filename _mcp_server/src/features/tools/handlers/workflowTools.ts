import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { KnowledgeRegistry } from "../../resources/registry.js";
import type { TDWorkflowPatternEntry } from "../../resources/types.js";
import {
	formatSuggestWorkflow,
	formatWorkflowDetail,
	formatWorkflowSearchResults,
} from "../presenter/index.js";
import { detailOnlyFormattingSchema } from "../types.js";

// --- Schemas ---

const searchWorkflowPatternsSchema = detailOnlyFormattingSchema.extend({
	category: z
		.string()
		.describe("Filter by workflow category (e.g., generative, audio-visual)")
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
type SearchWorkflowPatternsParams = z.input<
	typeof searchWorkflowPatternsSchema
>;

const getWorkflowPatternSchema = detailOnlyFormattingSchema.extend({
	id: z.string().min(1).describe("Workflow pattern ID to retrieve"),
});
type GetWorkflowPatternParams = z.input<typeof getWorkflowPatternSchema>;

const suggestWorkflowSchema = detailOnlyFormattingSchema.extend({
	family: z
		.string()
		.describe(
			"Operator family to suggest for (e.g., TOP, CHOP). Used if opType not given.",
		)
		.optional(),
	opType: z
		.string()
		.describe(
			"Operator type to get suggestions for (e.g., noiseTOP, feedbackTOP)",
		)
		.optional(),
});
type SuggestWorkflowParams = z.input<typeof suggestWorkflowSchema>;

// --- Transitions loader ---

interface TransitionEntry {
	family: string;
	opType: string;
	port: number;
	reason: string;
}

interface TransitionsData {
	[opType: string]: {
		downstream: TransitionEntry[];
		upstream: TransitionEntry[];
	};
}

let cachedTransitions: TransitionsData | null = null;

function loadTransitions(
	knowledgePath: string,
	logger: ILogger,
): TransitionsData {
	if (cachedTransitions) return cachedTransitions;

	const filePath = join(knowledgePath, "..", "workflow-transitions", "transitions.json");
	if (!existsSync(filePath)) {
		logger.sendLog({
			data: `Transitions file not found: ${filePath}`,
			level: "warning",
		});
		return {};
	}

	try {
		const raw = readFileSync(filePath, "utf-8");
		cachedTransitions = JSON.parse(raw) as TransitionsData;
		return cachedTransitions;
	} catch (error) {
		logger.sendLog({
			data: `Failed to load transitions: ${error}`,
			level: "warning",
		});
		return {};
	}
}

// --- Local matching ---

function matchesWorkflowQuery(
	entry: TDWorkflowPatternEntry,
	params: SearchWorkflowPatternsParams,
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
		];
		if (!haystacks.some((h) => h.toLowerCase().includes(q))) return false;
	}

	return true;
}

// --- Registration ---

export function registerWorkflowTools(
	server: McpServer,
	logger: ILogger,
	registry: KnowledgeRegistry,
	_serverMode: ServerMode,
	knowledgePath?: string,
): void {
	// search_workflow_patterns
	server.tool(
		TOOL_NAMES.SEARCH_WORKFLOW_PATTERNS,
		"Search workflow patterns by query, category, difficulty, or tags (offline)",
		searchWorkflowPatternsSchema.strict().shape,
		async (params: SearchWorkflowPatternsParams) => {
			try {
				const allWorkflows = registry
					.getByKind("workflow")
					.filter((e): e is TDWorkflowPatternEntry => e.kind === "workflow");

				const matches = allWorkflows.filter((e) =>
					matchesWorkflowQuery(e, params),
				);

				const limit = params.maxResults ?? 10;
				const results = matches.slice(0, limit);

				const text = formatWorkflowSearchResults(results, {
					detailLevel: params.detailLevel ?? "summary",
					query: params.query,
					responseFormat: params.responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.SEARCH_WORKFLOW_PATTERNS,
				);
			}
		},
	);

	// get_workflow_pattern
	server.tool(
		TOOL_NAMES.GET_WORKFLOW_PATTERN,
		"Get a complete workflow pattern by ID with operators and connections (offline)",
		getWorkflowPatternSchema.strict().shape,
		async (params: GetWorkflowPatternParams) => {
			try {
				const entry = registry.getById(params.id);

				if (!entry || entry.kind !== "workflow") {
					const allIds = registry
						.getWorkflowIndex()
						.map((e) => e.id)
						.join(", ");
					return {
						content: [
							{
								text: `Workflow pattern '${params.id}' not found. Available: ${allIds || "(none)"}`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				const text = formatWorkflowDetail(entry as TDWorkflowPatternEntry, {
					detailLevel: params.detailLevel ?? "summary",
					responseFormat: params.responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.GET_WORKFLOW_PATTERN);
			}
		},
	);

	// suggest_workflow
	server.tool(
		TOOL_NAMES.SUGGEST_WORKFLOW,
		"Get workflow suggestions for an operator: typical upstream/downstream connections and related patterns (offline)",
		suggestWorkflowSchema.strict().shape,
		async (params: SuggestWorkflowParams) => {
			try {
				if (!params.opType && !params.family) {
					return {
						content: [
							{
								text: "Provide either opType or family to get workflow suggestions.",
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				const opType = params.opType ?? "";

				// Load transitions
				const basePath = knowledgePath ?? "";
				const transitions = loadTransitions(basePath, logger);
				const opTransitions = transitions[opType] ?? {
					downstream: [],
					upstream: [],
				};

				// Find related workflow patterns
				const allWorkflows = registry
					.getByKind("workflow")
					.filter((e): e is TDWorkflowPatternEntry => e.kind === "workflow");

				const searchTerm = (params.opType ?? params.family ?? "").toLowerCase();
				const relatedPatterns = allWorkflows.filter((e) => {
					const ops = e.payload.operators;
					return ops.some(
						(o) =>
							o.opType.toLowerCase().includes(searchTerm) ||
							o.family.toLowerCase().includes(searchTerm),
					);
				});

				const text = formatSuggestWorkflow(
					opType || params.family || "unknown",
					{
						downstream: opTransitions.downstream.map((t) => ({
							...t,
							direction: "downstream" as const,
						})),
						upstream: opTransitions.upstream.map((t) => ({
							...t,
							direction: "upstream" as const,
						})),
					},
					relatedPatterns.slice(0, 5),
					{
						detailLevel: params.detailLevel ?? "summary",
						responseFormat: params.responseFormat,
					},
				);
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.SUGGEST_WORKFLOW);
			}
		},
	);
}
