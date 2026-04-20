import { describe, expect, it } from "vitest";
import type { ScanData } from "../../../src/features/lessons/detector.js";
import { detectLessons } from "../../../src/features/lessons/detector.js";
import { KnowledgeRegistry } from "../../../src/features/resources/registry.js";
import type { TDLessonEntry } from "../../../src/features/resources/types.js";

function emptyRegistry(): KnowledgeRegistry {
	return new KnowledgeRegistry();
}

function emptyScan(): ScanData {
	return { anomalies: [], connections: [], errors: [], operators: [] };
}

describe("detectLessons", () => {
	it("returns empty for empty scan data", () => {
		const result = detectLessons(emptyScan(), emptyRegistry());
		expect(result).toEqual([]);
	});

	describe("feedback loop detection", () => {
		it("detects a feedback loop", () => {
			const data: ScanData = {
				anomalies: [],
				connections: [
					{ from: "/p/noise1", fromOutput: 0, to: "/p/feedback1", toInput: 0 },
					{ from: "/p/feedback1", fromOutput: 0, to: "/p/comp1", toInput: 0 },
				],
				errors: [],
				operators: [
					{ family: "TOP", opType: "noiseTOP", path: "/p/noise1" },
					{ family: "TOP", opType: "feedbackTOP", path: "/p/feedback1" },
					{ family: "TOP", opType: "compositeTOP", path: "/p/comp1" },
				],
			};

			const candidates = detectLessons(data, emptyRegistry());
			expect(
				candidates.some(
					(c) => c.category === "pattern" && c.tags.includes("feedback"),
				),
			).toBe(true);
		});

		it("detects GLSL + Feedback pattern", () => {
			const data: ScanData = {
				anomalies: [],
				connections: [
					{ from: "/p/feedback1", fromOutput: 0, to: "/p/glsl1", toInput: 1 },
					{ from: "/p/glsl1", fromOutput: 0, to: "/p/feedback1", toInput: 0 },
				],
				errors: [],
				operators: [
					{ family: "TOP", opType: "glslTOP", path: "/p/glsl1" },
					{ family: "TOP", opType: "feedbackTOP", path: "/p/feedback1" },
				],
			};

			const candidates = detectLessons(data, emptyRegistry());
			const glslFeedback = candidates.find(
				(c) => c.tags.includes("glsl") && c.tags.includes("feedback"),
			);
			expect(glslFeedback).toBeDefined();
			expect(glslFeedback?.title).toContain("GLSL");
		});
	});

	describe("instancing detection", () => {
		it("detects instancing setup", () => {
			const data: ScanData = {
				anomalies: [
					{ detail: "/p/chop1", path: "/p/geo1", type: "instancing" },
				],
				connections: [],
				errors: [],
				operators: [
					{ family: "COMP", opType: "geometryCOMP", path: "/p/geo1" },
				],
			};

			const candidates = detectLessons(data, emptyRegistry());
			expect(candidates.some((c) => c.tags.includes("instancing"))).toBe(true);
		});
	});

	describe("CHOP export detection", () => {
		it("detects CHOP exports", () => {
			const data: ScanData = {
				anomalies: [
					{
						detail: "CHOP has active export",
						path: "/p/lfo1",
						type: "chop_export",
					},
				],
				connections: [],
				errors: [],
				operators: [{ family: "CHOP", opType: "lfoCHOP", path: "/p/lfo1" }],
			};

			const candidates = detectLessons(data, emptyRegistry());
			expect(
				candidates.some(
					(c) => c.tags.includes("chop") && c.tags.includes("export"),
				),
			).toBe(true);
		});
	});

	describe("pitfall detection", () => {
		it("detects orphan operators", () => {
			const data: ScanData = {
				anomalies: [
					{ detail: "No connections", path: "/p/orphan1", type: "orphan" },
				],
				connections: [],
				errors: [],
				operators: [{ family: "TOP", opType: "noiseTOP", path: "/p/orphan1" }],
			};

			const candidates = detectLessons(data, emptyRegistry());
			const orphan = candidates.find(
				(c) => c.category === "pitfall" && c.tags.includes("orphan"),
			);
			expect(orphan).toBeDefined();
		});

		it("detects error-state operators", () => {
			const data: ScanData = {
				anomalies: [],
				connections: [],
				errors: [{ message: "Cook error", path: "/p/broken1" }],
				operators: [{ family: "TOP", opType: "glslTOP", path: "/p/broken1" }],
			};

			const candidates = detectLessons(data, emptyRegistry());
			const errorCandidate = candidates.find(
				(c) => c.category === "pitfall" && c.tags.includes("error"),
			);
			expect(errorCandidate).toBeDefined();
		});
	});

	describe("deduplication", () => {
		it("marks candidates matching existing lessons", () => {
			const registry = emptyRegistry();
			const existingLesson: TDLessonEntry = {
				aliases: [],
				content: { summary: "Existing feedback lesson" },
				id: "feedback-existing",
				kind: "lesson",
				payload: {
					category: "pattern",
					operatorChain: [
						{ family: "TOP", opType: "feedbackTOP" },
						{ family: "TOP", opType: "glslTOP" },
					],
					tags: ["feedback"],
				},
				provenance: {
					confidence: "high",
					license: "MIT",
					source: "manual",
					validationCount: 3,
				},
				searchKeywords: ["feedback"],
				title: "Existing Feedback",
			};
			registry.addEntry(existingLesson);

			const data: ScanData = {
				anomalies: [],
				connections: [
					{ from: "/p/feedback1", fromOutput: 0, to: "/p/glsl1", toInput: 1 },
				],
				errors: [],
				operators: [
					{ family: "TOP", opType: "glslTOP", path: "/p/glsl1" },
					{ family: "TOP", opType: "feedbackTOP", path: "/p/feedback1" },
				],
			};

			const candidates = detectLessons(data, registry);
			const match = candidates.find((c) => c.tags.includes("feedback"));
			expect(match?.matchesExisting).toBe("feedback-existing");
		});
	});
});
