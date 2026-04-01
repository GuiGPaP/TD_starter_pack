import { describe, expect, it } from "vitest";
import type { TDGlslPatternEntry } from "../../../src/features/resources/types.js";
import {
	formatGlslDeployResult,
	formatGlslPatternDetail,
	formatGlslPatternSearchResults,
} from "../../../src/features/tools/presenter/glslPatternFormatter.js";

function makeEntry(
	overrides: Partial<TDGlslPatternEntry> = {},
): TDGlslPatternEntry {
	return {
		content: {
			summary: "A test GLSL pattern",
			warnings: ["Watch out for GPU cost"],
		},
		id: "test-pattern",
		kind: "glsl-pattern",
		payload: {
			code: {
				glsl: "out vec4 fragColor;\nvoid main() { fragColor = vec4(1.0); }",
			},
			difficulty: "beginner",
			estimatedGpuCost: "low",
			setup: {
				operators: [
					{ family: "TOP", name: "test", role: "primary", type: "glslTOP" },
				],
				uniforms: [
					{
						default: "absTime.seconds",
						description: "Time in seconds",
						name: "uTime",
						type: "float",
					},
				],
			},
			tags: ["test", "basic"],
			type: "pixel",
		},
		provenance: { confidence: "high", license: "MIT", source: "manual" },
		searchKeywords: ["test"],
		title: "Test Pattern",
		...overrides,
	} as TDGlslPatternEntry;
}

describe("formatGlslPatternDetail", () => {
	it("should include title, summary, type, difficulty in markdown", () => {
		const result = formatGlslPatternDetail(makeEntry());
		expect(result).toContain("Test Pattern");
		expect(result).toContain("A test GLSL pattern");
		expect(result).toContain("pixel");
		expect(result).toContain("beginner");
	});

	it("should include GLSL code by default", () => {
		const result = formatGlslPatternDetail(makeEntry());
		expect(result).toContain("fragColor");
		expect(result).toContain("```glsl");
	});

	it("should include setup by default", () => {
		const result = formatGlslPatternDetail(makeEntry());
		expect(result).toContain("glslTOP");
		expect(result).toContain("uTime");
	});

	it("should include warnings", () => {
		const result = formatGlslPatternDetail(makeEntry());
		expect(result).toContain("Watch out for GPU cost");
	});

	it("should omit code when includeCode is false", () => {
		const result = formatGlslPatternDetail(makeEntry(), {
			includeCode: false,
		});
		expect(result).not.toContain("```glsl");
		expect(result).not.toContain("fragColor");
	});

	it("should omit setup when includeSetup is false", () => {
		const result = formatGlslPatternDetail(makeEntry(), {
			includeSetup: false,
		});
		expect(result).not.toContain("glslTOP");
		expect(result).not.toContain("uTime");
	});

	it("should omit code from structured JSON when includeCode is false", () => {
		const result = formatGlslPatternDetail(makeEntry(), {
			includeCode: false,
			responseFormat: "json",
		});
		const parsed = JSON.parse(result);
		expect(parsed.code).toBeUndefined();
		expect(parsed.id).toBe("test-pattern");
	});

	it("should omit setup from structured JSON when includeSetup is false", () => {
		const result = formatGlslPatternDetail(makeEntry(), {
			includeSetup: false,
			responseFormat: "json",
		});
		const parsed = JSON.parse(result);
		expect(parsed.setup).toBeUndefined();
	});

	it("should include code in structured JSON when includeCode is true", () => {
		const result = formatGlslPatternDetail(makeEntry(), {
			includeCode: true,
			responseFormat: "json",
		});
		const parsed = JSON.parse(result);
		expect(parsed.code).toBeDefined();
		expect(parsed.code.glsl).toContain("fragColor");
	});
});

describe("formatGlslPatternSearchResults", () => {
	it("should show result count", () => {
		const entries = [makeEntry({ id: "a", title: "A" })];
		const result = formatGlslPatternSearchResults(entries);
		expect(result).toContain("1 results");
	});

	it("should show entry details", () => {
		const entries = [makeEntry({ id: "noise", title: "Generative Noise" })];
		const result = formatGlslPatternSearchResults(entries);
		expect(result).toContain("Generative Noise");
		expect(result).toContain("noise");
	});

	it("should show empty message when no results", () => {
		const result = formatGlslPatternSearchResults([], { query: "xyz" });
		expect(result).toContain("No GLSL patterns found");
	});

	it("should include query in empty message", () => {
		const result = formatGlslPatternSearchResults([], {
			query: "feedback",
		});
		expect(result).toContain("feedback");
	});
});

describe("formatGlslDeployResult", () => {
	it("should show status and patternId", () => {
		const result = formatGlslDeployResult({
			patternId: "feedback-decay",
			status: "deployed",
		});
		expect(result).toContain("deployed");
		expect(result).toContain("feedback-decay");
	});

	it("should show completedSteps and failedStep for failures", () => {
		const result = formatGlslDeployResult({
			completedSteps: ["create_container", "create_operators"],
			failedStep: "inject_code",
			patternId: "test",
			rollbackStatus: "full",
			status: "rolled_back",
		});
		expect(result).toContain("inject_code");
		expect(result).toContain("create_container");
		expect(result).toContain("full");
	});

	it("should show postCheckStatus when present", () => {
		const result = formatGlslDeployResult({
			patternId: "test",
			postCheckStatus: "warnings",
			status: "deployed",
		});
		expect(result).toContain("warnings");
	});

	it("should show glslValidation results", () => {
		const result = formatGlslDeployResult({
			glslValidation: [
				{ errors: [], path: "/project1/test/glsl1_code", valid: true },
				{
					errors: ["syntax error"],
					path: "/project1/test/glsl2_code",
					valid: false,
				},
			],
			patternId: "test",
			status: "deployed",
		});
		expect(result).toContain("glsl1_code");
		expect(result).toContain("valid");
		expect(result).toContain("ERRORS");
	});

	it("should show skipped validation", () => {
		const result = formatGlslDeployResult({
			glslValidation: [
				{
					path: "/project1/test/dat1",
					reason: "validation unavailable",
					status: "skipped",
				},
			],
			patternId: "test",
			status: "deployed",
		});
		expect(result).toContain("skipped");
		expect(result).toContain("unavailable");
	});

	it("should show planned uniforms for dry_run", () => {
		const result = formatGlslDeployResult({
			patternId: "test",
			status: "dry_run",
			uniforms: [
				{ expression: "absTime.seconds", name: "uTime", type: "float" },
			],
		});
		expect(result).toContain("Planned Uniforms");
		expect(result).toContain("uTime");
		expect(result).toContain("absTime.seconds");
		expect(result).not.toContain("manual configuration");
	});

	it("should show manual uniforms for deployed status", () => {
		const result = formatGlslDeployResult({
			patternId: "test",
			status: "deployed",
			uniforms: [
				{
					description: "Time value",
					name: "uTime",
					page: "Custom",
					type: "float",
				},
			],
		});
		expect(result).toContain("manual configuration needed");
		expect(result).toContain("uTime");
		expect(result).toContain("Time value");
		expect(result).toContain("Page: Custom");
		expect(result).not.toContain("Planned Uniforms");
	});

	it("should show created nodes", () => {
		const result = formatGlslDeployResult({
			createdNodes: [
				{ name: "glsl1", path: "/project1/test/glsl1", type: "glslTOP" },
			],
			patternId: "test",
			status: "deployed",
		});
		expect(result).toContain("Created Nodes");
		expect(result).toContain("glsl1");
		expect(result).toContain("glslTOP");
	});
});

describe("formatGlslPatternDetail — optional sections", () => {
	it("should omit warnings section when no warnings", () => {
		const entry = makeEntry({
			content: { summary: "No warnings here" },
		});
		const result = formatGlslPatternDetail(entry);
		expect(result).not.toContain("## Warnings");
	});

	it("should omit tags when empty", () => {
		const entry = makeEntry();
		entry.payload.tags = [];
		const result = formatGlslPatternDetail(entry);
		expect(result).not.toContain("**Tags:**");
	});

	it("should omit GPU cost when not set", () => {
		const entry = makeEntry();
		entry.payload.estimatedGpuCost = undefined as unknown as string;
		const result = formatGlslPatternDetail(entry);
		expect(result).not.toContain("GPU Cost");
	});
});
