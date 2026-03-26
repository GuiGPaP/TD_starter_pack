import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOOL_NAMES } from "../../../src/core/constants.js";
import { registerHealthTools } from "../../../src/features/tools/handlers/healthTools.js";

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

function getToolHandler(tools: ToolCall[], name: string) {
	const tool = tools.find((t) => t.name === name);
	if (!tool) throw new Error(`Tool ${name} not registered`);
	return tool.handler;
}

// --- Tests ---

describe("Health Tools", () => {
	let mockServer: ReturnType<typeof createMockServer>;
	const mockLogger = { sendLog: vi.fn() };
	const mockServerMode = {
		mode: "docs-only",
		transitionOffline: vi.fn(),
		transitionOnline: vi.fn(),
	};

	beforeEach(() => {
		mockServer = createMockServer();
		vi.clearAllMocks();
	});

	describe("get_health", () => {
		it("should return online status when TD responds", async () => {
			const mockTdClient = {
				healthProbe: vi.fn().mockResolvedValue({
					build: "2023.11000",
					compatible: true,
					error: null,
					lastSeen: "2026-03-24T12:00:00.000Z",
					latencyMs: 15,
					online: true,
				}),
			};

			registerHealthTools(
				mockServer.server as never,
				mockLogger,
				mockTdClient as never,
				mockServerMode as never,
			);

			const handler = getToolHandler(mockServer.tools, TOOL_NAMES.GET_HEALTH);
			const result = (await handler()) as {
				content: Array<{ text: string }>;
			};
			const health = JSON.parse(result.content[0].text);

			expect(health.online).toBe(true);
			expect(health.build).toBe("2023.11000");
			expect(health.compatible).toBe(true);
			expect(health.latencyMs).toBe(15);
			expect(mockTdClient.healthProbe).toHaveBeenCalledWith(2000);
		});

		it("should return offline status when TD is unreachable", async () => {
			const mockTdClient = {
				healthProbe: vi.fn().mockResolvedValue({
					build: null,
					compatible: null,
					error: "Connection refused",
					lastSeen: null,
					latencyMs: 2,
					online: false,
				}),
			};

			registerHealthTools(
				mockServer.server as never,
				mockLogger,
				mockTdClient as never,
				mockServerMode as never,
			);

			const handler = getToolHandler(mockServer.tools, TOOL_NAMES.GET_HEALTH);
			const result = (await handler()) as {
				content: Array<{ text: string }>;
			};
			const health = JSON.parse(result.content[0].text);

			expect(health.online).toBe(false);
			expect(health.compatible).toBeNull();
		});

		it("should return online with null compatible when API errors", async () => {
			const mockTdClient = {
				healthProbe: vi.fn().mockResolvedValue({
					build: "2023.11000",
					compatible: null,
					error: "Internal server error",
					lastSeen: "2026-03-24T12:00:00.000Z",
					latencyMs: 50,
					online: true,
				}),
			};

			registerHealthTools(
				mockServer.server as never,
				mockLogger,
				mockTdClient as never,
				mockServerMode as never,
			);

			const handler = getToolHandler(mockServer.tools, TOOL_NAMES.GET_HEALTH);
			const result = (await handler()) as {
				content: Array<{ text: string }>;
			};
			const health = JSON.parse(result.content[0].text);

			expect(health.online).toBe(true);
			expect(health.compatible).toBeNull();
			expect(health.error).toBe("Internal server error");
		});
	});

	describe("wait_for_td", () => {
		it("should return immediately when TD is already online", async () => {
			const healthResult = {
				build: "2023.11000",
				compatible: true,
				error: null,
				lastSeen: "2026-03-24T12:00:00.000Z",
				latencyMs: 10,
				online: true,
			};
			const mockTdClient = {
				healthProbe: vi.fn().mockResolvedValue(healthResult),
				invalidateAndProbe: vi.fn().mockResolvedValue(undefined),
			};

			registerHealthTools(
				mockServer.server as never,
				mockLogger,
				mockTdClient as never,
				mockServerMode as never,
			);

			const handler = getToolHandler(mockServer.tools, TOOL_NAMES.WAIT_FOR_TD);
			const result = (await handler({ timeoutSeconds: 5 })) as {
				content: Array<{ text: string }>;
			};
			const parsed = JSON.parse(result.content[0].text);

			expect(parsed.online).toBe(true);
			expect(parsed.timedOut).toBe(false);
			expect(parsed.ready).toBe(true);
			expect(mockTdClient.invalidateAndProbe).toHaveBeenCalled();
		});

		it("should poll and find TD after retry", async () => {
			const offlineResult = {
				build: null,
				compatible: null,
				error: "Connection refused",
				lastSeen: null,
				latencyMs: 2,
				online: false,
			};
			const onlineResult = {
				build: "2023.11000",
				compatible: true,
				error: null,
				lastSeen: "2026-03-24T12:00:00.000Z",
				latencyMs: 10,
				online: true,
			};
			const mockTdClient = {
				healthProbe: vi
					.fn()
					.mockResolvedValueOnce(offlineResult)
					.mockResolvedValue(onlineResult),
				invalidateAndProbe: vi.fn().mockResolvedValue(undefined),
			};

			registerHealthTools(
				mockServer.server as never,
				mockLogger,
				mockTdClient as never,
				mockServerMode as never,
			);

			const handler = getToolHandler(mockServer.tools, TOOL_NAMES.WAIT_FOR_TD);
			const result = (await handler({ timeoutSeconds: 10 })) as {
				content: Array<{ text: string }>;
			};
			const parsed = JSON.parse(result.content[0].text);

			expect(parsed.online).toBe(true);
			expect(parsed.timedOut).toBe(false);
			expect(parsed.ready).toBe(true);
			// First probe offline, then sleep, then second probe online,
			// then invalidateAndProbe, then re-probe = 4 healthProbe calls
			expect(mockTdClient.healthProbe.mock.calls.length).toBeGreaterThanOrEqual(
				2,
			);
		});

		it("should timeout when TD never responds", async () => {
			const offlineResult = {
				build: null,
				compatible: null,
				error: "Connection refused",
				lastSeen: null,
				latencyMs: 2,
				online: false,
			};
			const mockTdClient = {
				healthProbe: vi.fn().mockResolvedValue(offlineResult),
				invalidateAndProbe: vi.fn().mockResolvedValue(undefined),
			};

			registerHealthTools(
				mockServer.server as never,
				mockLogger,
				mockTdClient as never,
				mockServerMode as never,
			);

			const handler = getToolHandler(mockServer.tools, TOOL_NAMES.WAIT_FOR_TD);
			// Use very short timeout so test doesn't hang
			const result = (await handler({ timeoutSeconds: 1 })) as {
				content: Array<{ text: string }>;
			};
			const parsed = JSON.parse(result.content[0].text);

			expect(parsed.online).toBe(false);
			expect(parsed.timedOut).toBe(true);
			expect(parsed.ready).toBe(false);
			expect(mockTdClient.invalidateAndProbe).not.toHaveBeenCalled();
		});

		it("should return ready=false when TD is reachable but incompatible", async () => {
			const incompatibleResult = {
				build: "2020.40000",
				compatible: false,
				error: "Version incompatible",
				lastSeen: "2026-03-24T12:00:00.000Z",
				latencyMs: 10,
				online: true,
			};
			const mockTdClient = {
				healthProbe: vi.fn().mockResolvedValue(incompatibleResult),
				invalidateAndProbe: vi.fn().mockResolvedValue(undefined),
			};

			registerHealthTools(
				mockServer.server as never,
				mockLogger,
				mockTdClient as never,
				mockServerMode as never,
			);

			const handler = getToolHandler(mockServer.tools, TOOL_NAMES.WAIT_FOR_TD);
			const result = (await handler({ timeoutSeconds: 5 })) as {
				content: Array<{ text: string }>;
			};
			const parsed = JSON.parse(result.content[0].text);

			expect(parsed.online).toBe(true);
			expect(parsed.compatible).toBe(false);
			expect(parsed.ready).toBe(false);
			expect(parsed.timedOut).toBe(false);
		});
	});
});
