import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";
import {
	buildIndexPaletteScript,
	buildLoadPaletteScript,
	indexFileName,
	type PaletteIndex,
	PaletteRegistry,
	paletteIndexSchema,
	readIndex,
	resolveIndexCacheDir,
	writeIndex,
} from "../../palette/index.js";
import {
	formatIndexResult,
	formatLoadResult,
	formatPaletteSearchResults,
} from "../presenter/paletteFormatter.js";
import type { ExecAuditLog } from "../security/index.js";
import { withLiveGuard } from "../toolGuards.js";
import { detailOnlyFormattingSchema } from "../types.js";

// ── Schemas ──────────────────────────────────────────────────

const indexPaletteSchema = z.object({
	...detailOnlyFormattingSchema.shape,
	force: z
		.boolean()
		.optional()
		.describe(
			"Force re-index even if a cached index exists for this TD version",
		),
});
type IndexPaletteParams = z.input<typeof indexPaletteSchema>;

const searchPaletteSchema = z.object({
	...detailOnlyFormattingSchema.shape,
	category: z
		.string()
		.optional()
		.describe("Filter by category (e.g. 'Tools', 'Generators')"),
	maxResults: z
		.number()
		.int()
		.min(1)
		.max(100)
		.optional()
		.describe("Max results (default: 20)"),
	query: z.string().describe("Search query (name, tag, description)"),
	tags: z.array(z.string()).optional().describe("Filter by tags (AND logic)"),
});
type SearchPaletteParams = z.input<typeof searchPaletteSchema>;

const loadPaletteComponentSchema = z.object({
	...detailOnlyFormattingSchema.shape,
	componentName: z
		.string()
		.optional()
		.describe("Name for the loaded component (defaults to palette name)"),
	name: z.string().describe("Palette component name (e.g. 'Bloom', 'Noise')"),
	parentPath: z
		.string()
		.describe(
			"Parent operator path where to load the component (e.g. '/project1')",
		),
});
type LoadPaletteComponentParams = z.input<typeof loadPaletteComponentSchema>;

// ── Registration ─────────────────────────────────────────────

export function registerPaletteTools(
	server: McpServer,
	logger: ILogger,
	tdClient: TouchDesignerClient,
	serverMode: ServerMode,
	auditLog?: ExecAuditLog,
): void {
	// ── index_palette (live) ─────────────────────────────────
	server.tool(
		TOOL_NAMES.INDEX_PALETTE,
		"Index all .tox components in the TouchDesigner Palette. Persists a JSON index for offline search. Re-indexes when TD version changes or force=true.",
		indexPaletteSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.INDEX_PALETTE,
			serverMode,
			tdClient,
			async (params: IndexPaletteParams) => {
				const { detailLevel, force = false, responseFormat } = params;
				try {
					const infoResult = await tdClient.getTdInfo();
					if (!infoResult.success) throw infoResult.error;
					const tdVersion = String(infoResult.data.version ?? "unknown");

					const cached = checkPaletteCache(tdVersion, force, logger);
					if (cached) {
						const text = formatIndexResult(cached, {
							detailLevel: detailLevel ?? "summary",
							responseFormat,
						});
						return { content: [{ text, type: "text" as const }] };
					}

					const validated = await runPaletteIndex(tdClient, auditLog);
					persistPaletteIndex(validated, tdVersion, logger);

					const text = formatIndexResult(validated, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
					return { content: [{ text, type: "text" as const }] };
				} catch (error) {
					return handleToolError(
						error,
						logger,
						TOOL_NAMES.INDEX_PALETTE,
						undefined,
						serverMode,
					);
				}
			},
		),
	);

	// ── search_palette (offline) ─────────────────────────────
	server.tool(
		TOOL_NAMES.SEARCH_PALETTE,
		"Search the indexed TouchDesigner Palette by name, category, tags, or description. Works offline once index_palette has been run.",
		searchPaletteSchema.strict().shape,
		async (params: SearchPaletteParams) => {
			try {
				const {
					category,
					detailLevel,
					maxResults,
					query,
					responseFormat,
					tags,
				} = params;

				const cacheDir = resolveIndexCacheDir();
				if (!cacheDir) {
					return {
						content: [
							{
								text: "Cannot resolve palette cache directory. Set TD_MCP_PALETTE_INDEX_PATH env var.",
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				// Find the most recent index file
				const index = findLatestIndex(cacheDir);
				if (!index) {
					return {
						content: [
							{
								text: 'No palette index found. Run "index_palette" with TouchDesigner connected first.',
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				const registry = new PaletteRegistry();
				registry.loadFromIndex(index);

				const results = registry.search(query, {
					category,
					maxResults,
					tags,
				});
				const text = formatPaletteSearchResults(query, results, {
					detailLevel: detailLevel ?? "summary",
					responseFormat,
				});

				return {
					content: [{ text, type: "text" as const }],
				};
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.SEARCH_PALETTE);
			}
		},
	);

	// ── load_palette_component (live) ────────────────────────
	server.tool(
		TOOL_NAMES.LOAD_PALETTE_COMPONENT,
		"Load a .tox component from the TouchDesigner Palette into the current project.",
		loadPaletteComponentSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.LOAD_PALETTE_COMPONENT,
			serverMode,
			tdClient,
			async (params: LoadPaletteComponentParams) => {
				const { detailLevel, name, parentPath, responseFormat } = params;
				const componentName = params.componentName ?? name;

				try {
					const toxPath = resolvePaletteComponentPath(name);
					if (!toxPath) {
						return {
							content: [
								{
									text: `Palette component "${name}" not found in index. Run "index_palette" first, or check the component name.`,
									type: "text" as const,
								},
							],
							isError: true,
						};
					}

					const script = buildLoadPaletteScript(
						toxPath,
						parentPath,
						componentName,
					);
					const startMs = Date.now();
					const scriptResult = await tdClient.execPythonScript<{
						result: string;
					}>({ script });

					auditLog?.append({
						allowed: true,
						durationMs: Date.now() - startMs,
						mode: "safe-write",
						outcome: scriptResult.success ? "executed" : "error",
						preview: false,
						script: `load_palette_component(${name})`,
					});

					if (!scriptResult.success) throw scriptResult.error;

					const rawResult = scriptResult.data.result;
					const parsed =
						typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
					const text = formatLoadResult(parsed, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});

					return {
						content: [{ text, type: "text" as const }],
						isError: parsed.status === "error" ? true : undefined,
					};
				} catch (error) {
					return handleToolError(
						error,
						logger,
						TOOL_NAMES.LOAD_PALETTE_COMPONENT,
						undefined,
						serverMode,
					);
				}
			},
		),
	);
}

// ── Index helpers ───────────────────────────────────────────

function checkPaletteCache(
	tdVersion: string,
	force: boolean,
	logger: ILogger,
): PaletteIndex | null {
	if (force) return null;
	const cacheDir = resolveIndexCacheDir();
	if (!cacheDir) return null;
	const cachePath = join(cacheDir, indexFileName(tdVersion));
	const cached = readIndex(cachePath);
	if (cached) {
		logger.sendLog({
			data: `Palette index cache hit for TD ${tdVersion} (${cached.entryCount} entries)`,
			level: "info",
		});
	}
	return cached;
}

async function runPaletteIndex(
	tdClient: TouchDesignerClient,
	auditLog?: ExecAuditLog,
): Promise<PaletteIndex> {
	const script = buildIndexPaletteScript();
	const startMs = Date.now();
	const scriptResult = await tdClient.execPythonScript<{ result: string }>({
		mode: "full-exec",
		script,
	});

	auditLog?.append({
		allowed: true,
		durationMs: Date.now() - startMs,
		mode: "full-exec",
		outcome: scriptResult.success ? "executed" : "error",
		preview: false,
		script: "index_palette()",
	});

	if (!scriptResult.success) throw scriptResult.error;

	const rawResult = scriptResult.data.result;
	const parsed =
		typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
	if (parsed.error) throw new Error(`Palette indexing failed: ${parsed.error}`);

	return paletteIndexSchema.parse(parsed);
}

function persistPaletteIndex(
	validated: PaletteIndex,
	tdVersion: string,
	logger: ILogger,
): void {
	const cacheDir = resolveIndexCacheDir();
	if (!cacheDir) return;
	const cachePath = join(cacheDir, indexFileName(tdVersion));
	writeIndex(cachePath, validated);
	logger.sendLog({
		data: `Palette index saved: ${validated.entryCount} entries → ${cachePath}`,
		level: "info",
	});
}

function resolvePaletteComponentPath(name: string): string | undefined {
	const cacheDir = resolveIndexCacheDir();
	if (!cacheDir) return undefined;
	const index = findLatestIndex(cacheDir);
	if (!index) return undefined;
	const registry = new PaletteRegistry();
	registry.loadFromIndex(index);
	return registry.getByName(name)?.toxPath;
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Find the most recent palette index file in the cache directory.
 */
function findLatestIndex(cacheDir: string): PaletteIndex | null {
	try {
		if (!existsSync(cacheDir)) return null;

		const files = readdirSync(cacheDir)
			.filter((f) => f.startsWith("palette-index-") && f.endsWith(".json"))
			.sort()
			.reverse();

		for (const f of files) {
			const index = readIndex(join(cacheDir, f));
			if (index) return index;
		}
	} catch {
		// ignore
	}
	return null;
}
