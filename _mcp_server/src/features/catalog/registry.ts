import { scanForProjects } from "./loader.js";
import type { ProjectEntry } from "./types.js";

export interface ProjectSearchOptions {
	maxResults?: number;
	tags?: string[];
}

/**
 * In-memory registry of catalogued TD projects.
 * Loaded from filesystem by scanning for .td-catalog.json sidecars.
 */
export class ProjectCatalogRegistry {
	private entries = new Map<string, ProjectEntry>();

	get size(): number {
		return this.entries.size;
	}

	loadFromDir(rootDir: string, maxDepth = 5): void {
		const { indexed } = scanForProjects(rootDir, maxDepth);
		for (const entry of indexed) {
			this.entries.set(entry.toePath, entry);
		}
	}

	getByPath(toePath: string): ProjectEntry | undefined {
		return this.entries.get(toePath);
	}

	getAll(): ProjectEntry[] {
		return [...this.entries.values()];
	}

	search(query: string, opts?: ProjectSearchOptions): ProjectEntry[] {
		const q = query.trim().toLowerCase();
		const maxResults = opts?.maxResults ?? 20;
		const tagFilter = opts?.tags?.map((t) => t.toLowerCase());

		let results = [...this.entries.values()];

		// Filter by tags (AND)
		if (tagFilter && tagFilter.length > 0) {
			results = results.filter((e) => {
				const entryTags = e.manifest.tags.map((t) => t.toLowerCase());
				return tagFilter.every((t) => entryTags.includes(t));
			});
		}

		if (!q) return results.slice(0, maxResults);

		// Score and sort
		const scored = results
			.map((entry) => ({ entry, score: scoreProject(entry, q) }))
			.filter((r) => r.score > 0)
			.sort((a, b) => b.score - a.score);

		return scored.slice(0, maxResults).map((r) => r.entry);
	}
}

function scoreProject(entry: ProjectEntry, query: string): number {
	const m = entry.manifest;
	let score = 0;

	const nameL = m.name.toLowerCase();
	const fileL = m.file.toLowerCase();

	if (nameL === query) score += 150;
	else if (nameL.startsWith(query)) score += 120;
	else if (nameL.includes(query)) score += 100;

	if (fileL.includes(query)) score += 50;

	if (m.description.toLowerCase().includes(query)) score += 40;

	for (const tag of m.tags) {
		if (tag.toLowerCase() === query) score += 80;
		else if (tag.toLowerCase().includes(query)) score += 30;
	}

	for (const comp of m.components ?? []) {
		if (comp.toLowerCase().includes(query)) score += 20;
	}

	return score;
}
