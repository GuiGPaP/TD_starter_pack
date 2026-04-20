import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { SnippetRegistry } from "../../snippets/registry.js";
import {
	formatSnippetDetail,
	formatSnippetSearchResults,
} from "../presenter/index.js";
import { detailOnlyFormattingSchema } from "../types.js";

// ── Schemas ───────────────────────────────────────────────────────

const searchSnippetsSchema = detailOnlyFormattingSchema.extend({
	family: z
		.enum(["CHOP", "COMP", "DAT", "MAT", "POP", "SOP", "TOP"])
		.describe("Filter by operator family")
		.optional(),
	maxResults: z
		.number()
		.int()
		.min(1)
		.max(50)
		.describe("Maximum number of results (default: 10)")
		.optional(),
	opType: z
		.string()
		.describe("Filter by opType — find snippets demonstrating this operator")
		.optional(),
	query: z
		.string()
		.min(1)
		.describe("Search query — matches against snippet ID, opType, readMe text")
		.optional(),
});
type SearchSnippetsParams = z.input<typeof searchSnippetsSchema>;

const getSnippetSchema = detailOnlyFormattingSchema.extend({
	id: z.string().min(1).describe("Snippet ID (e.g. 'noise-top', 'phong-mat')"),
});
type GetSnippetParams = z.input<typeof getSnippetSchema>;

// ── Registration ──────────────────────────────────────────────────

export function registerSnippetTools(
	server: McpServer,
	logger: ILogger,
	snippetRegistry: SnippetRegistry,
): void {
	// ── search_snippets ───────────────────────────────────────────
	server.tool(
		TOOL_NAMES.SEARCH_SNIPPETS,
		"Search locally extracted Operator Snippets data — examples with readMe explanations and network patterns (offline)",
		searchSnippetsSchema.strict().shape,
		async (params: SearchSnippetsParams = {}) => {
			try {
				if (!snippetRegistry.isLoaded) {
					return {
						content: [
							{
								text: "Operator Snippets not available. Run the extraction script to generate snippets_data/.",
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				const {
					detailLevel,
					family,
					maxResults,
					opType,
					query,
					responseFormat,
				} = params;

				const results = snippetRegistry.search({
					family,
					maxResults,
					opType,
					query,
				});

				const text = formatSnippetSearchResults(results, {
					detailLevel: detailLevel ?? "summary",
					query,
					responseFormat,
				});

				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.SEARCH_SNIPPETS);
			}
		},
	);

	// ── get_snippet ───────────────────────────────────────────────
	server.tool(
		TOOL_NAMES.GET_SNIPPET,
		"Get full detail from locally extracted Operator Snippets data — readMe, operators, connections, embedded code, CHOP exports (offline)",
		getSnippetSchema.strict().shape,
		async (params: GetSnippetParams) => {
			try {
				if (!snippetRegistry.isLoaded) {
					return {
						content: [
							{
								text: "Operator Snippets not available. Run the extraction script to generate snippets_data/.",
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				const { detailLevel, id, responseFormat } = params;

				const snippet = snippetRegistry.getById(id);
				if (!snippet) {
					return {
						content: [
							{
								text: `Snippet not found: "${id}". Use search_snippets to discover available snippets.`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				const text = formatSnippetDetail(snippet, {
					detailLevel: detailLevel ?? "detailed",
					responseFormat,
				});

				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.GET_SNIPPET);
			}
		},
	);
}
