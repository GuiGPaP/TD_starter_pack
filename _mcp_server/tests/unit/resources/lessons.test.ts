import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeRegistry } from "../../../src/features/resources/registry.js";
import type { TDKnowledgeEntry } from "../../../src/features/resources/types.js";

function makeLessonEntry(
	overrides: Partial<TDKnowledgeEntry> = {},
): TDKnowledgeEntry {
	return {
		content: { summary: "A test lesson" },
		id: "test-lesson",
		kind: "lesson",
		payload: {
			category: "pattern",
			operatorChain: [{ family: "TOP", opType: "feedbackTOP" }],
			tags: ["feedback", "test"],
		},
		provenance: {
			confidence: "medium",
			license: "MIT",
			source: "manual",
			validationCount: 1,
		},
		searchKeywords: ["feedback", "test"],
		title: "Test Lesson",
		...overrides,
	} as TDKnowledgeEntry;
}

function writeLessonEntry(basePath: string, entry: TDKnowledgeEntry): void {
	const dir = join(basePath, "lessons");
	mkdirSync(dir, { recursive: true });
	const { writeFileSync } = require("node:fs");
	writeFileSync(join(dir, `${entry.id}.json`), JSON.stringify(entry));
}

describe("KnowledgeRegistry — lesson support", () => {
	let tempDir: string;
	const mockLogger = { sendLog: vi.fn() };

	beforeEach(() => {
		tempDir = join(tmpdir(), `kr-lesson-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		vi.clearAllMocks();
	});

	afterEach(() => {
		rmSync(tempDir, { force: true, recursive: true });
	});

	it("should load lesson entries from lessons/ directory", () => {
		const entry = makeLessonEntry({ id: "feedback-pattern" });
		writeLessonEntry(tempDir, entry);

		const registry = new KnowledgeRegistry(mockLogger);
		registry.loadAll(tempDir);

		expect(registry.getById("feedback-pattern")).toBeDefined();
		expect(registry.getByKind("lesson")).toHaveLength(1);
	});

	it("getLessonIndex should return lesson entries only", () => {
		const lesson = makeLessonEntry({ id: "lesson1", title: "Lesson 1" });
		writeLessonEntry(tempDir, lesson);

		const registry = new KnowledgeRegistry(mockLogger);
		registry.loadAll(tempDir);

		const index = registry.getIndexByKind("lesson");
		expect(index).toHaveLength(1);
		expect(index[0]).toEqual({
			id: "lesson1",
			kind: "lesson",
			title: "Lesson 1",
		});
	});

	it("search should match on lesson tags", () => {
		const entry = makeLessonEntry({
			id: "feedback-lesson",
			payload: {
				category: "pattern",
				tags: ["feedback", "organic"],
			},
		});
		writeLessonEntry(tempDir, entry);

		const registry = new KnowledgeRegistry(mockLogger);
		registry.loadAll(tempDir);

		expect(registry.search("organic")).toHaveLength(1);
		expect(registry.search("feedback")).toHaveLength(1);
	});

	it("search should match on lesson symptom (pitfall)", () => {
		const entry = makeLessonEntry({
			id: "blowout-pitfall",
			payload: {
				category: "pitfall",
				symptom: "image turns white",
				tags: ["decay"],
			},
		});
		writeLessonEntry(tempDir, entry);

		const registry = new KnowledgeRegistry(mockLogger);
		registry.loadAll(tempDir);

		expect(registry.search("white")).toHaveLength(1);
	});

	it("search should match on operator chain opType", () => {
		const entry = makeLessonEntry({
			id: "displace-lesson",
			payload: {
				category: "pattern",
				operatorChain: [
					{ family: "TOP", opType: "displaceTOP" },
					{ family: "TOP", opType: "feedbackTOP" },
				],
				tags: ["displace"],
			},
		});
		writeLessonEntry(tempDir, entry);

		const registry = new KnowledgeRegistry(mockLogger);
		registry.loadAll(tempDir);

		expect(registry.search("displaceTOP")).toHaveLength(1);
	});

	it("addEntry should hot-add a lesson to the registry", () => {
		const registry = new KnowledgeRegistry(mockLogger);
		const entry = makeLessonEntry({ id: "hot-added" });

		expect(registry.addEntry(entry)).toBe(true);
		expect(registry.getById("hot-added")).toBeDefined();
		expect(registry.getIndexByKind("lesson")).toHaveLength(1);
	});

	it("addEntry should reject duplicate IDs", () => {
		const registry = new KnowledgeRegistry(mockLogger);
		const entry = makeLessonEntry({ id: "dup" });

		expect(registry.addEntry(entry)).toBe(true);
		expect(registry.addEntry(entry)).toBe(false);
		expect(registry.size).toBe(1);
	});
});
