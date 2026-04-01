import type { ILogger } from "../../core/logger.js";
import { loadKnowledgeEntries } from "./loader.js";
import type { TDKnowledgeEntry } from "./types.js";

/**
 * In-memory registry of TD knowledge entries.
 * Supports lookup by ID, filtering by kind, and text search.
 */
export class KnowledgeRegistry {
	private readonly entries = new Map<string, TDKnowledgeEntry>();
	private readonly opTypeIndex = new Map<string, TDKnowledgeEntry>();
	private readonly logger?: ILogger;

	constructor(logger?: ILogger) {
		this.logger = logger;
	}

	get size(): number {
		return this.entries.size;
	}

	/**
	 * Load all knowledge entries from a base directory.
	 * Duplicate IDs are skipped with a warning (first-loaded wins).
	 */
	loadAll(basePath: string): void {
		const loaded = loadKnowledgeEntries(basePath, this.logger);
		for (const entry of loaded) {
			if (this.entries.has(entry.id)) {
				this.logger?.sendLog({
					data: `Duplicate knowledge entry ID "${entry.id}", skipping`,
					level: "warning",
					logger: "KnowledgeRegistry",
				});
				continue;
			}
			this.entries.set(entry.id, entry);
			// Build secondary index for operator lookups by opType
			if (entry.kind === "operator") {
				this.opTypeIndex.set(entry.payload.opType.toLowerCase(), entry);
			}
		}
		this.logger?.sendLog({
			data: `Knowledge registry loaded: ${this.entries.size} entry/entries`,
			level: "info",
			logger: "KnowledgeRegistry",
		});
	}

	getById(id: string): TDKnowledgeEntry | undefined {
		return this.entries.get(id);
	}

	/**
	 * Look up an operator entry by opType (case-insensitive).
	 * Uses secondary index built at load time.
	 */
	getByOpType(opType: string): TDKnowledgeEntry | undefined {
		return this.opTypeIndex.get(opType.toLowerCase());
	}

	getByKind(kind: string): TDKnowledgeEntry[] {
		return [...this.entries.values()].filter((e) => e.kind === kind);
	}

	/**
	 * Search entries by query string.
	 * Kind-aware: searches relevant payload fields per entry type.
	 */
	search(query: string, maxResults = 20): TDKnowledgeEntry[] {
		const q = query.trim().toLowerCase();
		if (!q) return [];

		return [...this.entries.values()]
			.filter((e) => matchesQuery(e, q))
			.slice(0, maxResults);
	}

	/**
	 * Return a lightweight index of all entries (no payload or full content).
	 */
	getIndex(): Array<{ id: string; title: string; kind: string }> {
		return [...this.entries.values()].map((e) => ({
			id: e.id,
			kind: e.kind,
			title: e.title,
		}));
	}

	/**
	 * Return a lightweight index filtered to entries of a given kind.
	 */
	getIndexByKind(
		kind: string,
	): Array<{ id: string; title: string; kind: string }> {
		return this.getByKind(kind).map((e) => ({
			id: e.id,
			kind: e.kind,
			title: e.title,
		}));
	}

	/**
	 * Hot-add a single entry to the registry (for capture workflow).
	 */
	addEntry(entry: TDKnowledgeEntry): boolean {
		if (this.entries.has(entry.id)) {
			return false;
		}
		this.entries.set(entry.id, entry);
		if (entry.kind === "operator") {
			this.opTypeIndex.set(entry.payload.opType.toLowerCase(), entry);
		}
		return true;
	}
}

function collectKindTerms(entry: TDKnowledgeEntry): string[] {
	switch (entry.kind) {
		case "python-module":
			return [
				entry.payload.canonicalName,
				...entry.payload.members.map((m) => m.name),
			];
		case "operator":
			return [
				entry.payload.opType,
				entry.payload.opFamily,
				...entry.payload.parameters.map((par) => par.name),
			];
		case "glsl-pattern":
			return [
				entry.payload.type,
				entry.payload.difficulty,
				...(entry.payload.tags ?? []),
			];
		case "toolkit":
			return [
				entry.payload.name,
				entry.payload.vendor,
				entry.payload.opFamilyPrefix,
				...(entry.payload.version ? [entry.payload.version] : []),
			];
		case "template":
			return [
				entry.payload.category,
				...(entry.payload.difficulty ? [entry.payload.difficulty] : []),
				...(entry.payload.tags ?? []),
				...entry.payload.operators.flatMap((op) => [
					op.opType,
					op.family,
					op.name,
					...(op.role ? [op.role] : []),
				]),
			];
		case "workflow":
			return [
				entry.payload.category,
				...(entry.payload.difficulty ? [entry.payload.difficulty] : []),
				...(entry.payload.tags ?? []),
				...entry.payload.operators.flatMap((op) => [
					op.opType,
					op.family,
					...(op.role ? [op.role] : []),
				]),
			];
		case "tutorial":
			return [
				entry.payload.difficulty,
				...entry.payload.tags,
				...entry.payload.relatedOperators,
				...entry.payload.sections.map((s) => s.title),
			];
		case "technique":
			return [
				entry.payload.category,
				entry.payload.difficulty,
				...entry.payload.tags,
				...(entry.payload.operatorChain?.flatMap((op) => [
					op.opType,
					op.family,
				]) ?? []),
			];
		case "lesson":
			return [
				entry.payload.category,
				...entry.payload.tags,
				...(entry.payload.symptom ? [entry.payload.symptom] : []),
				...(entry.payload.cause ? [entry.payload.cause] : []),
				...(entry.payload.fix ? [entry.payload.fix] : []),
				...(entry.payload.recipe ? [entry.payload.recipe.description] : []),
				...(entry.payload.operatorChain?.flatMap((op) => [
					op.opType,
					op.family,
				]) ?? []),
			];
		default:
			return [];
	}
}

function matchesQuery(entry: TDKnowledgeEntry, query: string): boolean {
	const haystacks = [
		entry.id,
		entry.title,
		entry.content.summary,
		...(entry.aliases ?? []),
		...entry.searchKeywords,
		...collectKindTerms(entry),
	];
	return haystacks.some((h) => h.toLowerCase().includes(query));
}
