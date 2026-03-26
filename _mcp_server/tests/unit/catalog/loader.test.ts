import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	loadManifest,
	manifestPathFor,
	markdownPathFor,
	scanForProjects,
	thumbnailPathFor,
} from "../../../src/features/catalog/loader.js";

const TMP = join(import.meta.dirname ?? __dirname, "__tmp_catalog_test__");

beforeAll(() => {
	mkdirSync(TMP, { recursive: true });

	// Project with manifest
	const proj1Dir = join(TMP, "proj1");
	mkdirSync(proj1Dir, { recursive: true });
	writeFileSync(join(proj1Dir, "proj1.toe"), "fake-toe");
	writeFileSync(
		join(proj1Dir, "proj1.td-catalog.json"),
		JSON.stringify({
			description: "A test project",
			file: "proj1.toe",
			name: "Project 1",
			schemaVersion: "1.0",
			tags: ["test"],
		}),
	);

	// Project without manifest
	const proj2Dir = join(TMP, "proj2");
	mkdirSync(proj2Dir, { recursive: true });
	writeFileSync(join(proj2Dir, "proj2.toe"), "fake-toe");

	// Nested project
	const nestedDir = join(TMP, "deep", "nested");
	mkdirSync(nestedDir, { recursive: true });
	writeFileSync(join(nestedDir, "nested.toe"), "fake-toe");
});

afterAll(() => {
	rmSync(TMP, { force: true, recursive: true });
});

describe("path helpers", () => {
	it("manifestPathFor", () => {
		expect(manifestPathFor("/a/b/foo.toe")).toMatch(/foo\.td-catalog\.json$/);
	});

	it("markdownPathFor", () => {
		expect(markdownPathFor("/a/b/foo.toe")).toMatch(/foo\.td-catalog\.md$/);
	});

	it("thumbnailPathFor", () => {
		expect(thumbnailPathFor("/a/b/foo.toe")).toMatch(/foo\.td-catalog\.png$/);
	});
});

describe("loadManifest", () => {
	it("loads valid manifest", () => {
		const m = loadManifest(join(TMP, "proj1", "proj1.toe"));
		expect(m).not.toBeNull();
		expect(m?.name).toBe("Project 1");
		expect(m?.schemaVersion).toBe("1.0");
	});

	it("returns null for missing manifest", () => {
		expect(loadManifest(join(TMP, "proj2", "proj2.toe"))).toBeNull();
	});

	it("returns null for non-existent toe", () => {
		expect(loadManifest(join(TMP, "nonexistent.toe"))).toBeNull();
	});
});

describe("scanForProjects", () => {
	it("finds indexed and non-indexed projects", () => {
		const result = scanForProjects(TMP);
		expect(result.indexed.length).toBeGreaterThanOrEqual(1);
		expect(result.notIndexed.length).toBeGreaterThanOrEqual(1);
		expect(result.indexed[0].manifest.name).toBe("Project 1");
	});

	it("finds nested projects", () => {
		const result = scanForProjects(TMP, 10);
		const allPaths = [
			...result.indexed.map((e) => e.toePath),
			...result.notIndexed,
		];
		expect(allPaths.some((p) => p.includes("nested.toe"))).toBe(true);
	});

	it("respects maxDepth", () => {
		const result = scanForProjects(TMP, 0);
		const allPaths = [
			...result.indexed.map((e) => e.toePath),
			...result.notIndexed,
		];
		expect(allPaths.some((p) => p.includes("nested.toe"))).toBe(false);
	});
});
