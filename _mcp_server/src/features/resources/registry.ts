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
	getIndexByKind(kind: string): Array<{ id: string; title: string; kind: string }> {
		return this.getByKind(kind).map((e) => ({ id: e.id, kind: e.kind, title: e.title }));
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

function matchesQuery(entry: TDKnowledgeEntry, query: string): boolean {
	const haystacks = [
		entry.id,
		entry.title,
		entry.content.summary,
		...(entry.aliases ?? []),
		...entry.searchKeywords,
	];

	if (entry.kind === "python-module") {
		haystacks.push(entry.payload.canonicalName);
		for (const m of entry.payload.members) {
			haystacks.push(m.name);
		}
	} else if (entry.kind === "operator") {
		haystacks.push(entry.payload.opType);
		haystacks.push(entry.payload.opFamily);
		for (const p of entry.payload.parameters) {
			haystacks.push(p.name);
		}
	} else if (entry.kind === "glsl-pattern") {
		haystacks.push(entry.payload.type);
		haystacks.push(entry.payload.difficulty);
		if (entry.payload.tags) {
			haystacks.push(...entry.payload.tags);
		}
	} else if (entry.kind === "toolkit") {
		haystacks.push(entry.payload.name);
		haystacks.push(entry.payload.vendor);
		haystacks.push(entry.payload.opFamilyPrefix);
		if (entry.payload.version) haystacks.push(entry.payload.version);
	} else if (entry.kind === "template") {
		haystacks.push(entry.payload.category);
		if (entry.payload.difficulty) haystacks.push(entry.payload.difficulty);
		if (entry.payload.tags) haystacks.push(...entry.payload.tags);
		for (const op of entry.payload.operators) {
			haystacks.push(op.opType, op.family, op.name);
			if (op.role) haystacks.push(op.role);
		}
	} else if (entry.kind === "workflow") {
		haystacks.push(entry.payload.category);
		if (entry.payload.difficulty) haystacks.push(entry.payload.difficulty);
		if (entry.payload.tags) haystacks.push(...entry.payload.tags);
		for (const op of entry.payload.operators) {
			haystacks.push(op.opType, op.family);
			if (op.role) haystacks.push(op.role);
		}
	} else if (entry.kind === "tutorial") {
		haystacks.push(entry.payload.difficulty);
		haystacks.push(...entry.payload.tags);
		haystacks.push(...entry.payload.relatedOperators);
		for (const s of entry.payload.sections) {
			haystacks.push(s.title);
		}
	} else if (entry.kind === "technique") {
		haystacks.push(entry.payload.category);
		haystacks.push(entry.payload.difficulty);
		haystacks.push(...entry.payload.tags);
		if (entry.payload.operatorChain) {
			for (const op of entry.payload.operatorChain) {
				haystacks.push(op.opType, op.family);
			}
		}
	} else if (entry.kind === "lesson") {
		haystacks.push(entry.payload.category);
		haystacks.push(...entry.payload.tags);
		if (entry.payload.symptom) haystacks.push(entry.payload.symptom);
		if (entry.payload.cause) haystacks.push(entry.payload.cause);
		if (entry.payload.fix) haystacks.push(entry.payload.fix);
		if (entry.payload.recipe) haystacks.push(entry.payload.recipe.description);
		if (entry.payload.operatorChain) {
			for (const op of entry.payload.operatorChain) {
				haystacks.push(op.opType, op.family);
			}
		}
	}

	return haystacks.some((h) => h.toLowerCase().includes(query));
}
