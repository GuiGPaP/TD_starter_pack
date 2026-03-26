import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOOL_NAMES } from "../../../src/core/constants.js";
import type { KnowledgeRegistry } from "../../../src/features/resources/registry.js";
import type { TDKnowledgeEntry } from "../../../src/features/resources/types.js";
import { registerGlslPatternTools } from "../../../src/features/tools/handlers/glslPatternTools.js";
import { getTouchDesignerToolMetadata } from "../../../src/features/tools/metadata/touchDesignerToolMetadata.js";

// --- Helpers ---

function makePattern(
	overrides: Partial<TDKnowledgeEntry> = {},
): TDKnowledgeEntry {
	return {
		content: { summary: "A test pattern" },
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
		searchKeywords: ["test"],
		title: "Test Pattern",
		...overrides,
	} as TDKnowledgeEntry;
}

type ToolCall = {
	name: string;
	description: string;
	schema: unknown;
	handler: (params?: Record<string, unknown>) => Promise<unknown>;
};

function createMockServer() {
	const tools: ToolCall[] = [];
	return {
		server: {
			tool: vi.fn(
				(
					name: string,
					description: string,
					schema: unknown,
					handler: (params?: Record<string, unknown>) => Promise<unknown>,
				) => {
					tools.push({ description, handler, name, schema });
				},
			),
		},
		tools,
	};
}

function createMockRegistry(entries: TDKnowledgeEntry[]) {
	return {
		getById: vi.fn((id: string) => entries.find((e) => e.id === id)),
		getByKind: vi.fn((kind: string) => entries.filter((e) => e.kind === kind)),
		getGlslPatternIndex: vi.fn(() =>
			entries
				.filter((e) => e.kind === "glsl-pattern")
				.map((e) => ({ id: e.id, kind: e.kind, title: e.title })),
		),
		search: vi.fn(),
	} as unknown as KnowledgeRegistry;
}

// --- Tests ---

describe("GLSL Pattern Tools", () => {
	let mockServer: ReturnType<typeof createMockServer>;
	const mockLogger = { sendLog: vi.fn() };
	const mockServerMode = {
		isLive: true,
		mode: "live",
		on: vi.fn(),
		tdBuild: null,
		toJSON: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockServer = createMockServer();
	});

	function getToolHandler(name: string): ToolCall {
		const tool = mockServer.tools.find((t) => t.name === name);
		if (!tool) throw new Error(`Tool ${name} not registered`);
		return tool;
	}

	describe("registration", () => {
		it("should register all three tools", () => {
			const registry = createMockRegistry([]);
			registerGlslPatternTools(
				mockServer.server as never,
				mockLogger as never,
				{} as never, // tdClient
				registry,
				mockServerMode as never,
			);
			expect(mockServer.server.tool).toHaveBeenCalledTimes(3);
			const names = mockServer.tools.map((t) => t.name);
			expect(names).toContain(TOOL_NAMES.SEARCH_GLSL_PATTERNS);
			expect(names).toContain(TOOL_NAMES.GET_GLSL_PATTERN);
			expect(names).toContain(TOOL_NAMES.DEPLOY_GLSL_PATTERN);
		});
	});

	describe("get_glsl_pattern", () => {
		it("should return pattern for known ID", async () => {
			const entry = makePattern({ id: "passthrough", title: "Passthrough" });
			const registry = createMockRegistry([entry]);
			registerGlslPatternTools(
				mockServer.server as never,
				mockLogger as never,
				{} as never, // tdClient
				registry,
				mockServerMode as never,
			);

			const tool = getToolHandler(TOOL_NAMES.GET_GLSL_PATTERN);
			const result = (await tool.handler({ id: "passthrough" })) as {
				content: Array<{ text: string }>;
				isError?: boolean;
			};

			expect(result.isError).toBeUndefined();
			expect(result.content[0].text).toContain("Passthrough");
		});

		it("should return error for unknown ID", async () => {
			const registry = createMockRegistry([]);
			registerGlslPatternTools(
				mockServer.server as never,
				mockLogger as never,
				{} as never, // tdClient
				registry,
				mockServerMode as never,
			);

			const tool = getToolHandler(TOOL_NAMES.GET_GLSL_PATTERN);
			const result = (await tool.handler({ id: "nonexistent" })) as {
				content: Array<{ text: string }>;
				isError?: boolean;
			};

			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("not found");
		});

		it("should return error for non-glsl-pattern kind", async () => {
			const moduleEntry = {
				content: { summary: "A module" },
				id: "tdfunctions",
				kind: "python-module",
				payload: {
					canonicalName: "TDFunctions",
					members: [],
				},
				provenance: {
					confidence: "high",
					license: "MIT",
					source: "manual",
				},
				searchKeywords: [],
				title: "TDFunctions",
			} as TDKnowledgeEntry;
			const registry = createMockRegistry([moduleEntry]);
			registerGlslPatternTools(
				mockServer.server as never,
				mockLogger as never,
				{} as never, // tdClient
				registry,
				mockServerMode as never,
			);

			const tool = getToolHandler(TOOL_NAMES.GET_GLSL_PATTERN);
			const result = (await tool.handler({ id: "tdfunctions" })) as {
				isError?: boolean;
			};

			expect(result.isError).toBe(true);
		});
	});

	describe("search_glsl_patterns", () => {
		const entries = [
			makePattern({
				id: "passthrough",
				payload: {
					code: { glsl: "..." },
					difficulty: "beginner",
					setup: {
						operators: [{ family: "TOP", name: "pt", type: "glslTOP" }],
					},
					tags: ["basic", "texture"],
					type: "pixel",
				},
				title: "Passthrough",
			}),
			makePattern({
				aliases: ["vertex-basic"],
				id: "basic-uvs",
				payload: {
					code: {
						glsl: "...",
						vertexGlsl: "...",
					},
					difficulty: "beginner",
					setup: {
						operators: [{ family: "MAT", name: "uvs", type: "glslMAT" }],
					},
					tags: ["uv", "vertex"],
					type: "vertex",
				},
				title: "Basic UVs",
			}),
			makePattern({
				id: "raymarching-basic",
				payload: {
					code: { glsl: "..." },
					difficulty: "intermediate",
					setup: {
						operators: [{ family: "TOP", name: "rm", type: "glslTOP" }],
					},
					tags: ["raymarching", "SDF"],
					type: "pixel",
				},
				title: "Basic Raymarching",
			}),
		] as TDKnowledgeEntry[];

		function setupSearch() {
			const registry = createMockRegistry(entries);
			registerGlslPatternTools(
				mockServer.server as never,
				mockLogger as never,
				{} as never, // tdClient
				registry,
				mockServerMode as never,
			);
			return getToolHandler(TOOL_NAMES.SEARCH_GLSL_PATTERNS);
		}

		it("should return all patterns when no filters", async () => {
			const tool = setupSearch();
			const result = (await tool.handler({})) as {
				content: Array<{ text: string }>;
			};
			expect(result.content[0].text).toContain("3 results");
		});

		it("should filter by type", async () => {
			const tool = setupSearch();
			const result = (await tool.handler({ type: "vertex" })) as {
				content: Array<{ text: string }>;
			};
			expect(result.content[0].text).toContain("1 results");
			expect(result.content[0].text).toContain("Basic UVs");
		});

		it("should filter by difficulty", async () => {
			const tool = setupSearch();
			const result = (await tool.handler({
				difficulty: "intermediate",
			})) as {
				content: Array<{ text: string }>;
			};
			expect(result.content[0].text).toContain("1 results");
			expect(result.content[0].text).toContain("Raymarching");
		});

		it("should filter by tags", async () => {
			const tool = setupSearch();
			const result = (await tool.handler({ tags: ["SDF"] })) as {
				content: Array<{ text: string }>;
			};
			expect(result.content[0].text).toContain("Raymarching");
		});

		it("should filter by query (text match on title)", async () => {
			const tool = setupSearch();
			const result = (await tool.handler({ query: "passthrough" })) as {
				content: Array<{ text: string }>;
			};
			expect(result.content[0].text).toContain("Passthrough");
			expect(result.content[0].text).not.toContain("Raymarching");
		});

		it("should match by ID in query", async () => {
			const tool = setupSearch();
			const result = (await tool.handler({
				query: "raymarching-basic",
			})) as {
				content: Array<{ text: string }>;
			};
			expect(result.content[0].text).toContain("Raymarching");
		});

		it("should match by alias in query", async () => {
			const tool = setupSearch();
			const result = (await tool.handler({
				query: "vertex-basic",
			})) as {
				content: Array<{ text: string }>;
			};
			expect(result.content[0].text).toContain("Basic UVs");
		});

		it("should respect maxResults", async () => {
			const tool = setupSearch();
			const result = (await tool.handler({ maxResults: 1 })) as {
				content: Array<{ text: string }>;
			};
			expect(result.content[0].text).toContain("1 results");
		});

		it("should return empty for no match", async () => {
			const tool = setupSearch();
			const result = (await tool.handler({
				query: "nonexistent-xyz",
			})) as {
				content: Array<{ text: string }>;
			};
			expect(result.content[0].text).toContain("No GLSL patterns found");
		});
	});

	describe("deploy_glsl_pattern", () => {
		function setupDeploy(entries: TDKnowledgeEntry[] = []) {
			const registry = createMockRegistry(entries);
			registerGlslPatternTools(
				mockServer.server as never,
				mockLogger as never,
				{} as never, // tdClient
				registry,
				mockServerMode as never,
			);
			return getToolHandler(TOOL_NAMES.DEPLOY_GLSL_PATTERN);
		}

		it("should return error for root path", async () => {
			const tool = setupDeploy([makePattern()]);
			const result = (await tool.handler({
				id: "test-pattern",
				parentPath: "/",
			})) as { isError?: boolean; content: Array<{ text: string }> };
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("root");
		});

		it("should return error for unknown pattern", async () => {
			const tool = setupDeploy([]);
			const result = (await tool.handler({
				id: "nonexistent",
				parentPath: "/project1",
			})) as { isError?: boolean };
			expect(result.isError).toBe(true);
		});

		it("should return error for utility pattern", async () => {
			const utilEntry = makePattern({
				id: "sdf-primitives",
				payload: {
					code: { glsl: "// utility functions" },
					difficulty: "intermediate",
					setup: { operators: [] },
					type: "utility",
				},
			});
			const tool = setupDeploy([utilEntry]);
			const result = (await tool.handler({
				id: "sdf-primitives",
				parentPath: "/project1",
			})) as { isError?: boolean; content: Array<{ text: string }> };
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("utility");
		});

		it("should return dry-run plan without executing", async () => {
			const entry = makePattern({ id: "passthrough", title: "Passthrough" });
			const tool = setupDeploy([entry]);
			const result = (await tool.handler({
				dryRun: true,
				id: "passthrough",
				parentPath: "/project1",
			})) as { isError?: boolean; content: Array<{ text: string }> };
			expect(result.isError).toBeUndefined();
			expect(result.content[0].text).toContain("dry_run");
			expect(result.content[0].text).toContain("passthrough");
		});
	});

	describe("tool metadata", () => {
		it("should have metadata entries for all three tools", () => {
			const metadata = getTouchDesignerToolMetadata();
			const glslTools = metadata.filter(
				(m) =>
					m.tool === TOOL_NAMES.GET_GLSL_PATTERN ||
					m.tool === TOOL_NAMES.SEARCH_GLSL_PATTERNS ||
					m.tool === TOOL_NAMES.DEPLOY_GLSL_PATTERN,
			);
			expect(glslTools).toHaveLength(3);
		});
	});
});
