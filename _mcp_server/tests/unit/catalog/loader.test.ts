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

	// Project with enriched graph manifest
	const proj3Dir = join(TMP, "proj3");
	mkdirSync(proj3Dir, { recursive: true });
	writeFileSync(join(proj3Dir, "proj3.toe"), "fake-toe");
	writeFileSync(
		join(proj3Dir, "proj3.td-catalog.json"),
		JSON.stringify({
			components: ["graphRoot"],
			connectionCount: 1,
			connections: [
				{
					from: "/project1/constant1",
					fromOutput: 0,
					to: "/project1/null1",
					toInput: 0,
				},
			],
			description: "Graph-backed project",
			file: "proj3.toe",
			name: "Project 3",
			nodeCount: 2,
			nodes: [
				{
					family: "CHOP",
					name: "constant1",
					opType: "constantCHOP",
					parameters: {
						value0: {
							style: "Float",
							value: 1,
						},
					},
					path: "/project1/constant1",
				},
				{
					family: "CHOP",
					name: "null1",
					opType: "nullCHOP",
					path: "/project1/null1",
				},
			],
			operators: { CHOP: 2 },
			patterns: [
				{
					kind: "connected-network",
					summary:
						"Contains an explicit operator graph with wired connections.",
				},
			],
			schemaVersion: "1.1",
			tags: ["graph"],
			warnings: [],
		}),
	);

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

	it("loads enriched 1.1 manifest fields", () => {
		const m = loadManifest(join(TMP, "proj3", "proj3.toe"));
		expect(m).not.toBeNull();
		expect(m?.schemaVersion).toBe("1.1");
		expect(m?.nodeCount).toBe(2);
		expect(m?.connectionCount).toBe(1);
		expect(m?.nodes?.[0]?.parameters?.value0?.value).toBe(1);
		expect(m?.connections?.[0]?.to).toBe("/project1/null1");
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
