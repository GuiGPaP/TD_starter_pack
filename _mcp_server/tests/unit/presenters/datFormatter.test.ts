import { describe, expect, it } from "vitest";
import {
	formatLintDat,
	formatLintDats,
	formatValidateGlslDat,
	formatValidateJsonDat,
} from "../../../src/features/tools/presenter/datFormatter.js";
import type {
	LintDat200Data,
	LintDats200Data,
	ValidateGlslDat200Data,
	ValidateJsonDat200Data,
} from "../../../src/gen/endpoints/TouchDesignerAPI.js";

describe("datFormatter", () => {
	describe("formatLintDat", () => {
		it("should show diff for dry-run", () => {
			const data: LintDat200Data = {
				applied: false,
				diagnosticCount: 1,
				diagnostics: [
					{
						code: "F401",
						column: 1,
						fixable: true,
						line: 1,
						message: "unused import",
					},
				],
				diff: "--- /project1/script1 (original)\n+++ /project1/script1 (fixed)\n@@ -1 +0,0 @@\n-import os\n",
				fixed: true,
				name: "script1",
				path: "/project1/script1",
				remainingDiagnosticCount: 0,
				remainingDiagnostics: [],
			};

			const result = formatLintDat(data);

			expect(result).toContain("[DRY RUN] Fix preview:");
			expect(result).toContain("import os");
			expect(result).toContain("0 remaining issues after fix.");
		});

		it("should show remaining diagnostics after fix", () => {
			const data: LintDat200Data = {
				applied: true,
				diagnosticCount: 2,
				diagnostics: [
					{
						code: "F401",
						column: 1,
						fixable: true,
						line: 1,
						message: "unused import",
					},
					{
						code: "E711",
						column: 5,
						fixable: false,
						line: 3,
						message: "comparison to None",
					},
				],
				fixed: true,
				name: "script1",
				path: "/project1/script1",
				remainingDiagnosticCount: 1,
				remainingDiagnostics: [
					{
						code: "E711",
						column: 5,
						fixable: false,
						line: 3,
						message: "comparison to None",
					},
				],
			};

			const result = formatLintDat(data);

			expect(result).toContain("Auto-fix applied.");
			expect(result).toContain("Remaining after fix: 1 issue(s)");
			expect(result).toContain("E711");
		});

		it("should show applied fix with zero remaining", () => {
			const data: LintDat200Data = {
				applied: true,
				diagnosticCount: 1,
				diagnostics: [
					{
						code: "F401",
						column: 1,
						fixable: true,
						line: 1,
						message: "unused import",
					},
				],
				fixed: true,
				name: "script1",
				path: "/project1/script1",
				remainingDiagnosticCount: 0,
				remainingDiagnostics: [],
			};

			const result = formatLintDat(data);

			expect(result).toContain("Auto-fix applied.");
			expect(result).toContain("0 remaining issues after fix.");
			expect(result).not.toContain("[DRY RUN]");
		});
	});

	describe("formatValidateJsonDat", () => {
		it("should show valid JSON", () => {
			const data: ValidateJsonDat200Data = {
				diagnostics: [],
				format: "json",
				name: "data1",
				path: "/project1/data1",
				valid: true,
			};

			const result = formatValidateJsonDat(data);
			expect(result).toContain("/project1/data1");
			expect(result).toContain("valid json");
		});

		it("should show diagnostics for invalid content", () => {
			const data: ValidateJsonDat200Data = {
				diagnostics: [{ column: 9, line: 1, message: "Expecting value" }],
				format: "unknown",
				name: "data1",
				path: "/project1/data1",
				valid: false,
			};

			const result = formatValidateJsonDat(data);
			expect(result).toContain("invalid");
			expect(result).toContain("L1:9");
			expect(result).toContain("Expecting value");
		});

		it("should handle no data", () => {
			const result = formatValidateJsonDat(undefined);
			expect(result).toContain("Validation returned no data.");
		});
	});

	describe("formatValidateGlslDat", () => {
		it("should show valid GLSL", () => {
			const data: ValidateGlslDat200Data = {
				diagnostics: [],
				name: "shader_pixel",
				path: "/project1/shader_pixel",
				shaderType: "pixel",
				valid: true,
				validationMethod: "td_errors",
			};

			const result = formatValidateGlslDat(data);
			expect(result).toContain("/project1/shader_pixel");
			expect(result).toContain("valid GLSL");
			expect(result).toContain("pixel");
			expect(result).toContain("td_errors");
		});

		it("should show diagnostics for invalid GLSL", () => {
			const data: ValidateGlslDat200Data = {
				diagnostics: [
					{
						column: 1,
						line: 5,
						message: "undeclared identifier 'bad'",
						severity: "error",
					},
				],
				name: "shader_pixel",
				path: "/project1/shader_pixel",
				shaderType: "pixel",
				valid: false,
				validationMethod: "td_errors",
			};

			const result = formatValidateGlslDat(data);
			expect(result).toContain("invalid GLSL");
			expect(result).toContain("L5:1");
			expect(result).toContain("[error]");
			expect(result).toContain("undeclared identifier");
		});

		it("should handle no data", () => {
			const result = formatValidateGlslDat(undefined);
			expect(result).toContain("GLSL validation returned no data.");
		});

		it("should show validation method none", () => {
			const data: ValidateGlslDat200Data = {
				diagnostics: [],
				name: "shader_pixel",
				path: "/project1/shader_pixel",
				shaderType: "unknown",
				valid: true,
				validationMethod: "none",
			};

			const result = formatValidateGlslDat(data);
			expect(result).toContain("via none");
		});
	});

	describe("formatLintDats", () => {
		it("should show summary for batch lint with multiple DATs", () => {
			const data: LintDats200Data = {
				parentPath: "/project1",
				results: [
					{
						diagnosticCount: 3,
						diagnostics: [
							{
								code: "F401",
								column: 1,
								fixable: true,
								line: 1,
								message: "unused import",
							},
						],
						name: "script1",
						path: "/project1/script1",
					},
					{
						diagnosticCount: 2,
						diagnostics: [],
						name: "script2",
						path: "/project1/script2",
					},
					{
						diagnosticCount: 0,
						diagnostics: [],
						name: "script3",
						path: "/project1/script3",
					},
				],
				summary: {
					bySeverity: { error: 2, info: 2, warning: 1 },
					datsClean: 1,
					datsWithErrors: 2,
					fixableCount: 3,
					manualCount: 2,
					totalDatsScanned: 3,
					totalIssues: 5,
					worstOffenders: [
						{ diagnosticCount: 3, name: "script1", path: "/project1/script1" },
						{ diagnosticCount: 2, name: "script2", path: "/project1/script2" },
					],
				},
			};

			const result = formatLintDats(data, { detailLevel: "summary" });

			expect(result).toContain("3 DAT(s) scanned");
			expect(result).toContain("Issues: 5");
			expect(result).toContain("fixable: 3");
			expect(result).toContain("manual: 2");
			expect(result).toContain("DATs with errors: 2");
			expect(result).toContain("clean: 1");
			expect(result).toContain("errors=2");
			expect(result).toContain("warnings=1");
			expect(result).toContain("Worst offenders:");
			expect(result).toContain("script1");
			expect(result).toContain("3 issues");
		});

		it("should show detailed per-DAT breakdown in YAML for detailed mode", () => {
			const data: LintDats200Data = {
				parentPath: "/project1",
				results: [
					{
						diagnosticCount: 1,
						diagnostics: [
							{
								code: "F401",
								column: 1,
								fixable: true,
								line: 1,
								message: "unused import",
							},
						],
						name: "script1",
						path: "/project1/script1",
					},
					{
						diagnosticCount: 0,
						diagnostics: [],
						name: "script2",
						path: "/project1/script2",
					},
				],
				summary: {
					bySeverity: { error: 0, info: 1, warning: 0 },
					datsClean: 1,
					datsWithErrors: 1,
					fixableCount: 1,
					manualCount: 0,
					totalDatsScanned: 2,
					totalIssues: 1,
					worstOffenders: [],
				},
			};

			const result = formatLintDats(data, { detailLevel: "detailed" });

			// Detailed mode uses YAML serialization
			expect(result).toContain("F401");
			expect(result).toContain("unused import");
			expect(result).toContain("diagnosticCount");
		});

		it("should handle no data", () => {
			const result = formatLintDats(undefined);
			expect(result).toContain("Batch lint returned no data.");
		});
	});
});
