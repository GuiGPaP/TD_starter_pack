/**
 * SnippetRegistry — loads and indexes Operator Snippets data.
 *
 * Loads from `snippets_data/` at the project root.
 * The index is kept in memory for fast search; full snippet data
 * is loaded on-demand from the per-family JSON files.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ILogger } from "../../core/logger.js";
import type {
	FamilyData,
	Snippet,
	SnippetAnalysis,
	SnippetIndex,
	SnippetIndexEntry,
	SnippetTip,
} from "./types.js";

export class SnippetRegistry {
	private index: SnippetIndex | null = null;
	private analysis: SnippetAnalysis | null = null;
	private readonly snippetCache = new Map<string, Snippet>();
	private readonly familyCache = new Map<string, FamilyData>();
	private readonly dataPath: string;

	constructor(
		dataPath: string,
		private readonly logger: ILogger,
	) {
		this.dataPath = dataPath;
	}

	/** Try to load the index and analysis files. Returns true if available. */
	load(): boolean {
		const indexPath = join(this.dataPath, "snippets_index.json");
		const analysisPath = join(this.dataPath, "snippets_analysis.json");

		if (!existsSync(indexPath)) {
			this.logger.sendLog({
				data: `Snippets index not found at ${indexPath} — snippet tools disabled`,
				level: "info",
			});
			return false;
		}

		try {
			const parsed: SnippetIndex = JSON.parse(readFileSync(indexPath, "utf-8"));
			this.index = parsed;
			this.logger.sendLog({
				data: `Loaded snippet index: ${parsed.stats.totalSnippets} snippets, ${parsed.stats.uniqueOpTypes} opTypes`,
				level: "info",
			});
		} catch (e) {
			this.logger.sendLog({
				data: `Failed to load snippet index: ${e}`,
				level: "error",
			});
			return false;
		}

		if (existsSync(analysisPath)) {
			try {
				const parsedAnalysis: SnippetAnalysis = JSON.parse(
					readFileSync(analysisPath, "utf-8"),
				);
				this.analysis = parsedAnalysis;
				this.logger.sendLog({
					data: `Loaded snippet analysis: ${parsedAnalysis.tips.length} tips, ${Object.keys(parsedAnalysis.themes).length} themes`,
					level: "info",
				});
			} catch (e) {
				this.logger.sendLog({
					data: `Failed to load snippet analysis: ${e}`,
					level: "warning",
				});
			}
		}

		return true;
	}

	get isLoaded(): boolean {
		return this.index !== null;
	}

	get stats() {
		return this.index?.stats ?? null;
	}

	get tdBuild(): string | null {
		return this.index?.tdBuild ?? null;
	}

	/** Search snippets by text query and/or family filter. */
	search(opts: {
		query?: string;
		family?: string;
		opType?: string;
		maxResults?: number;
	}): Array<{ entry: SnippetIndexEntry; id: string; score: number }> {
		if (!this.index) return [];

		const { family, maxResults = 10, opType, query } = opts;
		const results: Array<{
			entry: SnippetIndexEntry;
			id: string;
			score: number;
		}> = [];

		for (const [id, entry] of Object.entries(this.index.snippets)) {
			if (family && entry.family !== family.toUpperCase()) continue;

			const score = this.scoreEntry(id, entry, query, opType);
			if (score < 0) continue;
			results.push({ entry, id, score });
		}

		results.sort((a, b) => b.score - a.score);
		return results.slice(0, maxResults);
	}

	/** Score a single index entry against search filters. Returns -1 to skip. */
	private scoreEntry(
		id: string,
		entry: SnippetIndexEntry,
		query?: string,
		opType?: string,
	): number {
		let score = 0;

		if (opType) {
			const opLower = opType.toLowerCase();
			const matches =
				entry.opType.toLowerCase() === opLower ||
				entry.opTypes.some((t) => t.toLowerCase() === opLower);
			if (!matches) return -1;
			score += 10;
		}

		if (query) {
			const q = query.toLowerCase();
			const text = [
				id,
				entry.opType,
				entry.family,
				entry.readMePreview ?? "",
				...entry.opTypes,
			]
				.join(" ")
				.toLowerCase();
			if (!text.includes(q)) return -1;
			if (id.includes(q)) score += 5;
			if (entry.opType.toLowerCase().includes(q)) score += 5;
			if ((entry.readMePreview ?? "").toLowerCase().includes(q)) score += 2;
			score += 1;
		}

		if (!query && !opType) {
			score = entry.totalOps + (entry.readMePreview ? 5 : 0);
		}

		return score;
	}

	/** Get full snippet detail by ID (loads family data on-demand). */
	getById(id: string): Snippet | null {
		if (!this.index) return null;

		const cached = this.snippetCache.get(id);
		if (cached) return cached;

		const indexEntry = this.index.snippets[id];
		if (!indexEntry) return null;

		const familyData = this.loadFamily(indexEntry.family);
		if (!familyData) return null;

		const snippet = familyData.snippets.find((s) => s.id === id);
		if (snippet) {
			this.snippetCache.set(id, snippet);
		}
		return snippet ?? null;
	}

	/** Get index entry (lightweight) by ID. */
	getIndexEntry(id: string): SnippetIndexEntry | null {
		return this.index?.snippets[id] ?? null;
	}

	/** Find snippets that demonstrate a specific opType. */
	findByOpType(opType: string): string[] {
		if (!this.index) return [];
		return this.index.opTypeIndex[opType]?.snippetIds ?? [];
	}

	/** Get tips for a specific snippet or opType. */
	getTips(opts: {
		snippetId?: string;
		family?: string;
		category?: string;
		maxResults?: number;
	}): SnippetTip[] {
		if (!this.analysis) return [];
		let tips = this.analysis.tips;
		if (opts.snippetId) {
			tips = tips.filter((t) => t.snippetId === opts.snippetId);
		}
		if (opts.family) {
			const upperFamily = opts.family.toUpperCase();
			tips = tips.filter((t) => t.family === upperFamily);
		}
		if (opts.category) {
			tips = tips.filter((t) => t.category === opts.category);
		}
		return tips.slice(0, opts.maxResults ?? 20);
	}

	/** Get recurring param patterns for an opType. */
	getParamPatterns(opType: string) {
		return this.analysis?.recurringParams[opType] ?? null;
	}

	/** Get theme data. */
	getThemes() {
		return this.analysis?.themes ?? {};
	}

	/** Get top connection patterns. */
	getConnectionPatterns(maxResults = 20) {
		return this.analysis?.topConnectionPatterns.slice(0, maxResults) ?? [];
	}

	private loadFamily(family: string): FamilyData | null {
		const cached = this.familyCache.get(family);
		if (cached) return cached;

		const familyPath = join(this.dataPath, `${family}.json`);
		if (!existsSync(familyPath)) {
			this.logger.sendLog({
				data: `Family data not found: ${familyPath}`,
				level: "warning",
			});
			return null;
		}

		try {
			const data: FamilyData = JSON.parse(readFileSync(familyPath, "utf-8"));
			this.familyCache.set(family, data);
			return data;
		} catch (e) {
			this.logger.sendLog({
				data: `Failed to load family ${family}: ${e}`,
				level: "error",
			});
			return null;
		}
	}
}

/**
 * Resolve the snippets data path.
 *
 * Resolution order:
 * 1. TD_MCP_SNIPPETS_PATH env var
 * 2. ../../snippets_data from dist/ (prod)
 * 3. ../snippets_data from repo root (dev)
 * 4. cwd/snippets_data (fallback)
 */
export function resolveSnippetsDataPath(metaUrl: string): string | undefined {
	const envPath = process.env.TD_MCP_SNIPPETS_PATH;
	if (envPath && existsSync(join(envPath, "snippets_index.json"))) {
		return envPath;
	}

	const thisDir = dirname(fileURLToPath(metaUrl));

	const candidates = [
		// From dist/features/snippets/ → ../../snippets_data
		join(thisDir, "..", "..", "..", "..", "snippets_data"),
		// From src/features/snippets/ → ../../../snippets_data
		join(thisDir, "..", "..", "..", "..", "snippets_data"),
		// cwd fallback
		join(process.cwd(), "snippets_data"),
	];

	for (const candidate of candidates) {
		if (existsSync(join(candidate, "snippets_index.json"))) {
			return candidate;
		}
	}

	return undefined;
}
