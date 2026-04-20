import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOOL_NAMES } from "../../../src/core/constants.js";
import type { KnowledgeRegistry } from "../../../src/features/resources/registry.js";
import type { TDKnowledgeEntry } from "../../../src/features/resources/types.js";
import { registerTechniqueTools } from "../../../src/features/tools/handlers/techniqueTools.js";

// --- Helpers ---

function makeTechnique(
	overrides: Partial<TDKnowledgeEntry> = {},
): TDKnowledgeEntry {
	return {
		aliases: [],
		content: {
			summary: "Detect beats in audio and drive visual parameters",
		},
		id: "beat-detection",
		kind: "technique",
		payload: {
			category: "audio-visual",
			codeSnippets: [
				{
					code: "val = op('analyze1')['chan1']",
					label: "Read peak value",
					language: "python",
				},
			],
			difficulty: "intermediate",
			operatorChain: [
				{ family: "CHOP", opType: "audiodeviceinCHOP", role: "input" },
				{ family: "CHOP", opType: "analyzeCHOP", role: "processing" },
			],
			tags: ["audio", "beat", "chop", "live"],
			tips: ["Use Lag CHOP to smooth transitions"],
		},
		provenance: {
			confidence: "medium",
			license: "MIT",
			source: "manual",
		},
		searchKeywords: ["beat", "audio", "detection"],
		title: "Beat Detection with Audio Spectrum",
		...overrides,
	} as TDKnowledgeEntry;
}

function makeMlTechnique(): TDKnowledgeEntry {
	return {
		aliases: [],
		content: {
			summary: "Use MediaPipe for skeleton tracking in TD",
		},
		id: "mediapipe-tracking",
		kind: "technique",
		payload: {
			category: "ml",
			difficulty: "advanced",
			operatorChain: [],
			tags: ["ml", "tracking", "mediapipe"],
		},
		provenance: {
			confidence: "medium",
			license: "MIT",
			source: "manual",
		},
		searchKeywords: ["mediapipe", "skeleton", "ml"],
		title: "MediaPipe Skeleton Tracking",
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
		getIndexByKind: vi.fn((kind: string) =>
			entries
				.filter((e) => e.kind === kind)
				.map((e) => ({ id: e.id, kind: e.kind, title: e.title })),
		),
		search: vi.fn(),
	} as unknown as KnowledgeRegistry;
}

function getRegisteredHandler(tools: ToolCall[], toolName: string) {
	const tool = tools.find((candidate) => candidate.name === toolName);
	if (!tool) throw new Error(`Expected tool to be registered: ${toolName}`);
	return tool.handler;
}

const mockLogger = { sendLog: vi.fn() };
const mockServerMode = { tdBuild: null } as never;

// --- Tests ---

describe("techniqueTools", () => {
	let tools: ToolCall[];
	const entries = [makeTechnique(), makeMlTechnique()];

	beforeEach(() => {
		const { server, tools: t } = createMockServer();
		tools = t;
		const registry = createMockRegistry(entries);
		registerTechniqueTools(
			server as never,
			mockLogger as never,
			registry,
			mockServerMode,
		);
	});

	it("should register search_techniques and get_technique tools", () => {
		const names = tools.map((t) => t.name);
		expect(names).toContain(TOOL_NAMES.SEARCH_TECHNIQUES);
		expect(names).toContain(TOOL_NAMES.GET_TECHNIQUE);
	});

	describe("search_techniques", () => {
		function getHandler() {
			return getRegisteredHandler(tools, TOOL_NAMES.SEARCH_TECHNIQUES);
		}

		it("should return all techniques without filters", async () => {
			const result = (await getHandler()()) as {
				content: { text: string }[];
			};
			expect(result.content[0].text).toContain("Beat Detection");
			expect(result.content[0].text).toContain("MediaPipe");
		});

		it("should filter by category", async () => {
			const result = (await getHandler()({
				category: "audio-visual",
			})) as { content: { text: string }[] };
			expect(result.content[0].text).toContain("Beat Detection");
			expect(result.content[0].text).not.toContain("MediaPipe");
		});

		it("should filter by difficulty", async () => {
			const result = (await getHandler()({
				difficulty: "advanced",
			})) as { content: { text: string }[] };
			expect(result.content[0].text).toContain("MediaPipe");
			expect(result.content[0].text).not.toContain("Beat Detection");
		});

		it("should filter by query", async () => {
			const result = (await getHandler()({ query: "beat" })) as {
				content: { text: string }[];
			};
			expect(result.content[0].text).toContain("Beat Detection");
			expect(result.content[0].text).not.toContain("MediaPipe");
		});
	});

	describe("get_technique", () => {
		function getHandler() {
			return getRegisteredHandler(tools, TOOL_NAMES.GET_TECHNIQUE);
		}

		it("should return technique detail", async () => {
			const result = (await getHandler()({ id: "beat-detection" })) as {
				content: { text: string }[];
			};
			expect(result.content[0].text).toContain("Beat Detection");
			expect(result.content[0].text).toContain("audio-visual");
		});

		it("should return error for unknown ID", async () => {
			const result = (await getHandler()({ id: "nope" })) as {
				content: { text: string }[];
				isError: boolean;
			};
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("not found");
		});
	});
});
