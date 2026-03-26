import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ServerMode } from "../../core/serverMode.js";
import type { TouchDesignerClient } from "../../tdClient/touchDesignerClient.js";

const GUARD_PROBE_TIMEOUT_MS = 1500;

export function createDocsOnlyResult(toolName: string): CallToolResult {
	return {
		content: [
			{
				text:
					`${toolName}: Requires TouchDesigner connection.\n\n` +
					"Server is in docs-only mode.\n\n" +
					"Available actions:\n" +
					"• get_health — check connection status\n" +
					"• wait_for_td — wait for TD to come online\n" +
					"• search_td_assets / search_glsl_patterns — browse offline catalogues\n" +
					"• describe_td_tools — list all available tools",
				type: "text" as const,
			},
		],
		isError: true,
	};
}

/**
 * Wraps a tool handler with a docs-only mode guard.
 *
 * When the server is in live mode, the handler executes immediately.
 * When in docs-only mode, an opportunistic healthProbe is attempted first —
 * if TD has appeared since the last check, the mode transitions to live
 * and the handler proceeds. Otherwise, a structured error is returned.
 */
export function withLiveGuard<P>(
	toolName: string,
	serverMode: ServerMode,
	tdClient: TouchDesignerClient,
	handler: (params: P) => Promise<CallToolResult>,
): (params: P) => Promise<CallToolResult> {
	return async (params: P) => {
		if (serverMode.isLive) return handler(params);

		// Opportunistic probe — TD may have appeared since last check.
		// healthProbe calls serverMode.transitionOnline() on success.
		const probe = await tdClient.healthProbe(GUARD_PROBE_TIMEOUT_MS);
		if (probe.online) {
			return handler(params);
		}

		return createDocsOnlyResult(toolName);
	};
}
