import { describe, expect, it } from "vitest";
import { PaletteRegistry } from "../../../src/features/palette/registry.js";
import type {
	PaletteEntry,
	PaletteIndex,
} from "../../../src/features/palette/types.js";

function makeEntry(
	name: string,
	category: string,
	overrides: Partial<PaletteEntry> = {},
): PaletteEntry {
	return {
		author: "Derivative",
		category,
		description: `${name} component`,
		name,
		relativePath: `${category}/${name}.tox`,
		tags: [category.toLowerCase()],
		toxPath: `C:/TD/Palette/${category}/${name}.tox`,
		...overrides,
	};
}

function makeIndex(entries: PaletteEntry[]): PaletteIndex {
	return {
		entries,
		entryCount: entries.length,
		indexedAt: "2026-01-01T00:00:00",
		paletteRoot: "C:/TD/Palette",
		schemaVersion: "1.0",
		tdVersion: "2024.11000",
	};
}

describe("PaletteRegistry", () => {
	it("loadFromIndex populates entries", () => {
		const reg = new PaletteRegistry();
		reg.loadFromIndex(
			makeIndex([
				makeEntry("Bloom", "ImageFilters"),
				makeEntry("Noise", "Generators"),
			]),
		);
		expect(reg.size).toBe(2);
	});

	it("getByName returns correct entry", () => {
		const reg = new PaletteRegistry();
		reg.loadFromIndex(makeIndex([makeEntry("Bloom", "ImageFilters")]));
		expect(reg.getByName("Bloom")?.category).toBe("ImageFilters");
		expect(reg.getByName("Missing")).toBeUndefined();
	});

	it("getByCategory filters correctly", () => {
		const reg = new PaletteRegistry();
		reg.loadFromIndex(
			makeIndex([
				makeEntry("Bloom", "ImageFilters"),
				makeEntry("Sharpen", "ImageFilters"),
				makeEntry("Noise", "Generators"),
			]),
		);
		expect(reg.getByCategory("ImageFilters")).toHaveLength(2);
		expect(reg.getByCategory("generators")).toHaveLength(1);
	});

	it("search finds by name — exact match scores highest", () => {
		const reg = new PaletteRegistry();
		reg.loadFromIndex(
			makeIndex([
				makeEntry("Bloom", "ImageFilters"),
				makeEntry("BloomHQ", "ImageFilters"),
				makeEntry("Noise", "Generators"),
			]),
		);
		const results = reg.search("Bloom");
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results[0].name).toBe("Bloom");
	});

	it("search filters by category", () => {
		const reg = new PaletteRegistry();
		reg.loadFromIndex(
			makeIndex([
				makeEntry("Bloom", "ImageFilters"),
				makeEntry("Noise", "Generators"),
			]),
		);
		const results = reg.search("", { category: "ImageFilters" });
		expect(results).toHaveLength(1);
		expect(results[0].name).toBe("Bloom");
	});

	it("search filters by tags (AND logic)", () => {
		const reg = new PaletteRegistry();
		reg.loadFromIndex(
			makeIndex([
				makeEntry("Bloom", "ImageFilters", {
					tags: ["filter", "post-process"],
				}),
				makeEntry("Noise", "Generators", { tags: ["generator", "noise"] }),
			]),
		);
		const results = reg.search("", { tags: ["filter", "post-process"] });
		expect(results).toHaveLength(1);
		expect(results[0].name).toBe("Bloom");
	});

	it("search respects maxResults", () => {
		const entries = Array.from({ length: 30 }, (_, i) =>
			makeEntry(`Component${i}`, "Tools"),
		);
		const reg = new PaletteRegistry();
		reg.loadFromIndex(makeIndex(entries));
		const results = reg.search("Component", { maxResults: 5 });
		expect(results).toHaveLength(5);
	});

	it("search returns empty for no match", () => {
		const reg = new PaletteRegistry();
		reg.loadFromIndex(makeIndex([makeEntry("Bloom", "ImageFilters")]));
		expect(reg.search("nonexistent")).toHaveLength(0);
	});

	it("search scores description matches", () => {
		const reg = new PaletteRegistry();
		reg.loadFromIndex(
			makeIndex([
				makeEntry("CompA", "Tools", {
					description: "Applies a beautiful blur effect",
				}),
				makeEntry("CompB", "Tools", { description: "Audio routing" }),
			]),
		);
		const results = reg.search("blur");
		expect(results).toHaveLength(1);
		expect(results[0].name).toBe("CompA");
	});
});
