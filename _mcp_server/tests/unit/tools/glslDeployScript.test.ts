import { describe, expect, it } from "vitest";
import type { TDGlslPatternEntry } from "../../../src/features/resources/types.js";
import { generateGlslDeployScript } from "../../../src/features/tools/glslDeployScript.js";

function makePattern(
	overrides: Partial<TDGlslPatternEntry> = {},
): TDGlslPatternEntry {
	return {
		content: { summary: "Test pattern" },
		id: "test-pattern",
		kind: "glsl-pattern",
		payload: {
			code: {
				glsl: "out vec4 fragColor;\nvoid main() { fragColor = vec4(1.0); }",
			},
			difficulty: "beginner",
			setup: {
				operators: [
					{
						family: "TOP",
						name: "glsl1",
						role: "primary",
						type: "glslTOP",
					},
				],
			},
			tags: ["test"],
			type: "pixel",
		},
		provenance: { confidence: "high", license: "MIT", source: "manual" },
		searchKeywords: ["test"],
		title: "Test Pattern",
		...overrides,
	} as TDGlslPatternEntry;
}

describe("generateGlslDeployScript", () => {
	it("should contain the pattern ID", () => {
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1",
			pattern: makePattern({ id: "feedback-decay" }),
		});
		expect(script).toContain("feedback-decay");
	});

	it("should contain the parent path", () => {
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1/fx",
			pattern: makePattern(),
		});
		expect(script).toContain("/project1/fx");
	});

	it("should contain operator names from spec", () => {
		const pattern = makePattern({
			payload: {
				code: { glsl: "void main() {}" },
				difficulty: "beginner",
				setup: {
					operators: [
						{
							family: "TOP",
							name: "glsl1",
							role: "primary",
							type: "glslTOP",
						},
						{ family: "TOP", name: "feedback1", type: "feedbackTOP" },
					],
				},
				type: "pixel",
			},
		});
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1",
			pattern,
		});
		expect(script).toContain("glsl1");
		expect(script).toContain("feedback1");
	});

	it("should map glslTOP to glslmultiTOP for TD class", () => {
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1",
			pattern: makePattern(),
		});
		expect(script).toContain("glslmultiTOP");
	});

	it("should contain GLSL code for pixel patterns", () => {
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1",
			pattern: makePattern(),
		});
		expect(script).toContain("fragColor");
	});

	it("should contain connection wiring for patterns with connections", () => {
		const pattern = makePattern({
			payload: {
				code: { glsl: "void main() {}" },
				difficulty: "intermediate",
				setup: {
					connections: [
						{ from: "feedback1", fromOutput: 0, to: "glsl1", toInput: 1 },
					],
					operators: [
						{
							family: "TOP",
							name: "glsl1",
							role: "primary",
							type: "glslTOP",
						},
						{ family: "TOP", name: "feedback1", type: "feedbackTOP" },
					],
				},
				type: "pixel",
			},
		});
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1",
			pattern,
		});
		expect(script).toContain("outputConnectors[0]");
		expect(script).toContain("inputConnectors[1]");
	});

	it("should handle vertex patterns with vertexGlsl", () => {
		const pattern = makePattern({
			payload: {
				code: {
					glsl: "// fragment shader",
					vertexGlsl: "// vertex shader with TDDeform",
				},
				difficulty: "beginner",
				setup: {
					operators: [
						{
							family: "MAT",
							name: "mat1",
							role: "primary",
							type: "glslMAT",
						},
					],
				},
				type: "vertex",
			},
		});
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1",
			pattern,
		});
		expect(script).toContain("vertex shader with TDDeform");
		expect(script).toContain("fragment shader");
		expect(script).toContain("vert_dat");
		expect(script).toContain("frag_dat");
	});

	it("should handle compute patterns", () => {
		const pattern = makePattern({
			payload: {
				code: { glsl: "// compute shader" },
				difficulty: "beginner",
				setup: {
					operators: [
						{
							family: "POP",
							name: "pop1",
							role: "primary",
							type: "glslPOP",
						},
					],
				},
				type: "compute",
			},
		});
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1",
			pattern,
		});
		expect(script).toContain("compute shader");
		expect(script).toContain("par.glsl");
	});

	it("should include step tracking", () => {
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1",
			pattern: makePattern(),
		});
		expect(script).toContain("completed_steps");
		expect(script).toContain("'create_container'");
		expect(script).toContain("'create_operators'");
		expect(script).toContain("'inject_code'");
		expect(script).toContain("'wire_connections'");
	});

	it("should include shaderDatPaths in result", () => {
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1",
			pattern: makePattern(),
		});
		expect(script).toContain("shader_dat_paths");
		expect(script).toContain('"shaderDatPaths"');
	});

	it("should add pixel DAT to created_nodes and shader_dat_paths", () => {
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1",
			pattern: makePattern(),
		});
		// Pixel patterns should append glsl_dat to created_nodes
		expect(script).toContain("created_nodes.append({'name': glsl_dat.name");
		expect(script).toContain("shader_dat_paths.append(glsl_dat.path)");
	});

	it("should add vertex DATs to shader_dat_paths", () => {
		const pattern = makePattern({
			payload: {
				code: { glsl: "// frag", vertexGlsl: "// vert" },
				difficulty: "beginner",
				setup: {
					operators: [
						{ family: "MAT", name: "m1", role: "primary", type: "glslMAT" },
					],
				},
				type: "vertex",
			},
		});
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1",
			pattern,
		});
		expect(script).toContain("shader_dat_paths.append(vert_dat.path)");
		expect(script).toContain("shader_dat_paths.append(frag_dat.path)");
	});

	it("should include structured error with failedStep and rollbackStatus", () => {
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1",
			pattern: makePattern(),
		});
		expect(script).toContain("rolled_back");
		expect(script).toContain("failedStep");
		expect(script).toContain("rollbackStatus");
		expect(script).toContain("completedSteps");
		expect(script).toContain("destroy()");
	});

	it("should include ownership markers", () => {
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1",
			pattern: makePattern({ id: "my-pattern" }),
		});
		expect(script).toContain("mcp-glsl-pattern");
		expect(script).toContain("mcp_pattern_id");
		expect(script).toContain("my-pattern");
	});

	it("should escape single quotes in strings", () => {
		const script = generateGlslDeployScript({
			containerName: "test",
			parentPath: "/project1/it's",
			pattern: makePattern(),
		});
		expect(script).toContain("/project1/it\\'s");
	});
});
