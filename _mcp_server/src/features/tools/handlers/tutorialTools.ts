import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { KnowledgeRegistry } from "../../resources/registry.js";
import type { TDTutorialEntry } from "../../resources/types.js";
import {
	formatTutorialDetail,
	formatTutorialSearchResults,
} from "../presenter/index.js";
import { detailOnlyFormattingSchema } from "../types.js";

// --- Schemas ---

const searchTutorialsSchema = detailOnlyFormattingSchema.extend({
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
			"Search query — matches against title, tags, sections, operators",
		)
		.optional(),
	tags: z.array(z.string()).describe("Filter by tags (OR logic)").optional(),
});
type SearchTutorialsParams = z.input<typeof searchTutorialsSchema>;

const getTutorialSchema = detailOnlyFormattingSchema.extend({
	id: z.string().min(1).describe("Tutorial ID to retrieve"),
});
type GetTutorialParams = z.input<typeof getTutorialSchema>;

// --- Local matching ---

function matchesTutorialQuery(
	entry: TDTutorialEntry,
	params: SearchTutorialsParams,
): boolean {
	const p = entry.payload;

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
			p.difficulty,
			...p.tags,
			...p.relatedOperators,
			...p.sections.map((s) => s.title),
		];
		if (!haystacks.some((h) => h.toLowerCase().includes(q))) return false;
	}

	return true;
}

// --- Registration ---

export function registerTutorialTools(
	server: McpServer,
	logger: ILogger,
	registry: KnowledgeRegistry,
	_serverMode: ServerMode,
): void {
	// search_tutorials
	server.tool(
		TOOL_NAMES.SEARCH_TUTORIALS,
		"Search tutorials by query, difficulty, or tags. Full-text search across sections (offline)",
		searchTutorialsSchema.strict().shape,
		async (params: SearchTutorialsParams = {}) => {
			try {
				const allTutorials = registry
					.getByKind("tutorial")
					.filter(
						(e): e is TDTutorialEntry => e.kind === "tutorial",
					);

				const matches = allTutorials.filter((e) =>
					matchesTutorialQuery(e, params),
				);

				const limit = params.maxResults ?? 10;
				const results = matches.slice(0, limit);

				const text = formatTutorialSearchResults(results, {
					detailLevel: params.detailLevel ?? "summary",
					query: params.query,
					responseFormat: params.responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.SEARCH_TUTORIALS,
				);
			}
		},
	);

	// get_tutorial
	server.tool(
		TOOL_NAMES.GET_TUTORIAL,
		"Get a complete tutorial by ID with all sections and code examples (offline)",
		getTutorialSchema.strict().shape,
		async (params: GetTutorialParams) => {
			try {
				const entry = registry.getById(params.id);

				if (!entry || entry.kind !== "tutorial") {
					const allIds = registry
						.getIndexByKind("tutorial")
						.map((e) => e.id)
						.join(", ");
					return {
						content: [
							{
								text: `Tutorial '${params.id}' not found. Available: ${allIds || "(none)"}`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				const text = formatTutorialDetail(
					entry as TDTutorialEntry,
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
					TOOL_NAMES.GET_TUTORIAL,
				);
			}
		},
	);
}
