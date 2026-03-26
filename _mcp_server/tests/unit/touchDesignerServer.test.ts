import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TouchDesignerServer } from "../../src/server/touchDesignerServer.js";

// 正しいパスでモックを設定
vi.mock("../../src/features/prompts/index.js", () => ({
	registerPrompts: vi.fn(),
}));

const sentinelRegistry = { _sentinel: true, size: 0 };
const sentinelFusionService = { _sentinel: true };
const sentinelVersionManifest = { _sentinel: true, size: 0 };
const sentinelResourceServices = {
	fusionService: sentinelFusionService,
	registry: sentinelRegistry,
	versionManifest: sentinelVersionManifest,
};
vi.mock("../../src/features/resources/index.js", () => ({
	registerResources: vi.fn(() => sentinelResourceServices),
}));

vi.mock("../../src/features/tools/index.js", () => ({
	registerTools: vi.fn(() => ({ assetRegistry: { size: 0 } })),
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
	McpServer: vi.fn(function MockMcpServer(this: Record<string, unknown>) {
		this.connect = vi.fn().mockResolvedValue(undefined);
		this.close = vi.fn().mockResolvedValue(undefined);
		this.tool = vi.fn();
		this.server = {
			sendLoggingMessage: vi.fn(),
			setRequestHandler: vi.fn(),
		};
	}),
}));

vi.mock("../../src/tdClient/index.js", () => ({
	createTouchDesignerClient: vi.fn().mockReturnValue({
		getTdInfo: vi
			.fn()
			.mockResolvedValue({ data: { server: "info" }, success: true }),
		healthProbe: vi.fn().mockResolvedValue({
			build: null,
			compatible: null,
			error: null,
			lastSeen: null,
			latencyMs: 0,
			online: false,
		}),
	}),
}));

describe("TouchDesignerServer", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should initialize dependencies in the correct order", async () => {
		// テスト前にモジュールをインポート
		const promptsModule = await import("../../src/features/prompts/index.js");
		const resourcesModule = await import(
			"../../src/features/resources/index.js"
		);
		const toolsModule = await import("../../src/features/tools/index.js");

		new TouchDesignerServer();

		expect(McpServer).toHaveBeenCalledTimes(1);

		// モック関数が呼ばれたか確認
		expect(promptsModule.registerPrompts).toHaveBeenCalled();
		expect(resourcesModule.registerResources).toHaveBeenCalled();
		expect(toolsModule.registerTools).toHaveBeenCalled();
	});

	it("should pass KnowledgeRegistry from registerResources to registerTools", async () => {
		const resourcesModule = await import(
			"../../src/features/resources/index.js"
		);
		const toolsModule = await import("../../src/features/tools/index.js");

		new TouchDesignerServer();

		// registerResources returns the sentinel resource services
		expect(resourcesModule.registerResources).toHaveReturnedWith(
			sentinelResourceServices,
		);

		// registerTools receives registry as 5th arg, resource deps as 6th
		expect(toolsModule.registerTools).toHaveBeenCalledWith(
			expect.anything(), // server
			expect.anything(), // logger
			expect.anything(), // tdClient
			expect.anything(), // serverMode
			sentinelRegistry, // registry
			expect.objectContaining({
				fusionService: sentinelFusionService,
				versionManifest: sentinelVersionManifest,
			}),
		);
	});
});
