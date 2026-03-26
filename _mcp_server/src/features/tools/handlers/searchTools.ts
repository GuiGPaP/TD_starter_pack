import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { FusionService } from "../../resources/fusionService.js";
import type { KnowledgeRegistry } from "../../resources/registry.js";
import type { TDKnowledgeEntry } from "../../resources/types.js";
import {
	normalizeTdVersion,
	type VersionManifest,
} from "../../resources/versionManifest.js";
import { scoreOperator } from "../presenter/operatorScorer.js";
import {
	formatOperatorComparison,
	formatOperatorSearchResults,
} from "../presenter/searchFormatter.js";
import { detailOnlyFormattingSchema } from "../types.js";

const searchOperatorsSchema = z.object({
	...detailOnlyFormattingSchema.shape,
	family: z
		.string()
		.toUpperCase()
		.describe(
			"Filter by operator family (TOP, CHOP, SOP, COMP, DAT, MAT, or third-party prefixes like T3D, LOP, POPx)",
		)
		.optional(),
	includeExamples: z
		.boolean()
		.describe("Include code examples in results (default: false)")
		.optional(),
	maxResults: z
		.number()
		.int()
		.min(1)
		.max(50)
		.describe("Max results (default: 10)")
		.optional(),
	query: z.string().describe('Search query, e.g. "noise feedback"'),
	version: z
		.string()
		.describe("Filter by TD version compatibility, e.g. '2023'")
		.optional(),
});
type SearchOperatorsParams = z.input<typeof searchOperatorsSchema>;

const compareOperatorsSchema = z.object({
	...detailOnlyFormattingSchema.shape,
	op1: z.string().describe("First operator ID or opType"),
	op2: z.string().describe("Second operator ID or opType"),
});
type CompareOperatorsParams = z.input<typeof compareOperatorsSchema>;

function lookupOperator(
	registry: KnowledgeRegistry,
	idOrOpType: string,
): TDKnowledgeEntry | undefined {
	return registry.getById(idOrOpType) ?? registry.getByOpType(idOrOpType);
}

export function registerSearchTools(
	server: McpServer,
	logger: ILogger,
	registry: KnowledgeRegistry,
	versionManifest: VersionManifest,
	_fusionService: FusionService,
	serverMode: ServerMode,
): void {
	// ── search_operators ─────────────────────────────────────────
	server.tool(
		TOOL_NAMES.SEARCH_OPERATORS,
		"Search the operator knowledge base with scored results. Works offline.",
		searchOperatorsSchema.strict().shape,
		async (params: SearchOperatorsParams) => {
			try {
				const {
					detailLevel,
					family,
					includeExamples,
					maxResults = 10,
					query,
					responseFormat,
					version,
				} = params;

				const operators = registry.getByKind("operator");

				// Filter by family
				let candidates = family
					? operators.filter(
							(e) =>
								e.kind === "operator" &&
								e.payload.opFamily.toUpperCase() === family.toUpperCase(),
						)
					: operators;

				// Filter by version compatibility
				if (version) {
					candidates = candidates.filter((e) => {
						if (e.kind !== "operator") return true;
						const compat = versionManifest.checkCompatibility(
							e.payload.versions,
							version,
						);
						return compat.level !== "unavailable";
					});
				}

				// Score
				const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
				let scored = candidates
					.map((entry) => ({
						entry,
						score: scoreOperator(entry, terms),
					}))
					.filter((r) => r.score > 0);

				// Soft fallback: if AND produced 0 results, try OR
				if (scored.length === 0 && terms.length > 1) {
					scored = candidates
						.map((entry) => {
							let bestScore = 0;
							for (const term of terms) {
								const s = scoreOperator(entry, [term]);
								if (s > bestScore) bestScore = s;
							}
							return { entry, score: bestScore };
						})
						.filter((r) => r.score > 0);
				}

				// Deprecation penalty
				const tdVersion = normalizeTdVersion(serverMode.tdBuild ?? "");
				for (const r of scored) {
					if (r.entry.kind === "operator") {
						const compat = versionManifest.checkCompatibility(
							r.entry.payload.versions,
							tdVersion,
						);
						if (compat.level === "deprecated") {
							r.score -= 30;
						}
					}
				}

				scored.sort((a, b) => b.score - a.score);
				const results = scored.slice(0, maxResults);

				const text = formatOperatorSearchResults(
					query,
					results.map((r) => ({
						compatibility: versionManifest.checkCompatibility(
							r.entry.kind === "operator"
								? r.entry.payload.versions
								: undefined,
							tdVersion,
						),
						entry: r.entry,
						score: r.score,
					})),
					{
						detailLevel: detailLevel ?? "summary",
						includeExamples: includeExamples ?? false,
						responseFormat,
					},
				);

				return {
					content: [{ text, type: "text" as const }],
				};
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.SEARCH_OPERATORS);
			}
		},
	);

	// ── compare_operators ────────────────────────────────────────
	server.tool(
		TOOL_NAMES.COMPARE_OPERATORS,
		"Compare two operators side-by-side (parameters, family, version). Works offline, enriched when TD is connected.",
		compareOperatorsSchema.strict().shape,
		async (params: CompareOperatorsParams) => {
			try {
				const { detailLevel, op1, op2, responseFormat } = params;

				const entry1 = lookupOperator(registry, op1);
				const entry2 = lookupOperator(registry, op2);

				if (!entry1 || entry1.kind !== "operator") {
					return {
						content: [
							{
								text: `Operator not found: "${op1}". Use search_operators to find available operators.`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}
				if (!entry2 || entry2.kind !== "operator") {
					return {
						content: [
							{
								text: `Operator not found: "${op2}". Use search_operators to find available operators.`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				const tdVersion = normalizeTdVersion(serverMode.tdBuild ?? "");

				const text = formatOperatorComparison(
					entry1,
					entry2,
					{
						compat1: versionManifest.checkCompatibility(
							entry1.payload.versions,
							tdVersion,
						),
						compat2: versionManifest.checkCompatibility(
							entry2.payload.versions,
							tdVersion,
						),
					},
					{
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					},
				);

				return {
					content: [{ text, type: "text" as const }],
				};
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.COMPARE_OPERATORS);
			}
		},
	);
}
