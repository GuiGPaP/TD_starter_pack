import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConsoleLogger } from "../../src/core/logger.js";
import { TouchDesignerServer } from "../../src/server/touchDesignerServer.js";
import type { StreamableHttpTransportConfig } from "../../src/transport/config.js";
import { ExpressHttpManager } from "../../src/transport/expressHttpManager.js";
import { SessionManager } from "../../src/transport/sessionManager.js";

/**
 * E2E integration test for MCP resources over HTTP transport.
 * Tests resources/list and resources/read in offline (docs-only) mode.
 * Does NOT require a running TouchDesigner instance.
 */
describe("Resources Transport Integration (offline)", () => {
	const testPort = 3310;
	const baseUrl = `http://127.0.0.1:${testPort}`;
	let httpManager: ExpressHttpManager;
	let sessionManager: SessionManager | null = null;
	const ACCEPT_HEADER = "application/json, text/event-stream";
	const PROTOCOL_VERSION = "2024-11-05";
	let activeSessionId: string | null = null;
	let initializeResult: Record<string, unknown> | null = null;
	const config: StreamableHttpTransportConfig = {
		endpoint: "/mcp",
		host: "127.0.0.1",
		port: testPort,
		sessionConfig: { enabled: true, ttl: 60_000 },
		type: "streamable-http",
	};

	beforeAll(async () => {
		process.env.TD_WEB_SERVER_HOST = "http://127.0.0.1";
		process.env.TD_WEB_SERVER_PORT = "9981";

		const logger = new ConsoleLogger();
		sessionManager = new SessionManager({ enabled: true }, logger);
		const serverFactory = () => TouchDesignerServer.create();
		httpManager = new ExpressHttpManager(
			config,
			serverFactory,
			sessionManager,
			logger,
		);

		const startResult = await httpManager.start();
		expect(startResult.success).toBe(true);

		// Initialize and capture the result for capabilities check
		const response = await fetch(`${baseUrl}${config.endpoint}`, {
			body: JSON.stringify({
				id: 1,
				jsonrpc: "2.0",
				method: "initialize",
				params: {
					capabilities: {},
					clientInfo: {
						name: "resources-transport-tests",
						version: "0.0.0",
					},
					protocolVersion: PROTOCOL_VERSION,
				},
			}),
			headers: {
				Accept: ACCEPT_HEADER,
				"Content-Type": "application/json",
			},
			method: "POST",
		});

		activeSessionId = response.headers.get("mcp-session-id");
		initializeResult = await readFirstSseEvent(response);
		if (!activeSessionId) {
			throw new Error("Failed to obtain session ID");
		}
	});

	afterAll(async () => {
		await httpManager.stop();
		sessionManager?.stopTTLCleanup();
	});

	// --- Tâche 3: capabilities.resources ---

	it("should declare resources in server capabilities", () => {
		expect(initializeResult).toBeDefined();
		const capabilities = (
			initializeResult as {
				result?: { capabilities?: Record<string, unknown> };
			}
		).result?.capabilities;
		expect(capabilities).toBeDefined();
		expect(capabilities).toHaveProperty("resources");
	});

	// --- Tâche 5b: resources/list ---

	it("should list resources including td://modules and td://operators", async () => {
		const response = await mcpRequest("resources/list", {});
		const payload = await readFirstSseEvent(response);

		expect(payload.result).toBeDefined();
		const resources = payload.result.resources as Array<{
			uri: string;
			name: string;
		}>;
		expect(Array.isArray(resources)).toBe(true);

		const uris = resources.map((r) => r.uri);
		expect(uris).toContain("td://modules");
		expect(uris).toContain("td://operators");
	});

	it("should list template resources including td://modules/tdfunctions", async () => {
		const response = await mcpRequest("resources/list", {});
		const payload = await readFirstSseEvent(response);
		const resources = payload.result.resources as Array<{ uri: string }>;
		const uris = resources.map((r) => r.uri);

		expect(uris).toContain("td://modules/tdfunctions");
	});

	it("should list template resources including td://operators/glsl-top", async () => {
		const response = await mcpRequest("resources/list", {});
		const payload = await readFirstSseEvent(response);
		const resources = payload.result.resources as Array<{ uri: string }>;
		const uris = resources.map((r) => r.uri);

		expect(uris).toContain("td://operators/glsl-top");
	});

	// --- Tâche 5b: resources/read ---

	it("should read td://modules/tdfunctions offline with correct structure", async () => {
		const response = await mcpRequest("resources/read", {
			uri: "td://modules/tdfunctions",
		});
		const payload = await readFirstSseEvent(response);

		expect(payload.result).toBeDefined();
		const contents = payload.result.contents as Array<{
			uri: string;
			text: string;
			mimeType: string;
		}>;
		expect(contents).toHaveLength(1);
		expect(contents[0].mimeType).toBe("application/json");

		const parsed = JSON.parse(contents[0].text);
		expect(parsed.entry.kind).toBe("python-module");
		expect(parsed.entry.payload.canonicalName).toBe("TDFunctions");
	});

	it("should read td://operators/glsl-top offline with _meta.source = 'static'", async () => {
		const response = await mcpRequest("resources/read", {
			uri: "td://operators/glsl-top",
		});
		const payload = await readFirstSseEvent(response);

		expect(payload.result).toBeDefined();
		const contents = payload.result.contents as Array<{
			uri: string;
			text: string;
			mimeType: string;
		}>;
		expect(contents).toHaveLength(1);

		const parsed = JSON.parse(contents[0].text);
		expect(parsed._meta.source).toBe("static");
	});

	// --- Helpers ---

	async function mcpRequest(
		method: string,
		params: Record<string, unknown>,
	): Promise<Response> {
		return fetch(`${baseUrl}${config.endpoint}`, {
			body: JSON.stringify({
				id: Math.floor(Math.random() * 100000),
				jsonrpc: "2.0",
				method,
				params,
			}),
			headers: {
				Accept: ACCEPT_HEADER,
				"Content-Type": "application/json",
				"Mcp-Protocol-Version": PROTOCOL_VERSION,
				"Mcp-Session-Id": activeSessionId ?? "",
			},
			method: "POST",
		});
	}

	async function readFirstSseEvent(
		response: Response,
	): Promise<Record<string, unknown>> {
		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error("Missing response body for SSE stream");
		}
		const decoder = new TextDecoder();
		let buffer = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			buffer += decoder.decode(value, { stream: true });
			const eventBoundary = buffer.indexOf("\n\n");
			if (eventBoundary !== -1) {
				const chunk = buffer.slice(0, eventBoundary);
				await reader.cancel();
				const dataLine = chunk
					.split("\n")
					.find((line) => line.startsWith("data: "));
				if (!dataLine) {
					throw new Error("No data event received");
				}
				const jsonString = dataLine.replace("data: ", "");
				return JSON.parse(jsonString);
			}
		}
		await reader.cancel();
		throw new Error("SSE stream ended without data");
	}
});
