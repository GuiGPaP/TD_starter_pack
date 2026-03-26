import type { PaletteEntry, PaletteIndex } from "./types.js";

export interface PaletteSearchOptions {
	category?: string;
	maxResults?: number;
	tags?: string[];
}

/**
 * In-memory registry of palette entries with scored search.
 */
export class PaletteRegistry {
	private entries = new Map<string, PaletteEntry>();

	get size(): number {
		return this.entries.size;
	}

	loadFromIndex(index: PaletteIndex): void {
		for (const entry of index.entries) {
			this.entries.set(entry.name, entry);
		}
	}

	getAll(): PaletteEntry[] {
		return [...this.entries.values()];
	}

	getByName(name: string): PaletteEntry | undefined {
		return this.entries.get(name);
	}

	getByCategory(category: string): PaletteEntry[] {
		const cat = category.toLowerCase();
		return [...this.entries.values()].filter(
			(e) => e.category.toLowerCase() === cat,
		);
	}

	search(query: string, opts?: PaletteSearchOptions): PaletteEntry[] {
		const q = query.trim().toLowerCase();
		const maxResults = opts?.maxResults ?? 20;
		const catFilter = opts?.category?.toLowerCase();
		const tagFilter = opts?.tags?.map((t) => t.toLowerCase());

		let results = [...this.entries.values()];

		if (catFilter) {
			results = results.filter((e) => e.category.toLowerCase() === catFilter);
		}

		if (tagFilter && tagFilter.length > 0) {
			results = results.filter((e) => {
				const entryTags = e.tags.map((t) => t.toLowerCase());
				return tagFilter.every((t) => entryTags.includes(t));
			});
		}

		if (!q) return results.slice(0, maxResults);

		const scored = results
			.map((entry) => ({ entry, score: scoreEntry(entry, q) }))
			.filter((r) => r.score > 0)
			.sort((a, b) => b.score - a.score);

		return scored.slice(0, maxResults).map((r) => r.entry);
	}
}

function scoreEntry(entry: PaletteEntry, query: string): number {
	let score = 0;
	const nameL = entry.name.toLowerCase();

	if (nameL === query) score += 150;
	else if (nameL.startsWith(query)) score += 120;
	else if (nameL.includes(query)) score += 100;

	if (entry.category.toLowerCase().includes(query)) score += 80;

	for (const tag of entry.tags) {
		if (tag.toLowerCase() === query) score += 80;
		else if (tag.toLowerCase().includes(query)) score += 30;
	}

	if (entry.description.toLowerCase().includes(query)) score += 40;

	for (const child of entry.topLevelChildren ?? []) {
		if (child.toLowerCase().includes(query)) score += 20;
	}

	return score;
}
