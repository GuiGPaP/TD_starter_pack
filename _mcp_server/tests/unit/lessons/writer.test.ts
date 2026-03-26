import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deduplicateId, titleToId } from "../../../src/features/lessons/idGenerator.js";
import { appendLessonToSidecar, writeLessonToBuiltin } from "../../../src/features/lessons/writer.js";
import { KnowledgeRegistry } from "../../../src/features/resources/registry.js";
import type { TDLessonEntry } from "../../../src/features/resources/types.js";

function makeLesson(overrides: Partial<TDLessonEntry> = {}): TDLessonEntry {
	return {
		aliases: [],
		content: { summary: "Test lesson" },
		id: "test-lesson",
		kind: "lesson",
		payload: {
			category: "pattern",
			tags: ["test"],
		},
		provenance: {
			confidence: "low",
			license: "MIT",
			source: "manual",
			validationCount: 0,
		},
		searchKeywords: ["test"],
		title: "Test Lesson",
		...overrides,
	} as TDLessonEntry;
}

describe("titleToId", () => {
	it("converts title to kebab-case", () => {
		expect(titleToId("Feedback + Displace for Organic Motion")).toBe(
			"feedback-displace-for-organic-motion",
		);
	});

	it("handles special characters", () => {
		expect(titleToId("CHOP Export → TOP Params")).toBe("chop-export-top-params");
	});

	it("collapses multiple hyphens", () => {
		expect(titleToId("hello   world")).toBe("hello-world");
	});

	it("trims leading/trailing hyphens", () => {
		expect(titleToId("  -hello- ")).toBe("hello");
	});
});

describe("deduplicateId", () => {
	it("returns base ID if not taken", () => {
		const registry = new KnowledgeRegistry();
		expect(deduplicateId("new-lesson", registry)).toBe("new-lesson");
	});

	it("appends suffix if ID is taken", () => {
		const registry = new KnowledgeRegistry();
		registry.addEntry(makeLesson({ id: "taken" }));
		expect(deduplicateId("taken", registry)).toBe("taken-2");
	});

	it("increments suffix for multiple duplicates", () => {
		const registry = new KnowledgeRegistry();
		registry.addEntry(makeLesson({ id: "dup" }));
		registry.addEntry(makeLesson({ id: "dup-2" }));
		expect(deduplicateId("dup", registry)).toBe("dup-3");
	});
});

describe("writeLessonToBuiltin", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `lesson-writer-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { force: true, recursive: true });
	});

	it("writes lesson JSON to lessons/ subdirectory", () => {
		const lesson = makeLesson({ id: "my-lesson" });
		const filePath = writeLessonToBuiltin(lesson, tempDir);

		expect(existsSync(filePath)).toBe(true);
		const content = JSON.parse(readFileSync(filePath, "utf-8"));
		expect(content.id).toBe("my-lesson");
		expect(content.kind).toBe("lesson");
	});

	it("creates lessons/ directory if it doesn't exist", () => {
		const lesson = makeLesson({ id: "new-dir" });
		writeLessonToBuiltin(lesson, tempDir);
		expect(existsSync(join(tempDir, "lessons"))).toBe(true);
	});
});

describe("appendLessonToSidecar", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `lesson-sidecar-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { force: true, recursive: true });
	});

	it("creates new sidecar file with array", () => {
		const toePath = join(tempDir, "project.toe");
		const lesson = makeLesson({ id: "first" });
		const sidecarPath = appendLessonToSidecar(lesson, toePath);

		expect(existsSync(sidecarPath)).toBe(true);
		const content = JSON.parse(readFileSync(sidecarPath, "utf-8"));
		expect(Array.isArray(content)).toBe(true);
		expect(content).toHaveLength(1);
		expect(content[0].id).toBe("first");
	});

	it("appends to existing sidecar", () => {
		const toePath = join(tempDir, "project.toe");
		appendLessonToSidecar(makeLesson({ id: "first" }), toePath);
		appendLessonToSidecar(makeLesson({ id: "second" }), toePath);

		const sidecarPath = join(tempDir, "project.td-lessons.json");
		const content = JSON.parse(readFileSync(sidecarPath, "utf-8"));
		expect(content).toHaveLength(2);
		expect(content[1].id).toBe("second");
	});
});
