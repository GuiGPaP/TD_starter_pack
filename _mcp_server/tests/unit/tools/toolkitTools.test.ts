import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOOL_NAMES } from "../../../src/core/constants.js";
import type { KnowledgeRegistry } from "../../../src/features/resources/registry.js";
import type { TDKnowledgeEntry } from "../../../src/features/resources/types.js";
import { registerToolkitTools } from "../../../src/features/tools/handlers/toolkitTools.js";

// --- Helpers ---

function makeToolkit(
	overrides: Partial<TDKnowledgeEntry> = {},
): TDKnowledgeEntry {
	return {
		aliases: ["t3d"],
		content: {
			summary: "3D texture operators for TouchDesigner",
			warnings: ["Patreon-licensed"],
		},
		id: "t3d-toolkit",
		kind: "toolkit",
		payload: {
			detectionPaths: ["/project1/T3D"],
			installHint: "Drop T3D.tox into your project.",
			name: "T3D",
			opFamilyPrefix: "T3D",
			vendor: "Josef Pelz",
			version: "1.12.7",
		},
		provenance: {
			confidence: "low",
			license: "proprietary-patreon",
			source: "manual",
		},
		searchKeywords: ["3d", "texture", "t3d"],
		title: "T3D — 3D Texture Operators",
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
		getByKind: vi.fn((kind: string) =>
			entries.filter((e) => e.kind === kind),
		),
		getToolkitIndex: vi.fn(() =>
			entries
				.filter((e) => e.kind === "toolkit")
				.map((e) => ({ id: e.id, kind: e.kind, title: e.title })),
		),
		search: vi.fn(),
	} as unknown as KnowledgeRegistry;
}

// --- Tests ---

describe("Toolkit Tools", () => {
	let mockServer: ReturnType<typeof createMockServer>;
	const mockLogger = { sendLog: vi.fn() };
	const mockServerMode = {
		isLive: true,
		mode: "live",
		on: vi.fn(),
		tdBuild: null,
		toJSON: vi.fn(),
	};
	const mockTdClient = {
		execPythonScript: vi.fn(),
		healthProbe: vi.fn(),
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

	function registerAll(entries: TDKnowledgeEntry[] = []) {
		const registry = createMockRegistry(entries);
		registerToolkitTools(
			mockServer.server as never,
			mockLogger as never,
			registry,
			mockServerMode as never,
			mockTdClient as never,
		);
		return registry;
	}

	describe("registration", () => {
		it("should register all three tools", () => {
			registerAll([]);
			expect(mockServer.server.tool).toHaveBeenCalledTimes(3);
			const names = mockServer.tools.map((t) => t.name);
			expect(names).toContain(TOOL_NAMES.SEARCH_TOOLKITS);
			expect(names).toContain(TOOL_NAMES.GET_TOOLKIT);
			expect(names).toContain(TOOL_NAMES.DETECT_TOOLKITS);
		});
	});

	describe("search_toolkits", () => {
		const entries = [
			makeToolkit(),
			makeToolkit({
				aliases: ["lops"],
				id: "lop-toolkit",
				payload: {
					dependencies: ["Python 3.11.9"],
					detectionPaths: ["/project1/dot_lops"],
					name: "LOPs",
					opFamilyPrefix: "LOP",
					vendor: "alltd.org",
					version: "0.1.1",
				},
				searchKeywords: ["lop", "ai", "llm"],
				title: "LOPs — Language Operators",
			}),
		] as TDKnowledgeEntry[];

		it("should return all toolkits when no query", async () => {
			registerAll(entries);
			const tool = getToolHandler(TOOL_NAMES.SEARCH_TOOLKITS);
			const result = (await tool.handler({})) as {
				content: Array<{ text: string }>;
			};
			expect(result.content[0].text).toContain("2 toolkit(s)");
		});

		it("should filter by query", async () => {
			registerAll(entries);
			const tool = getToolHandler(TOOL_NAMES.SEARCH_TOOLKITS);
			const result = (await tool.handler({ query: "T3D" })) as {
				content: Array<{ text: string }>;
			};
			expect(result.content[0].text).toContain("T3D");
			expect(result.content[0].text).not.toContain("LOPs");
		});

		it("should return empty for no match", async () => {
			registerAll(entries);
			const tool = getToolHandler(TOOL_NAMES.SEARCH_TOOLKITS);
			const result = (await tool.handler({
				query: "nonexistent-xyz",
			})) as { content: Array<{ text: string }> };
			expect(result.content[0].text).toContain("No toolkits found");
		});

		it("should respect maxResults", async () => {
			registerAll(entries);
			const tool = getToolHandler(TOOL_NAMES.SEARCH_TOOLKITS);
			const result = (await tool.handler({ maxResults: 1 })) as {
				content: Array<{ text: string }>;
			};
			expect(result.content[0].text).toContain("1 toolkit(s)");
		});
	});

	describe("get_toolkit", () => {
		it("should return toolkit for known ID", async () => {
			const entry = makeToolkit();
			registerAll([entry]);
			const tool = getToolHandler(TOOL_NAMES.GET_TOOLKIT);
			const result = (await tool.handler({ id: "t3d-toolkit" })) as {
				content: Array<{ text: string }>;
				isError?: boolean;
			};
			expect(result.isError).toBeUndefined();
			expect(result.content[0].text).toContain("T3D");
			expect(result.content[0].text).toContain("Josef Pelz");
		});

		it("should return error for unknown ID", async () => {
			registerAll([]);
			const tool = getToolHandler(TOOL_NAMES.GET_TOOLKIT);
			const result = (await tool.handler({ id: "nonexistent" })) as {
				content: Array<{ text: string }>;
				isError?: boolean;
			};
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("not found");
		});

		it("should return error for non-toolkit kind", async () => {
			const moduleEntry = {
				content: { summary: "A module" },
				id: "tdfunctions",
				kind: "python-module",
				payload: { canonicalName: "TDFunctions", members: [] },
				provenance: { confidence: "high", license: "MIT", source: "manual" },
				searchKeywords: [],
				title: "TDFunctions",
			} as TDKnowledgeEntry;
			registerAll([moduleEntry]);
			const tool = getToolHandler(TOOL_NAMES.GET_TOOLKIT);
			const result = (await tool.handler({ id: "tdfunctions" })) as {
				isError?: boolean;
			};
			expect(result.isError).toBe(true);
		});
	});

	describe("detect_toolkits", () => {
		it("should return detection results from TD", async () => {
			const entry = makeToolkit();
			registerAll([entry]);

			mockTdClient.execPythonScript.mockResolvedValue({
				data: {
					result: [
						{
							detected: true,
							path: "/project1/T3D",
							toolkitId: "t3d-toolkit",
							toolkitName: "T3D",
						},
					],
				},
				success: true,
			});

			const tool = getToolHandler(TOOL_NAMES.DETECT_TOOLKITS);
			const result = (await tool.handler({})) as {
				content: Array<{ text: string }>;
				isError?: boolean;
			};

			expect(result.isError).toBeUndefined();
			expect(result.content[0].text).toContain("INSTALLED");
			expect(result.content[0].text).toContain("T3D");
		});

		it("should handle not-found toolkits", async () => {
			const entry = makeToolkit();
			registerAll([entry]);

			mockTdClient.execPythonScript.mockResolvedValue({
				data: {
					result: [
						{
							detected: false,
							path: "/project1/T3D",
							toolkitId: "t3d-toolkit",
							toolkitName: "T3D",
						},
					],
				},
				success: true,
			});

			const tool = getToolHandler(TOOL_NAMES.DETECT_TOOLKITS);
			const result = (await tool.handler({})) as {
				content: Array<{ text: string }>;
			};

			expect(result.content[0].text).toContain("NOT FOUND");
		});

		it("should handle script failure", async () => {
			const entry = makeToolkit();
			registerAll([entry]);

			mockTdClient.execPythonScript.mockResolvedValue({
				error: "Connection refused",
				success: false,
			});

			const tool = getToolHandler(TOOL_NAMES.DETECT_TOOLKITS);
			const result = (await tool.handler({})) as {
				content: Array<{ text: string }>;
				isError?: boolean;
			};

			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("Detection failed");
		});

		it("should return message when no toolkits registered", async () => {
			registerAll([]);
			const tool = getToolHandler(TOOL_NAMES.DETECT_TOOLKITS);
			const result = (await tool.handler({})) as {
				content: Array<{ text: string }>;
			};

			expect(result.content[0].text).toContain(
				"No toolkits registered",
			);
		});
	});
});
