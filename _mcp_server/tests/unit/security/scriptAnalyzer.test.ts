import { describe, expect, it } from "vitest";
import { analyzeScript } from "../../../src/features/tools/security/scriptAnalyzer.js";

describe("scriptAnalyzer", () => {
	describe("full-exec mode", () => {
		it("allows everything in full-exec", () => {
			const result = analyzeScript("os.system('rm -rf /')", "full-exec");
			expect(result.allowed).toBe(true);
			expect(result.violations).toHaveLength(0);
		});
	});

	describe("read-only mode", () => {
		it("allows reading op attributes", () => {
			const result = analyzeScript("op('/project1').name", "read-only");
			expect(result.allowed).toBe(true);
		});

		it("allows print and introspection", () => {
			const result = analyzeScript("print(len(op('/').children))", "read-only");
			expect(result.allowed).toBe(true);
		});

		it("allows reading parameters", () => {
			const result = analyzeScript(
				"op('/project1/geo1').par.tx.val",
				"read-only",
			);
			expect(result.allowed).toBe(true);
		});

		it("blocks parameter assignment", () => {
			const result = analyzeScript(
				"op('/project1/geo1').par.tx = 5",
				"read-only",
			);
			expect(result.allowed).toBe(false);
			expect(result.requiredMode).toBe("safe-write");
			expect(result.violations).toHaveLength(1);
			expect(result.violations[0].line).toBe(1);
			expect(result.violations[0].category).toBe("write");
		});

		it("does not block == comparison", () => {
			const result = analyzeScript(
				"if op('/geo1').par.tx == 5: pass",
				"read-only",
			);
			expect(result.allowed).toBe(true);
		});

		it("blocks .create()", () => {
			const result = analyzeScript(
				"op('/project1').create(baseCOMP, 'mycomp')",
				"read-only",
			);
			expect(result.allowed).toBe(false);
			expect(result.requiredMode).toBe("safe-write");
		});

		it("blocks .connect()", () => {
			const result = analyzeScript(
				"op('/a').outputConnectors[0].connect(op('/b'))",
				"read-only",
			);
			expect(result.allowed).toBe(false);
		});

		it("blocks .text assignment", () => {
			const result = analyzeScript(
				"op('/project1/dat1').text = 'hello'",
				"read-only",
			);
			expect(result.allowed).toBe(false);
		});

		it("blocks os.system (escalates to full-exec)", () => {
			const result = analyzeScript("os.system('ls')", "read-only");
			expect(result.allowed).toBe(false);
			expect(result.requiredMode).toBe("full-exec");
		});

		it("blocks .destroy()", () => {
			const result = analyzeScript(
				"op('/project1/geo1').destroy()",
				"read-only",
			);
			expect(result.allowed).toBe(false);
			expect(result.requiredMode).toBe("full-exec");
		});
	});

	describe("safe-write mode", () => {
		it("allows parameter assignment", () => {
			const result = analyzeScript(
				"op('/project1/geo1').par.tx = 5",
				"safe-write",
			);
			expect(result.allowed).toBe(true);
		});

		it("allows .create()", () => {
			const result = analyzeScript(
				"op('/project1').create(baseCOMP, 'mycomp')",
				"safe-write",
			);
			expect(result.allowed).toBe(true);
		});

		it("allows .connect()", () => {
			const result = analyzeScript(
				"op('/a').outputConnectors[0].connect(op('/b'))",
				"safe-write",
			);
			expect(result.allowed).toBe(true);
		});

		it("blocks .destroy()", () => {
			const result = analyzeScript(
				"op('/project1/geo1').destroy()",
				"safe-write",
			);
			expect(result.allowed).toBe(false);
			expect(result.requiredMode).toBe("full-exec");
			expect(result.violations[0].category).toBe("delete");
		});

		it("blocks os.system", () => {
			const result = analyzeScript("os.system('rm -rf /')", "safe-write");
			expect(result.allowed).toBe(false);
			expect(result.requiredMode).toBe("full-exec");
		});

		it("blocks subprocess", () => {
			const result = analyzeScript(
				"import subprocess\nsubprocess.run(['ls'])",
				"safe-write",
			);
			expect(result.allowed).toBe(false);
		});

		it("blocks exec()", () => {
			const result = analyzeScript("exec('print(1)')", "safe-write");
			expect(result.allowed).toBe(false);
		});

		it("blocks eval()", () => {
			const result = analyzeScript("eval('1+1')", "safe-write");
			expect(result.allowed).toBe(false);
		});

		it("blocks import os", () => {
			const result = analyzeScript("import os", "safe-write");
			expect(result.allowed).toBe(false);
		});

		it("blocks from os import", () => {
			const result = analyzeScript("from os import path", "safe-write");
			expect(result.allowed).toBe(false);
		});

		it("blocks open with write mode", () => {
			const result = analyzeScript("open('/tmp/f', 'w')", "safe-write");
			expect(result.allowed).toBe(false);
		});

		it("blocks socket", () => {
			const result = analyzeScript("import socket", "safe-write");
			expect(result.allowed).toBe(false);
		});
	});

	describe("edge cases", () => {
		it("ignores patterns in comments", () => {
			const result = analyzeScript(
				"# op('/').destroy() is dangerous",
				"read-only",
			);
			expect(result.allowed).toBe(true);
		});

		it("handles multiline scripts", () => {
			const result = analyzeScript(
				"x = op('/project1')\ny = x.par.tx.val\nprint(y)",
				"read-only",
			);
			expect(result.allowed).toBe(true);
		});

		it("reports correct line numbers", () => {
			const result = analyzeScript(
				"# comment\nprint('hello')\nop('/').destroy()",
				"read-only",
			);
			expect(result.violations.some((v) => v.line === 3)).toBe(true);
		});

		it("collects multiple violations", () => {
			const result = analyzeScript(
				"op('/a').par.tx = 1\nop('/b').destroy()",
				"read-only",
			);
			expect(result.violations.length).toBeGreaterThanOrEqual(2);
			expect(result.requiredMode).toBe("full-exec");
		});

		it("handles empty script", () => {
			const result = analyzeScript("", "read-only");
			expect(result.allowed).toBe(true);
			expect(result.violations).toHaveLength(0);
		});
	});

	describe("confidence", () => {
		it("high confidence for simple scripts", () => {
			const result = analyzeScript("op('/project1').name", "read-only");
			expect(result.confidence).toBe("high");
		});

		it("low confidence when eval is present", () => {
			const result = analyzeScript("eval('op(\"/\").name')", "full-exec");
			expect(result.confidence).toBe("low");
		});

		it("medium confidence with loops", () => {
			const result = analyzeScript(
				"for c in op('/').children:\n  print(c.name)",
				"read-only",
			);
			expect(result.confidence).toBe("medium");
		});
	});
});
