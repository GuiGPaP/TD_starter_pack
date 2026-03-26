import { describe, expect, test, vi } from "vitest";
import { ServerMode } from "../../src/core/serverMode";

describe("ServerMode", () => {
	test("initial state is docs-only with null tdBuild", () => {
		const sm = new ServerMode();
		expect(sm.mode).toBe("docs-only");
		expect(sm.tdBuild).toBeNull();
	});

	test("transitionOnline sets mode to live and tdBuild", () => {
		const sm = new ServerMode();
		const listener = vi.fn();
		sm.on("modeChanged", listener);

		sm.transitionOnline("2023.12345");

		expect(sm.mode).toBe("live");
		expect(sm.tdBuild).toBe("2023.12345");
		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith("live");
	});

	test("double transitionOnline does not emit twice", () => {
		const sm = new ServerMode();
		const listener = vi.fn();
		sm.on("modeChanged", listener);

		sm.transitionOnline("2023.12345");
		sm.transitionOnline("2023.12345");

		expect(listener).toHaveBeenCalledTimes(1);
	});

	test("transitionOnline without tdBuild preserves existing value", () => {
		const sm = new ServerMode();
		sm.transitionOnline("2023.12345");
		sm.transitionOffline();
		// tdBuild cleared by transitionOffline
		sm.transitionOnline("2024.99999");
		sm.transitionOnline(); // no arg → should keep 2024.99999

		expect(sm.tdBuild).toBe("2024.99999");
	});

	test("transitionOffline sets mode to docs-only and clears tdBuild", () => {
		const sm = new ServerMode();
		sm.transitionOnline("2023.12345");

		const listener = vi.fn();
		sm.on("modeChanged", listener);

		sm.transitionOffline();

		expect(sm.mode).toBe("docs-only");
		expect(sm.tdBuild).toBeNull();
		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith("docs-only");
	});

	test("double transitionOffline does not emit twice", () => {
		const sm = new ServerMode();
		const listener = vi.fn();
		sm.on("modeChanged", listener);

		// Already docs-only initially
		sm.transitionOffline();
		sm.transitionOffline();

		expect(listener).toHaveBeenCalledTimes(0);
	});

	test("isLive returns false initially", () => {
		const sm = new ServerMode();
		expect(sm.isLive).toBe(false);
	});

	test("isLive returns true after transitionOnline", () => {
		const sm = new ServerMode();
		sm.transitionOnline("2023.12345");
		expect(sm.isLive).toBe(true);
		sm.transitionOffline();
		expect(sm.isLive).toBe(false);
	});

	test("toJSON returns correct shape", () => {
		const sm = new ServerMode();
		expect(sm.toJSON()).toEqual({ mode: "docs-only", tdBuild: null });

		sm.transitionOnline("2023.12345");
		expect(sm.toJSON()).toEqual({ mode: "live", tdBuild: "2023.12345" });
	});
});
