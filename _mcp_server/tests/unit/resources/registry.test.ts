import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeRegistry } from "../../../src/features/resources/registry.js";
import type { TDKnowledgeEntry } from "../../../src/features/resources/types.js";

function makeEntry(
	overrides: Partial<TDKnowledgeEntry> = {},
): TDKnowledgeEntry {
	return {
		content: { summary: "A test module" },
		id: "test-module",
		kind: "python-module",
		payload: {
			canonicalName: "TestModule",
			members: [{ description: "Does stuff", name: "doStuff" }],
		},
		provenance: { confidence: "high", license: "MIT", source: "manual" },
		searchKeywords: ["test"],
		title: "TestModule",
		...overrides,
	} as TDKnowledgeEntry;
}

function makeGlslPatternEntry(
	overrides: Partial<TDKnowledgeEntry> = {},
): TDKnowledgeEntry {
	return {
		content: { summary: "A test GLSL pattern" },
		id: "test-pattern",
		kind: "glsl-pattern",
		payload: {
			code: {
				glsl: "out vec4 fragColor;\nvoid main() { fragColor = vec4(1.0); }",
			},
			difficulty: "beginner",
			setup: {
				operators: [{ family: "TOP", name: "test", type: "glslTOP" }],
			},
			tags: ["test"],
			type: "pixel",
		},
		provenance: { confidence: "high", license: "MIT", source: "manual" },
		searchKeywords: ["test", "pixel"],
		title: "Test Pattern",
		...overrides,
	} as TDKnowledgeEntry;
}

function writeTempEntry(
	basePath: string,
	subdir: string,
	entry: TDKnowledgeEntry,
): void {
	const dir = join(basePath, subdir);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(join(dir, `${entry.id}.json`), JSON.stringify(entry));
}

function writeTempModule(basePath: string, entry: TDKnowledgeEntry): void {
	writeTempEntry(basePath, "modules", entry);
}

describe("KnowledgeRegistry", () => {
	let tempDir: string;
	const mockLogger = {
		sendLog: vi.fn(),
	};

	beforeEach(() => {
		tempDir = join(tmpdir(), `kr-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		vi.clearAllMocks();
	});

	afterEach(() => {
		rmSync(tempDir, { force: true, recursive: true });
	});

	describe("loadAll", () => {
		it("should load valid JSON entries", () => {
			const entry = makeEntry({ id: "tdfunctions" });
			writeTempModule(tempDir, entry);

			const registry = new KnowledgeRegistry(mockLogger);
			registry.loadAll(tempDir);

			expect(registry.size).toBe(1);
			expect(registry.getById("tdfunctions")).toBeDefined();
		});

		it("should skip invalid JSON with warning (fail-soft)", () => {
			const modulesDir = join(tempDir, "modules");
			mkdirSync(modulesDir, { recursive: true });
			writeFileSync(join(modulesDir, "bad.json"), '{"id": 123}');

			const registry = new KnowledgeRegistry(mockLogger);
			registry.loadAll(tempDir);

			expect(registry.size).toBe(0);
			expect(mockLogger.sendLog).toHaveBeenCalledWith(
				expect.objectContaining({ level: "warning" }),
			);
		});

		it("should skip malformed JSON with warning", () => {
			const modulesDir = join(tempDir, "modules");
			mkdirSync(modulesDir, { recursive: true });
			writeFileSync(join(modulesDir, "broken.json"), "{not json");

			const registry = new KnowledgeRegistry(mockLogger);
			registry.loadAll(tempDir);

			expect(registry.size).toBe(0);
			expect(mockLogger.sendLog).toHaveBeenCalledWith(
				expect.objectContaining({ level: "warning" }),
			);
		});

		it("should skip duplicate IDs with warning", () => {
			const entry = makeEntry({ id: "dup" });
			writeTempModule(tempDir, entry);
			// Write a second file with same ID in the same dir
			const modulesDir = join(tempDir, "modules");
			writeFileSync(join(modulesDir, "dup-copy.json"), JSON.stringify(entry));

			const registry = new KnowledgeRegistry(mockLogger);
			registry.loadAll(tempDir);

			expect(registry.size).toBe(1);
			expect(mockLogger.sendLog).toHaveBeenCalledWith(
				expect.objectContaining({
					level: "warning",
					logger: "KnowledgeRegistry",
				}),
			);
		});
	});

	describe("getById", () => {
		it("should return the entry for a known ID", () => {
			const entry = makeEntry({ id: "tdfunctions", title: "TDFunctions" });
			writeTempModule(tempDir, entry);

			const registry = new KnowledgeRegistry(mockLogger);
			registry.loadAll(tempDir);

			const result = registry.getById("tdfunctions");
			expect(result).toBeDefined();
			expect(result?.title).toBe("TDFunctions");
		});

		it("should return undefined for an unknown ID", () => {
			const registry = new KnowledgeRegistry(mockLogger);
			expect(registry.getById("nonexistent")).toBeUndefined();
		});
	});

	describe("getByKind", () => {
		it("should return all entries matching the kind", () => {
			const entry1 = makeEntry({ id: "mod1" });
			const entry2 = makeEntry({ id: "mod2" });
			writeTempModule(tempDir, entry1);
			writeTempModule(tempDir, entry2);

			const registry = new KnowledgeRegistry(mockLogger);
			registry.loadAll(tempDir);

			const results = registry.getByKind("python-module");
			expect(results).toHaveLength(2);
		});

		it("should return empty array for unknown kind", () => {
			const registry = new KnowledgeRegistry(mockLogger);
			expect(registry.getByKind("unknown")).toEqual([]);
		});
	});

	describe("search", () => {
		it("should match on payload.members[].name", () => {
			const entry = makeEntry({
				id: "tdfunctions",
				payload: {
					canonicalName: "TDFunctions",
					members: [
						{ description: "Creates a property", name: "createProperty" },
					],
				},
			});
			writeTempModule(tempDir, entry);

			const registry = new KnowledgeRegistry(mockLogger);
			registry.loadAll(tempDir);

			const results = registry.search("createProperty");
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("tdfunctions");
		});

		it("should match on payload.canonicalName", () => {
			const entry = makeEntry({
				id: "tdfunctions",
				payload: {
					canonicalName: "TDFunctions",
					members: [{ description: "Does stuff", name: "doStuff" }],
				},
			});
			writeTempModule(tempDir, entry);

			const registry = new KnowledgeRegistry(mockLogger);
			registry.loadAll(tempDir);

			const results = registry.search("TDFunctions");
			expect(results).toHaveLength(1);
		});

		it("should match on searchKeywords", () => {
			const entry = makeEntry({
				id: "tdfunctions",
				searchKeywords: ["property", "layout", "utility"],
			});
			writeTempModule(tempDir, entry);

			const registry = new KnowledgeRegistry(mockLogger);
			registry.loadAll(tempDir);

			const results = registry.search("layout");
			expect(results).toHaveLength(1);
		});

		it("should return empty for empty query", () => {
			const registry = new KnowledgeRegistry(mockLogger);
			expect(registry.search("")).toEqual([]);
			expect(registry.search("  ")).toEqual([]);
		});

		it("should respect maxResults", () => {
			const entry1 = makeEntry({ id: "mod1", searchKeywords: ["test"] });
			const entry2 = makeEntry({ id: "mod2", searchKeywords: ["test"] });
			writeTempModule(tempDir, entry1);
			writeTempModule(tempDir, entry2);

			const registry = new KnowledgeRegistry(mockLogger);
			registry.loadAll(tempDir);

			const results = registry.search("test", 1);
			expect(results).toHaveLength(1);
		});
	});

	describe("glsl-pattern support", () => {
		it("getByKind should return glsl-pattern entries", () => {
			const entry = makeGlslPatternEntry({ id: "noise" });
			writeTempEntry(tempDir, "glsl-patterns", entry);

			const registry = new KnowledgeRegistry(mockLogger);
			registry.loadAll(tempDir);

			const results = registry.getByKind("glsl-pattern");
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("noise");
		});

		it("getGlslPatternIndex should return pattern index", () => {
			const entry1 = makeGlslPatternEntry({
				id: "pattern1",
				title: "Pattern 1",
			});
			const entry2 = makeGlslPatternEntry({
				id: "pattern2",
				title: "Pattern 2",
			});
			writeTempEntry(tempDir, "glsl-patterns", entry1);
			writeTempEntry(tempDir, "glsl-patterns", entry2);

			const registry = new KnowledgeRegistry(mockLogger);
			registry.loadAll(tempDir);

			const index = registry.getIndexByKind("glsl-pattern");
			expect(index).toHaveLength(2);
			expect(index[0]).toEqual({
				id: "pattern1",
				kind: "glsl-pattern",
				title: "Pattern 1",
			});
		});

		it("search should match on tags and type", () => {
			const entry = makeGlslPatternEntry({
				id: "feedback",
				payload: {
					code: { glsl: "void main() {}" },
					difficulty: "intermediate",
					setup: {
						operators: [{ family: "TOP", name: "fb", type: "glslTOP" }],
					},
					tags: ["feedback", "decay"],
					type: "pixel",
				},
			});
			writeTempEntry(tempDir, "glsl-patterns", entry);

			const registry = new KnowledgeRegistry(mockLogger);
			registry.loadAll(tempDir);

			expect(registry.search("feedback")).toHaveLength(1);
			expect(registry.search("pixel")).toHaveLength(1);
			expect(registry.search("decay")).toHaveLength(1);
			expect(registry.search("intermediate")).toHaveLength(1);
		});
	});

	describe("getIndex", () => {
		it("should return summaries without payload", () => {
			const entry = makeEntry({
				id: "tdfunctions",
				title: "TDFunctions",
			});
			writeTempModule(tempDir, entry);

			const registry = new KnowledgeRegistry(mockLogger);
			registry.loadAll(tempDir);

			const index = registry.getIndex();
			expect(index).toHaveLength(1);
			expect(index[0]).toEqual({
				id: "tdfunctions",
				kind: "python-module",
				title: "TDFunctions",
			});
			// Ensure no payload or content leaks
			expect(index[0]).not.toHaveProperty("payload");
			expect(index[0]).not.toHaveProperty("content");
		});
	});
});
