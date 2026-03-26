import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpLogger } from "../../src/core/logger.js";

describe("Logger", () => {
	describe("McpLogger", () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should send log messages to MCP server", () => {
			const mockSendLoggingMessage = vi.fn().mockResolvedValue(undefined);
			const mockServer = {
				server: {
					sendLoggingMessage: mockSendLoggingMessage,
				},
			};

			const logger = new McpLogger(mockServer as unknown as McpServer);
			logger.sendLog({
				data: "test message",
				level: "info",
			});

			expect(mockSendLoggingMessage).toHaveBeenCalledWith({
				data: "test message",
				level: "info",
			});
		});

		it("should handle sync server not connected errors gracefully", () => {
			const mockSendLoggingMessage = vi.fn().mockImplementation(() => {
				throw new Error("Not connected");
			});

			const mockServer = {
				server: {
					sendLoggingMessage: mockSendLoggingMessage,
				},
			};

			const logger = new McpLogger(mockServer as unknown as McpServer);

			expect(() =>
				logger.sendLog({
					data: "test message",
					level: "info",
				}),
			).not.toThrow();
			expect(mockSendLoggingMessage).toHaveBeenCalled();
		});

		it("should handle async not-connected rejection gracefully", async () => {
			const mockSendLoggingMessage = vi
				.fn()
				.mockRejectedValue(new Error("Not connected"));
			const mockServer = {
				server: {
					sendLoggingMessage: mockSendLoggingMessage,
				},
			};

			const logger = new McpLogger(mockServer as unknown as McpServer);

			logger.sendLog({
				data: "test message",
				level: "info",
			});

			// Flush microtasks so .catch() runs
			await vi.waitFor(() => {
				expect(mockSendLoggingMessage).toHaveBeenCalled();
			});
		});

		it("should console.error on unexpected async rejection", async () => {
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			const mockSendLoggingMessage = vi
				.fn()
				.mockRejectedValue(new Error("Something unexpected"));
			const mockServer = {
				server: {
					sendLoggingMessage: mockSendLoggingMessage,
				},
			};

			const logger = new McpLogger(mockServer as unknown as McpServer);

			logger.sendLog({
				data: "test message",
				level: "info",
				logger: "TestLogger",
			});

			// Flush microtasks so .catch() runs
			await vi.waitFor(() => {
				expect(consoleSpy).toHaveBeenCalledWith(
					"CRITICAL: Failed to send log to MCP server. Logging system may be compromised.",
					expect.objectContaining({
						error: "Something unexpected",
						originalLogger: "TestLogger",
						originalLogLevel: "info",
					}),
				);
			});
		});
	});
});
