import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";

const HEALTH_PROBE_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const waitForTdSchema = {
	timeoutSeconds: z
		.number()
		.int()
		.min(1)
		.max(120)
		.describe(
			"Maximum seconds to wait for TouchDesigner connection (default: 30)",
		)
		.optional(),
};

export function registerHealthTools(
	server: McpServer,
	logger: ILogger,
	tdClient: TouchDesignerClient,
	_serverMode: ServerMode,
): void {
	server.tool(
		TOOL_NAMES.GET_HEALTH,
		"Check TouchDesigner connection health. Returns online status, build version, latency, and compatibility. Works in any server mode — no TouchDesigner connection required.",
		{},
		async () => {
			const health = await tdClient.healthProbe(HEALTH_PROBE_TIMEOUT_MS);
			logger.sendLog({
				data: {
					build: health.build,
					compatible: health.compatible,
					latencyMs: health.latencyMs,
					online: health.online,
				},
				level: "debug",
				logger: "get_health",
			});
			return {
				content: [
					{ text: JSON.stringify(health, null, 2), type: "text" as const },
				],
			};
		},
	);

	server.tool(
		TOOL_NAMES.WAIT_FOR_TD,
		"Wait for TouchDesigner to become available. Polls periodically until TD responds or timeout is reached. Returns final health state including compatibility.",
		waitForTdSchema,
		async ({ timeoutSeconds = 30 }) => {
			const deadline = Date.now() + timeoutSeconds * 1000;

			logger.sendLog({
				data: { timeoutSeconds },
				level: "info",
				logger: "wait_for_td",
			});

			while (Date.now() < deadline) {
				const health = await tdClient.healthProbe(HEALTH_PROBE_TIMEOUT_MS);
				if (health.online) {
					// Refresh compat cache so subsequent tools work immediately
					await tdClient.invalidateAndProbe();
					// Re-probe to get final state after cache refresh
					const final = await tdClient.healthProbe(HEALTH_PROBE_TIMEOUT_MS);
					const result = {
						...final,
						ready: final.compatible === true,
						timedOut: false,
					};
					logger.sendLog({
						data: { online: true, ready: result.ready },
						level: "info",
						logger: "wait_for_td",
					});
					return {
						content: [
							{
								text: JSON.stringify(result, null, 2),
								type: "text" as const,
							},
						],
					};
				}

				const remaining = deadline - Date.now();
				if (remaining <= 0) break;
				await sleep(Math.min(POLL_INTERVAL_MS, remaining));
			}

			// Timeout — one last probe for final state
			const lastHealth = await tdClient.healthProbe(HEALTH_PROBE_TIMEOUT_MS);
			const result = { ...lastHealth, ready: false, timedOut: true };

			logger.sendLog({
				data: { online: lastHealth.online, timedOut: true, timeoutSeconds },
				level: "warning",
				logger: "wait_for_td",
			});

			return {
				content: [
					{
						text: JSON.stringify(result, null, 2),
						type: "text" as const,
					},
				],
			};
		},
	);
}
