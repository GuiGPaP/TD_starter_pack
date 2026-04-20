import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOOL_NAMES } from "../../../src/core/constants.js";
import { KnowledgeRegistry } from "../../../src/features/resources/registry.js";
import { registerSearchTools } from "../../../src/features/tools/handlers/searchTools.js";

type ToolCall = {
	name: string;
	handler: (params: Record<string, unknown>) => Promise<{
		content: Array<{ text: string }>;
		isError?: boolean;
	}>;
};

function createMockServer() {
	const tools: ToolCall[] = [];
	return {
		server: {
			tool: vi.fn(
				(
					name: string,
					_description: string,
					_schema: unknown,
					handler: ToolCall["handler"],
				) => {
					tools.push({ handler, name });
				},
			),
		},
		tools,
	};
}

function getTool(tools: ToolCall[], name: string): ToolCall["handler"] {
	const tool = tools.find((entry) => entry.name === name);
	if (!tool) throw new Error(`Tool not registered: ${name}`);
	return tool.handler;
}

describe("searchTools operator catalogue generation", () => {
	let tempDir: string;
	let previousCacheDir: string | undefined;
	let mockServer: ReturnType<typeof createMockServer>;
	let registry: KnowledgeRegistry;
	const logger = { sendLog: vi.fn() };
	const versionManifest = {
		checkCompatibility: vi.fn(() => ({ level: "compatible" })),
	};
	const serverMode = {
		isLive: true,
		tdBuild: "2026.10000",
	};

	beforeEach(() => {
		tempDir = join(tmpdir(), `td-search-tools-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		previousCacheDir = process.env.TD_MCP_OPERATOR_CACHE_DIR;
		process.env.TD_MCP_OPERATOR_CACHE_DIR = tempDir;
		mockServer = createMockServer();
		registry = new KnowledgeRegistry(logger);
		vi.clearAllMocks();
	});

	afterEach(() => {
		if (previousCacheDir === undefined) {
			delete process.env.TD_MCP_OPERATOR_CACHE_DIR;
		} else {
			process.env.TD_MCP_OPERATOR_CACHE_DIR = previousCacheDir;
		}
		rmSync(tempDir, { force: true, recursive: true });
	});

	function register(tdClient: Record<string, unknown> = {}) {
		registerSearchTools(
			mockServer.server as never,
			logger,
			tdClient as never,
			registry,
			versionManifest as never,
			{} as never,
			serverMode as never,
		);
	}

	it("reports a clear action when no local operator catalogue exists", async () => {
		register();

		const search = getTool(mockServer.tools, TOOL_NAMES.SEARCH_OPERATORS);
		const result = await search({ query: "noise" });

		expect(result.content[0].text).toContain(
			"No local operator catalogue is available yet",
		);
		expect(result.content[0].text).toContain("refresh_operator_catalog");
	});

	it("refreshes the operator catalogue from a live TouchDesigner response", async () => {
		const tdClient = {
			execPythonScript: vi.fn().mockResolvedValue({
				data: {
					result: {
						errors: [],
						operators: [
							{
								opFamily: "TOP",
								opType: "noiseTOP",
								parameters: [{ default: 0.5, name: "period" }],
							},
						],
						tdBuild: "2026.10000",
						tdVersion: "2026",
					},
				},
				success: true,
			}),
		};
		register(tdClient);

		const refresh = getTool(
			mockServer.tools,
			TOOL_NAMES.REFRESH_OPERATOR_CATALOG,
		);
		const result = await refresh({ opTypes: ["noiseTOP"] });

		expect(result.content[0].text).toContain("Imported operators: 1");
		expect(registry.getByOpType("noiseTOP")).toBeDefined();
		expect(tdClient.execPythonScript).toHaveBeenCalledWith(
			expect.objectContaining({ mode: "full-exec" }),
		);
	});

	it("indexes local OfflineHelp and makes descriptions searchable", async () => {
		const helpDir = join(tempDir, "help");
		mkdirSync(helpDir);
		writeFileSync(
			join(helpDir, "Touch_In_TOP.htm"),
			[
				"<h1>Touch In TOP</h1>",
				"<p>Reads image data over a TCP/IP network connection.</p>",
			].join(""),
		);
		register();

		const index = getTool(mockServer.tools, TOOL_NAMES.INDEX_TD_OFFLINE_HELP);
		await index({ offlineHelpPath: helpDir });

		const search = getTool(mockServer.tools, TOOL_NAMES.SEARCH_OPERATORS);
		const result = await search({ query: "network" });

		expect(result.content[0].text).toContain("Touch In TOP");
		expect(registry.getByOpType("touchinTOP")?.content.summary).toContain(
			"network",
		);
	});
});
