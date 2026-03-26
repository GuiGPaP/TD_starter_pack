import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";
import type { ScanData } from "../../lessons/detector.js";
import { detectLessons } from "../../lessons/detector.js";
import { generateSkillProposal } from "../../lessons/enrichment.js";
import { deduplicateId, titleToId } from "../../lessons/idGenerator.js";
import { generateScanLessonScript } from "../../lessons/scanLessonScript.js";
import { writeLessonToBuiltin } from "../../lessons/writer.js";
import type { KnowledgeRegistry } from "../../resources/registry.js";
import type { TDLessonEntry } from "../../resources/types.js";
import {
	formatLessonDetail,
	formatLessonSearchResults,
} from "../presenter/index.js";
import { withLiveGuard } from "../toolGuards.js";
import { detailOnlyFormattingSchema } from "../types.js";

// --- Schemas ---

const searchLessonsSchema = detailOnlyFormattingSchema.extend({
	category: z
		.enum(["pattern", "pitfall"])
		.describe("Filter by lesson category")
		.optional(),
	family: z
		.string()
		.describe("Filter by operator family involved (e.g., TOP, CHOP)")
		.optional(),
	maxResults: z
		.number()
		.int()
		.min(1)
		.max(50)
		.describe("Maximum number of results (default: 10)")
		.optional(),
	minConfidence: z
		.enum(["low", "medium", "high"])
		.describe("Minimum confidence level")
		.optional(),
	query: z
		.string()
		.min(1)
		.describe(
			"Search query — matches against title, summary, tags, operators, symptoms",
		)
		.optional(),
	tags: z.array(z.string()).describe("Filter by tags (OR logic)").optional(),
});
type SearchLessonsParams = z.input<typeof searchLessonsSchema>;

const getLessonSchema = detailOnlyFormattingSchema.extend({
	id: z.string().min(1).describe("Lesson ID to retrieve"),
});
type GetLessonParams = z.input<typeof getLessonSchema>;

const operatorChainItemSchema = z.object({
	family: z
		.string()
		.describe("Operator family (TOP, CHOP, SOP, COMP, DAT, MAT)"),
	opType: z.string().describe("Operator type (e.g., feedbackTOP, noiseTOP)"),
	role: z
		.string()
		.optional()
		.describe("Role in the chain (e.g., input, processor, target)"),
});

const captureLessonSchema = z.object({
	category: z
		.enum(["pattern", "pitfall"])
		.describe("Pattern (positive) or pitfall (negative)"),
	cause: z.string().optional().describe("Root cause (for pitfalls)"),
	code: z.string().optional().describe("Code snippet (Python or GLSL)"),
	codeLanguage: z
		.enum(["python", "glsl", "tscript"])
		.optional()
		.describe("Language of the code snippet"),
	confidence: z
		.enum(["low", "medium", "high"])
		.optional()
		.describe("How confident (default: low)"),
	fix: z.string().optional().describe("How to fix it (for pitfalls)"),
	operatorChain: z
		.array(operatorChainItemSchema)
		.optional()
		.describe("Operators involved"),
	projectName: z
		.string()
		.optional()
		.describe("Project where this was discovered"),
	recipe: z
		.string()
		.optional()
		.describe("How to reproduce the pattern (for patterns)"),
	recipeSteps: z
		.array(z.string())
		.optional()
		.describe("Step-by-step recipe (for patterns)"),
	relatedIds: z
		.array(z.string())
		.optional()
		.describe("Related knowledge entry IDs"),
	summary: z.string().min(10).describe("What was learned"),
	symptom: z.string().optional().describe("What goes wrong (for pitfalls)"),
	tags: z.array(z.string()).min(1).describe("Classification tags"),
	title: z.string().min(1).describe("Lesson title"),
	warnings: z.array(z.string()).optional().describe("Important warnings"),
});
type CaptureLessonParams = z.input<typeof captureLessonSchema>;

// --- Local text matching ---

function matchesQuery(entry: TDLessonEntry, query: string): boolean {
	const q = query.toLowerCase();
	const haystacks = [
		entry.id,
		entry.title,
		entry.content.summary,
		...(entry.aliases ?? []),
		...entry.searchKeywords,
		entry.payload.category,
		...entry.payload.tags,
	];
	if (entry.payload.symptom) haystacks.push(entry.payload.symptom);
	if (entry.payload.cause) haystacks.push(entry.payload.cause);
	if (entry.payload.recipe) haystacks.push(entry.payload.recipe.description);
	if (entry.payload.operatorChain) {
		for (const op of entry.payload.operatorChain) {
			haystacks.push(op.opType, op.family);
		}
	}
	return haystacks.some((h) => h.toLowerCase().includes(q));
}

const CONFIDENCE_RANK: Record<string, number> = {
	high: 2,
	low: 0,
	medium: 1,
};

// --- Registration ---

export function registerLessonTools(
	server: McpServer,
	logger: ILogger,
	registry: KnowledgeRegistry,
	serverMode: ServerMode,
	knowledgePath?: string,
	tdClient?: TouchDesignerClient,
): void {
	server.tool(
		TOOL_NAMES.SEARCH_LESSONS,
		"Search the lessons-learned knowledge base by category, tags, operator family, or text query. Returns patterns (what works) and pitfalls (what breaks) discovered across TD projects.",
		searchLessonsSchema.strict().shape,
		async (params: SearchLessonsParams = {}) => {
			try {
				const {
					category,
					detailLevel,
					family,
					maxResults,
					minConfidence,
					query,
					responseFormat,
					tags,
				} = params;
				const limit = maxResults ?? 10;

				let results = registry.getByKind("lesson") as TDLessonEntry[];

				// Apply filters
				if (category) {
					results = results.filter((e) => e.payload.category === category);
				}
				if (family) {
					const f = family.toUpperCase();
					results = results.filter(
						(e) =>
							e.payload.operatorChain?.some(
								(op) => op.family.toUpperCase() === f,
							) ?? false,
					);
				}
				if (tags && tags.length > 0) {
					results = results.filter((e) =>
						tags.some((t) => e.payload.tags.includes(t)),
					);
				}
				if (minConfidence) {
					const minRank = CONFIDENCE_RANK[minConfidence] ?? 0;
					results = results.filter(
						(e) => (CONFIDENCE_RANK[e.provenance.confidence] ?? 0) >= minRank,
					);
				}
				if (query) {
					results = results.filter((e) => matchesQuery(e, query));
				}

				results = results.slice(0, limit);

				const text = formatLessonSearchResults(results, {
					detailLevel: detailLevel ?? "summary",
					query,
					responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.SEARCH_LESSONS,
					undefined,
					serverMode,
				);
			}
		},
	);

	server.tool(
		TOOL_NAMES.GET_LESSON,
		"Get detailed information about a specific lesson by ID, including recipe steps or pitfall diagnosis (offline, no TD connection needed)",
		getLessonSchema.strict().shape,
		async (params: GetLessonParams) => {
			try {
				const { detailLevel, id, responseFormat } = params;
				const entry = registry.getById(id);
				if (!entry || entry.kind !== "lesson") {
					return {
						content: [
							{
								text: `Lesson not found: "${id}". Use search_lessons to discover available lessons.`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}
				const text = formatLessonDetail(entry as TDLessonEntry, {
					detailLevel: detailLevel ?? "detailed",
					responseFormat,
				});
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.GET_LESSON,
					undefined,
					serverMode,
				);
			}
		},
	);

	// capture_lesson requires a writable knowledge path
	if (knowledgePath) {
		server.tool(
			TOOL_NAMES.CAPTURE_LESSON,
			"Capture a new lesson (pattern or pitfall) from project experience. Structures it as a validated knowledge entry, writes to disk, and makes it immediately searchable.",
			captureLessonSchema.strict().shape,
			async (params: CaptureLessonParams) => {
				try {
					const id = deduplicateId(titleToId(params.title), registry);

					const lesson: TDLessonEntry = {
						aliases: [],
						content: {
							summary: params.summary,
							warnings: params.warnings,
						},
						id,
						kind: "lesson",
						payload: {
							category: params.category,
							cause: params.cause,
							fix: params.fix,
							operatorChain: params.operatorChain,
							recipe: params.recipe
								? {
										description: params.recipe,
										example: params.code
											? {
													code: params.code,
													description: "Code example",
													language: params.codeLanguage,
												}
											: undefined,
										steps: params.recipeSteps,
									}
								: undefined,
							relatedPatternIds: params.relatedIds,
							symptom: params.symptom,
							tags: params.tags,
						},
						provenance: {
							confidence: params.confidence ?? "low",
							discoveredAt: new Date().toISOString().slice(0, 10),
							discoveredIn: params.projectName,
							license: "MIT",
							source: "manual",
							validationCount: 0,
						},
						searchKeywords: [...params.tags],
						title: params.title,
					};

					// Auto-generate skill update proposal for non-low confidence
					if (lesson.provenance.confidence !== "low") {
						const proposal = generateSkillProposal(lesson);
						if (proposal) {
							lesson.payload.skillUpdateProposal = proposal;
						}
					}

					const filePath = writeLessonToBuiltin(lesson, knowledgePath);
					registry.addEntry(lesson);

					logger.sendLog({
						data: `Lesson captured: ${id} → ${filePath}`,
						level: "info",
						logger: "LessonTools",
					});

					const text = formatLessonDetail(lesson, {
						detailLevel: "detailed",
					});
					return {
						content: [
							{
								text: `Lesson captured as **${id}**.\n\n${text}`,
								type: "text" as const,
							},
						],
					};
				} catch (error) {
					return handleToolError(
						error,
						logger,
						TOOL_NAMES.CAPTURE_LESSON,
						undefined,
						serverMode,
					);
				}
			},
		);
	}

	// scan_for_lessons requires live TD + writable knowledge path
	if (tdClient && knowledgePath) {
		const scanForLessonsSchema = detailOnlyFormattingSchema.extend({
			autoCapture: z
				.boolean()
				.describe(
					"Automatically save discovered lessons (default: false, preview only)",
				)
				.optional(),
			maxDepth: z
				.number()
				.int()
				.min(1)
				.max(10)
				.describe("Max depth to scan (default: 5)")
				.optional(),
			rootPath: z
				.string()
				.describe("Root operator path to scan (default: /project1)")
				.optional(),
		});
		type ScanForLessonsParams = z.input<typeof scanForLessonsSchema>;

		server.tool(
			TOOL_NAMES.SCAN_FOR_LESSONS,
			"Scan the live TouchDesigner project to automatically detect patterns (feedback loops, instancing, CHOP exports) and pitfalls (orphan operators, error states). Returns candidates that can be auto-captured as lessons.",
			scanForLessonsSchema.strict().shape,
			withLiveGuard(
				TOOL_NAMES.SCAN_FOR_LESSONS,
				serverMode,
				tdClient,
				async (params: ScanForLessonsParams) => {
					try {
						const rootPath = params.rootPath ?? "/project1";
						const maxDepth = params.maxDepth ?? 5;
						const autoCapture = params.autoCapture ?? false;

						// Generate and execute scan script in TD
						const script = generateScanLessonScript(rootPath, maxDepth);
						const scriptResult = await tdClient.execPythonScript<{
							result: ScanData;
						}>({ mode: "read-only", script });

						if (!scriptResult.success) {
							return {
								content: [
									{
										text: `Scan failed: ${scriptResult.error}`,
										type: "text" as const,
									},
								],
								isError: true,
							};
						}

						const scanData = scriptResult.data?.result;
						if (!scanData) {
							return {
								content: [
									{
										text: "Scan returned no data.",
										type: "text" as const,
									},
								],
								isError: true,
							};
						}

						// Run detector heuristics
						const candidates = detectLessons(scanData, registry);

						// Auto-capture new candidates if requested
						const captured: string[] = [];
						if (autoCapture && knowledgePath) {
							for (const c of candidates) {
								if (c.matchesExisting) continue;
								const id = deduplicateId(titleToId(c.title), registry);
								const lesson: TDLessonEntry = {
									aliases: [],
									content: { summary: c.summary },
									id,
									kind: "lesson",
									payload: {
										category: c.category,
										operatorChain: c.operatorChain,
										tags: c.tags,
									},
									provenance: {
										confidence: c.confidence,
										discoveredAt: new Date().toISOString().slice(0, 10),
										discoveredIn: rootPath,
										license: "MIT",
										source: "auto-scan",
										validationCount: 0,
									},
									searchKeywords: [...c.tags],
									title: c.title,
								};
								writeLessonToBuiltin(lesson, knowledgePath);
								registry.addEntry(lesson);
								captured.push(id);
							}
						}

						// Format results
						const lines: string[] = [
							`## Scan Results for ${rootPath}`,
							"",
							`Scanned ${scanData.operators.length} operators, ${scanData.connections.length} connections.`,
							"",
							`**${candidates.length} candidate(s) found:**`,
							"",
						];

						for (const c of candidates) {
							const badge =
								c.category === "pitfall" ? "[PITFALL]" : "[PATTERN]";
							const match = c.matchesExisting
								? ` (matches: ${c.matchesExisting})`
								: "";
							lines.push(`- **${c.title}** ${badge} (${c.confidence})${match}`);
							lines.push(`  ${c.summary}`);
							lines.push(`  Tags: ${c.tags.join(", ")}`);
						}

						if (captured.length > 0) {
							lines.push(
								"",
								`**Auto-captured ${captured.length} lesson(s):** ${captured.join(", ")}`,
							);
						}

						return {
							content: [{ text: lines.join("\n"), type: "text" as const }],
						};
					} catch (error) {
						return handleToolError(
							error,
							logger,
							TOOL_NAMES.SCAN_FOR_LESSONS,
							undefined,
							serverMode,
						);
					}
				},
			),
		);
	}
}
