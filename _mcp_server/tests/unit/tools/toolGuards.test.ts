import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServerMode } from "../../../src/core/serverMode.js";
import {
	createDocsOnlyResult,
	withLiveGuard,
} from "../../../src/features/tools/toolGuards.js";

function createMockTdClient(probeResult: {
	online: boolean;
	build?: string | null;
}) {
	return {
		healthProbe: vi.fn().mockResolvedValue({
			build: probeResult.build ?? null,
			compatible: probeResult.online ? true : null,
			error: probeResult.online ? null : "ECONNREFUSED",
			lastSeen: probeResult.online ? new Date().toISOString() : null,
			latencyMs: probeResult.online ? 50 : 1500,
			online: probeResult.online,
		}),
	};
}

describe("toolGuards", () => {
	describe("createDocsOnlyResult", () => {
		it("returns error result with tool name", () => {
			const result = createDocsOnlyResult("create_td_node");
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("create_td_node");
			expect(result.content[0].text).toContain(
				"Requires TouchDesigner connection",
			);
		});

		it("includes available offline actions", () => {
			const result = createDocsOnlyResult("test_tool");
			const text = result.content[0].text;
			expect(text).toContain("get_health");
			expect(text).toContain("wait_for_td");
			expect(text).toContain("search_td_assets");
			expect(text).toContain("describe_td_tools");
		});
	});

	describe("withLiveGuard", () => {
		let serverMode: ServerMode;
		const mockHandler = vi.fn().mockResolvedValue({
			content: [{ text: "success", type: "text" }],
		});

		beforeEach(() => {
			serverMode = new ServerMode();
			vi.clearAllMocks();
		});

		it("passes through when server is live", async () => {
			serverMode.transitionOnline("2023.11000");
			const tdClient = createMockTdClient({ online: true });

			const guarded = withLiveGuard(
				"test_tool",
				serverMode,
				tdClient as never,
				mockHandler,
			);
			const result = await guarded({ foo: "bar" });

			expect(result.content[0].text).toBe("success");
			expect(mockHandler).toHaveBeenCalledWith({ foo: "bar" });
			// Should NOT probe when already live
			expect(tdClient.healthProbe).not.toHaveBeenCalled();
		});

		it("probes and passes when TD appears (opportunistic)", async () => {
			// Start docs-only
			expect(serverMode.isLive).toBe(false);

			// Probe will return online — simulating TD just started
			const tdClient = createMockTdClient({
				build: "2024.99",
				online: true,
			});

			const guarded = withLiveGuard(
				"test_tool",
				serverMode,
				tdClient as never,
				mockHandler,
			);
			const result = await guarded({});

			expect(tdClient.healthProbe).toHaveBeenCalledWith(1500);
			expect(mockHandler).toHaveBeenCalled();
			expect(result.content[0].text).toBe("success");
		});

		it("returns error when TD is down", async () => {
			const tdClient = createMockTdClient({ online: false });

			const guarded = withLiveGuard(
				"create_td_node",
				serverMode,
				tdClient as never,
				mockHandler,
			);
			const result = await guarded({});

			expect(tdClient.healthProbe).toHaveBeenCalledWith(1500);
			expect(mockHandler).not.toHaveBeenCalled();
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("create_td_node");
			expect(result.content[0].text).toContain(
				"Requires TouchDesigner connection",
			);
		});

		it("full transition cycle: docs-only → live → tool works → offline → tool blocked", async () => {
			// Phase 1: docs-only, probe fails → blocked
			const tdClientOffline = createMockTdClient({ online: false });
			const guarded1 = withLiveGuard(
				"test_tool",
				serverMode,
				tdClientOffline as never,
				mockHandler,
			);
			const result1 = await guarded1({});
			expect(result1.isError).toBe(true);
			expect(mockHandler).not.toHaveBeenCalled();

			// Phase 2: TD comes online via healthProbe transition
			serverMode.transitionOnline("2024.10000");
			expect(serverMode.isLive).toBe(true);

			// Phase 3: tool works (no probe needed, already live)
			const tdClientOnline = createMockTdClient({ online: true });
			const guarded2 = withLiveGuard(
				"test_tool",
				serverMode,
				tdClientOnline as never,
				mockHandler,
			);
			const result2 = await guarded2({});
			expect(result2.content[0].text).toBe("success");
			expect(tdClientOnline.healthProbe).not.toHaveBeenCalled();

			// Phase 4: TD disconnects
			serverMode.transitionOffline();
			expect(serverMode.isLive).toBe(false);

			// Phase 5: tool blocked again
			vi.clearAllMocks();
			const tdClientOffline2 = createMockTdClient({ online: false });
			const guarded3 = withLiveGuard(
				"test_tool",
				serverMode,
				tdClientOffline2 as never,
				mockHandler,
			);
			const result3 = await guarded3({});
			expect(result3.isError).toBe(true);
			expect(mockHandler).not.toHaveBeenCalled();
		});
	});
});
