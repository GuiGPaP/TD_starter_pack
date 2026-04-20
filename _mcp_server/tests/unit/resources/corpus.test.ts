import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadKnowledgeEntries } from "../../../src/features/resources/loader.js";
import type { TDKnowledgeEntry } from "../../../src/features/resources/types.js";

/**
 * Contract tests against the real committed corpus in data/td-knowledge/.
 * These ensure that the canonical JSON files remain valid and complete.
 */

const CORPUS_PATH = join(
	import.meta.dirname,
	"..",
	"..",
	"..",
	"data",
	"td-knowledge",
);
const mockLogger = { sendLog: vi.fn() };

describe("Corpus contract — data/td-knowledge/", () => {
	const entries = loadKnowledgeEntries(CORPUS_PATH, mockLogger);

	it("loads without warnings", () => {
		const warnings = mockLogger.sendLog.mock.calls.filter(
			(c) => c[0].level === "warning",
		);
		expect(warnings).toHaveLength(0);
	});

	describe("python-module entries", () => {
		const modules = entries.filter(
			(e): e is TDKnowledgeEntry & { kind: "python-module" } =>
				e.kind === "python-module",
		);

		const expectedModuleIds = [
			"tdfunctions",
			"tdjson",
			"tdresources",
			"tdstoretools",
		];

		it("contains all 4 expected modules", () => {
			const ids = modules.map((m) => m.id).sort();
			expect(ids).toEqual(expectedModuleIds);
		});

		for (const id of expectedModuleIds) {
			describe(`module: ${id}`, () => {
				const mod = entries.find((e) => e.id === id) as
					| (TDKnowledgeEntry & { kind: "python-module" })
					| undefined;

				it("has non-empty content.warnings", () => {
					expect(mod).toBeDefined();
					expect(mod?.content.warnings).toBeDefined();
					expect(mod?.content.warnings?.length).toBeGreaterThan(0);
				});

				it("has non-empty payload.members", () => {
					expect(mod).toBeDefined();
					expect(mod?.payload.members.length).toBeGreaterThan(0);
				});
			});
		}
	});

	describe("glsl-pattern entries", () => {
		const patterns = entries.filter(
			(e): e is TDKnowledgeEntry & { kind: "glsl-pattern" } =>
				e.kind === "glsl-pattern",
		);

		const expectedPatternIds = [
			"basic-uvs",
			"color-utils",
			"copy-transforms",
			"displacement-noise",
			"feedback-decay",
			"generative-noise",
			"instancing-data",
			"math-utils",
			"multi-blend",
			"particle-forces",
			"passthrough",
			"phong-normalmap",
			"point-offset",
			"raymarching-basic",
			"reaction-diffusion",
			"sdf-primitives",
		];

		it("contains all 16 expected patterns", () => {
			const ids = patterns.map((p) => p.id).sort();
			expect(ids).toEqual(expectedPatternIds);
		});

		for (const id of expectedPatternIds) {
			describe(`pattern: ${id}`, () => {
				const pat = patterns.find((p) => p.id === id);

				it("has non-empty GLSL code", () => {
					expect(pat).toBeDefined();
					expect(pat?.payload.code.glsl.length).toBeGreaterThan(0);
				});

				it("has valid type", () => {
					expect(pat).toBeDefined();
					expect(["pixel", "vertex", "compute", "utility"]).toContain(
						pat?.payload.type,
					);
				});

				it("has valid difficulty", () => {
					expect(pat).toBeDefined();
					expect(["beginner", "intermediate", "advanced"]).toContain(
						pat?.payload.difficulty,
					);
				});
			});
		}

		it("vertex patterns have vertexGlsl", () => {
			const vertexPatterns = patterns.filter(
				(p) => p.payload.type === "vertex",
			);
			expect(vertexPatterns.length).toBeGreaterThan(0);
			for (const p of vertexPatterns) {
				expect(
					p.payload.code.vertexGlsl?.length,
					`${p.id} missing vertexGlsl`,
				).toBeGreaterThan(0);
			}
		});

		it("utility patterns have empty operators", () => {
			const utilityPatterns = patterns.filter(
				(p) => p.payload.type === "utility",
			);
			expect(utilityPatterns.length).toBeGreaterThan(0);
			for (const p of utilityPatterns) {
				expect(
					p.payload.setup.operators,
					`${p.id} should have empty operators`,
				).toEqual([]);
			}
		});

		it("non-utility patterns have non-empty operators", () => {
			const nonUtility = patterns.filter((p) => p.payload.type !== "utility");
			for (const p of nonUtility) {
				expect(
					p.payload.setup.operators.length,
					`${p.id} should have operators`,
				).toBeGreaterThan(0);
			}
		});
	});

	describe("operator entries", () => {
		const operators = entries.filter(
			(e): e is TDKnowledgeEntry & { kind: "operator" } =>
				e.kind === "operator",
		);

		it("does not redistribute td-docs operator entries", () => {
			expect(
				operators.filter(
					(operator) => operator.provenance.source === "td-docs",
				),
			).toHaveLength(0);
		});
	});
});
