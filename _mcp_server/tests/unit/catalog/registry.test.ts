import { describe, expect, it } from "vitest";
import { ProjectCatalogRegistry } from "../../../src/features/catalog/registry.js";
import type { ProjectEntry } from "../../../src/features/catalog/types.js";

function makeEntry(
	name: string,
	tags: string[] = [],
	overrides: Record<string, unknown> = {},
): ProjectEntry {
	return {
		manifest: {
			description: `Description of ${name}`,
			file: `${name}.toe`,
			name,
			schemaVersion: "1.0" as const,
			tags,
			...overrides,
		},
		toePath: `/projects/${name}/${name}.toe`,
	} as ProjectEntry;
}

describe("ProjectCatalogRegistry", () => {
	it("search finds by name", () => {
		const reg = new ProjectCatalogRegistry();
		// Manually populate
		(reg as unknown as { entries: Map<string, ProjectEntry> }).entries =
			new Map([
				["/a/a.toe", makeEntry("feedback-loop", ["feedback", "glsl"])],
				["/b/b.toe", makeEntry("particle-system", ["particles", "gpu"])],
				["/c/c.toe", makeEntry("audio-viz", ["audio", "reactive"])],
			]);

		const results = reg.search("feedback");
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results[0].manifest.name).toBe("feedback-loop");
	});

	it("search filters by tags", () => {
		const reg = new ProjectCatalogRegistry();
		(reg as unknown as { entries: Map<string, ProjectEntry> }).entries =
			new Map([
				["/a/a.toe", makeEntry("proj1", ["glsl", "feedback"])],
				["/b/b.toe", makeEntry("proj2", ["audio"])],
			]);

		const results = reg.search("", { tags: ["glsl"] });
		expect(results).toHaveLength(1);
		expect(results[0].manifest.name).toBe("proj1");
	});

	it("search respects maxResults", () => {
		const reg = new ProjectCatalogRegistry();
		const entries = new Map<string, ProjectEntry>();
		for (let i = 0; i < 30; i++) {
			entries.set(`/p${i}.toe`, makeEntry(`project-${i}`, ["test"]));
		}
		(reg as unknown as { entries: Map<string, ProjectEntry> }).entries =
			entries;

		const results = reg.search("project", { maxResults: 5 });
		expect(results).toHaveLength(5);
	});

	it("search returns empty for no match", () => {
		const reg = new ProjectCatalogRegistry();
		(reg as unknown as { entries: Map<string, ProjectEntry> }).entries =
			new Map([["/a/a.toe", makeEntry("proj1", ["glsl"])]]);

		expect(reg.search("nonexistent")).toHaveLength(0);
	});

	it("getByPath returns entry", () => {
		const reg = new ProjectCatalogRegistry();
		const entry = makeEntry("test");
		(reg as unknown as { entries: Map<string, ProjectEntry> }).entries =
			new Map([["/test/test.toe", entry]]);

		expect(reg.getByPath("/test/test.toe")).toBe(entry);
		expect(reg.getByPath("/other.toe")).toBeUndefined();
	});
});
