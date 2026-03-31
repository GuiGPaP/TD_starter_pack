import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOOL_NAMES } from "../../../src/core/constants.js";
import type { KnowledgeRegistry } from "../../../src/features/resources/registry.js";
import type { TDKnowledgeEntry } from "../../../src/features/resources/types.js";
import { registerTutorialTools } from "../../../src/features/tools/handlers/tutorialTools.js";

// --- Helpers ---

function makeTutorial(
	overrides: Partial<TDKnowledgeEntry> = {},
): TDKnowledgeEntry {
	return {
		aliases: [],
		content: {
			summary: "Learn to build and control feedback loops in TOPs",
		},
		id: "feedback-loop-basics",
		kind: "tutorial",
		payload: {
			difficulty: "beginner",
			estimatedTime: "15 minutes",
			prerequisites: ["Basic TouchDesigner knowledge"],
			relatedOperators: ["feedbackTOP", "noiseTOP", "levelTOP"],
			sections: [
				{
					content: "A feedback loop recirculates output back as input.",
					title: "Introduction",
				},
				{
					code: "op('/project1').create('feedbackTOP', 'feedback1')",
					content: "Create the basic feedback circuit.",
					title: "Creating the circuit",
				},
			],
			tags: ["feedback", "top", "visual", "beginner"],
		},
		provenance: {
			confidence: "medium",
			license: "MIT",
			source: "manual",
		},
		searchKeywords: ["feedback", "loop", "visual"],
		title: "Feedback Loop Basics",
		...overrides,
	} as TDKnowledgeEntry;
}

function makeAdvancedTutorial(): TDKnowledgeEntry {
	return {
		aliases: [],
		content: {
			summary: "Build GPU particle systems with GLSL POPs",
		},
		id: "particle-systems-pop",
		kind: "tutorial",
		payload: {
			difficulty: "advanced",
			estimatedTime: "45 minutes",
			prerequisites: ["GLSL basics", "POP family knowledge"],
			relatedOperators: ["glslPOP", "glslAdvancedPOP"],
			sections: [
				{
					content: "POPs process points on the GPU via compute shaders.",
					title: "POP Architecture",
				},
			],
			tags: ["pop", "glsl", "particles", "advanced"],
		},
		provenance: {
			confidence: "medium",
			license: "MIT",
			source: "manual",
		},
		searchKeywords: ["particle", "pop", "glsl", "compute"],
		title: "Building Particle Systems with POPs",
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
		getIndexByKind: vi.fn((kind: string) =>
			entries
				.filter((e) => e.kind === kind)
				.map((e) => ({ id: e.id, kind: e.kind, title: e.title })),
		),
		search: vi.fn(),
	} as unknown as KnowledgeRegistry;
}

const mockLogger = { sendLog: vi.fn() };
const mockServerMode = { tdBuild: null } as never;

// --- Tests ---

describe("tutorialTools", () => {
	let tools: ToolCall[];
	const entries = [makeTutorial(), makeAdvancedTutorial()];

	beforeEach(() => {
		const { server, tools: t } = createMockServer();
		tools = t;
		const registry = createMockRegistry(entries);
		registerTutorialTools(
			server as never,
			mockLogger as never,
			registry,
			mockServerMode,
		);
	});

	it("should register search_tutorials and get_tutorial tools", () => {
		const names = tools.map((t) => t.name);
		expect(names).toContain(TOOL_NAMES.SEARCH_TUTORIALS);
		expect(names).toContain(TOOL_NAMES.GET_TUTORIAL);
	});

	describe("search_tutorials", () => {
		function getHandler() {
			return tools.find((t) => t.name === TOOL_NAMES.SEARCH_TUTORIALS)!
				.handler;
		}

		it("should return all tutorials without filters", async () => {
			const result = (await getHandler()()) as {
				content: { text: string }[];
			};
			expect(result.content[0].text).toContain("Feedback Loop");
			expect(result.content[0].text).toContain("Particle Systems");
		});

		it("should filter by difficulty", async () => {
			const result = (await getHandler()({
				difficulty: "beginner",
			})) as { content: { text: string }[] };
			expect(result.content[0].text).toContain("Feedback Loop");
			expect(result.content[0].text).not.toContain("Particle Systems");
		});

		it("should filter by query", async () => {
			const result = (await getHandler()({ query: "particle" })) as {
				content: { text: string }[];
			};
			expect(result.content[0].text).toContain("Particle Systems");
			expect(result.content[0].text).not.toContain("Feedback Loop");
		});

		it("should filter by tags", async () => {
			const result = (await getHandler()({
				tags: ["pop"],
			})) as { content: { text: string }[] };
			expect(result.content[0].text).toContain("Particle Systems");
			expect(result.content[0].text).not.toContain("Feedback Loop");
		});
	});

	describe("get_tutorial", () => {
		function getHandler() {
			return tools.find((t) => t.name === TOOL_NAMES.GET_TUTORIAL)!
				.handler;
		}

		it("should return tutorial detail with sections", async () => {
			const result = (await getHandler()({
				id: "feedback-loop-basics",
			})) as { content: { text: string }[] };
			expect(result.content[0].text).toContain("Feedback Loop");
			expect(result.content[0].text).toContain("beginner");
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
