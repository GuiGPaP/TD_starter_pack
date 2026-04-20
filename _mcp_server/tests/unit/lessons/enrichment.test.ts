import { describe, expect, it } from "vitest";
import { generateSkillProposal } from "../../../src/features/lessons/enrichment.js";
import type { TDLessonEntry } from "../../../src/features/resources/types.js";

function makeLesson(overrides: Partial<TDLessonEntry> = {}): TDLessonEntry {
	return {
		aliases: [],
		content: { summary: "Test lesson summary" },
		id: "test",
		kind: "lesson",
		payload: {
			category: "pattern",
			tags: ["test"],
		},
		provenance: {
			confidence: "medium",
			license: "MIT",
			source: "manual",
			validationCount: 1,
		},
		searchKeywords: ["test"],
		title: "Test Lesson",
		...overrides,
	} as TDLessonEntry;
}

describe("generateSkillProposal", () => {
	it("maps GLSL tags to td-glsl skill", () => {
		const lesson = makeLesson({
			payload: { category: "pattern", tags: ["glsl", "shader", "feedback"] },
		});

		const proposal = generateSkillProposal(lesson);
		expect(proposal).toBeDefined();
		expect(proposal?.targetFile).toBe("td-glsl");
		expect(proposal?.section).toBe("Critical Guardrails");
		expect(proposal?.status).toBe("proposed");
	});

	it("maps Python tags to td-python skill", () => {
		const lesson = makeLesson({
			payload: { category: "pitfall", tags: ["python", "callback"] },
		});

		const proposal = generateSkillProposal(lesson);
		expect(proposal?.targetFile).toBe("td-python");
	});

	it("maps CHOP family to td-guide skill", () => {
		const lesson = makeLesson({
			payload: {
				category: "pattern",
				operatorChain: [{ family: "CHOP", opType: "lfoCHOP" }],
				tags: ["lfo", "audio"],
			},
		});

		const proposal = generateSkillProposal(lesson);
		expect(proposal?.targetFile).toBe("td-guide");
	});

	it("returns undefined for unmatched tags/families", () => {
		const lesson = makeLesson({
			payload: { category: "pattern", tags: ["misc", "random"] },
		});

		const proposal = generateSkillProposal(lesson);
		expect(proposal).toBeUndefined();
	});

	it("uses pitfall prefix for pitfalls", () => {
		const lesson = makeLesson({
			payload: {
				category: "pitfall",
				fix: "Clamp to 0-1",
				tags: ["glsl", "decay"],
			},
		});

		const proposal = generateSkillProposal(lesson);
		expect(proposal?.proposedAddition).toContain("⚠️");
		expect(proposal?.proposedAddition).toContain("Fix:");
	});

	it("uses pattern prefix for patterns", () => {
		const lesson = makeLesson({
			payload: { category: "pattern", tags: ["glsl", "feedback"] },
		});

		const proposal = generateSkillProposal(lesson);
		expect(proposal?.proposedAddition).toContain("✅");
	});
});
