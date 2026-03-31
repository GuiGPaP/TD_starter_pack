import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { KnowledgeRegistry } from "../../resources/registry.js";
import type { TDTechniqueEntry } from "../../resources/types.js";
import {
	formatTechniqueDetail,
	formatTechniqueSearchResults,
} from "../presenter/index.js";
import { detailOnlyFormattingSchema } from "../types.js";

// --- Schemas ---

const searchTechniquesSchema = detailOnlyFormattingSchema.extend({
	category: z
		.enum([
			"gpu-compute",
			"ml",
			"audio-visual",
			"networking",
			"python-advanced",
			"generative",
		])
		.describe("Filter by technique category")
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
		.describe(
			"Search query — matches against title, tags, operators, category",
		)
		.optional(),
	tags: z.array(z.string()).describe("Filter by tags (OR logic)").optional(),
});
type SearchTechniquesParams = z.input<typeof searchTechniquesSchema>;

const getTechniqueSchema = detailOnlyFormattingSchema.extend({
	id: z.string().min(1).describe("Technique ID to retrieve"),
});
type GetTechniqueParams = z.input<typeof getTechniqueSchema>;

// --- Local matching ---

function matchesTechniqueQuery(
	entry: TDTechniqueEntry,
	params: SearchTechniquesParams,
): boolean {
	const p = entry.payload;

	if (params.category && p.category !== params.category) return false;
	if (params.difficulty && p.difficulty !== params.difficulty) return false;
	if (params.tags && params.tags.length > 0) {
		const entryTags = new Set(p.tags);
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
			p.difficulty,
			...p.tags,
			...(p.operatorChain ?? []).map((o) => o.opType),
			...(p.operatorChain ?? []).map((o) => o.family),
		];
		if (!haystacks.some((h) => h.toLowerCase().includes(q))) return false;
	}

	return true;
}

// --- Registration ---

export function registerTechniqueTools(
	server: McpServer,
	logger: ILogger,
	registry: KnowledgeRegistry,
	_serverMode: ServerMode,
): void {
	// search_techniques
	server.tool(
		TOOL_NAMES.SEARCH_TECHNIQUES,
		"Search techniques by query, category, difficulty, or tags (offline)",
		searchTechniquesSchema.strict().shape,
		async (params: SearchTechniquesParams = {}) => {
			try {
				const allTechniques = registry
					.getByKind("technique")
					.filter(
						(e): e is TDTechniqueEntry => e.kind === "technique",
					);

				const matches = allTechniques.filter((e) =>
					matchesTechniqueQuery(e, params),
				);

				const limit = params.maxResults ?? 10;
				const results = matches.slice(0, limit);

				const text = formatTechniqueSearchResults(results, {
					detailLevel: params.detailLevel ?? "summary",
					query: params.query,
					responseFormat: params.responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.SEARCH_TECHNIQUES,
				);
			}
		},
	);

	// get_technique
	server.tool(
		TOOL_NAMES.GET_TECHNIQUE,
		"Get a complete technique by ID with code snippets, operator chain, and tips (offline)",
		getTechniqueSchema.strict().shape,
		async (params: GetTechniqueParams) => {
			try {
				const entry = registry.getById(params.id);

				if (!entry || entry.kind !== "technique") {
					const allIds = registry
						.getIndexByKind("technique")
						.map((e) => e.id)
						.join(", ");
					return {
						content: [
							{
								text: `Technique '${params.id}' not found. Available: ${allIds || "(none)"}`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				const text = formatTechniqueDetail(
					entry as TDTechniqueEntry,
					{
						detailLevel: params.detailLevel ?? "summary",
						responseFormat: params.responseFormat,
					},
				);
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.GET_TECHNIQUE,
				);
			}
		},
	);
}
