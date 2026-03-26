import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/features/resources/paths.js", () => ({
	resolveKnowledgePath: vi.fn(() => undefined),
}));

import { registerResources } from "../../../src/features/resources/index.js";

/**
 * Fail-soft test: when resolveKnowledgePath returns undefined,
 * the server should start with empty resources and log a warning.
 */
describe("registerResources — fail-soft (no knowledge path)", () => {
	let mockLogger: { sendLog: ReturnType<typeof vi.fn> };
	let registeredResources: Array<{
		name: string;
		uriOrTemplate: unknown;
	}>;
	let mockServer: {
		registerResource: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		vi.clearAllMocks();
		registeredResources = [];
		mockLogger = { sendLog: vi.fn() };
		mockServer = {
			registerResource: vi.fn((name: string, uriOrTemplate: unknown) => {
				registeredResources.push({ name, uriOrTemplate });
			}),
		};
	});

	it("should not crash when knowledge path is absent", () => {
		expect(() =>
			registerResources(
				mockServer as never,
				mockLogger as never,
				{} as never, // tdClient — not used when path is missing
				{ mode: "docs-only", on: vi.fn() } as never, // serverMode
			),
		).not.toThrow();
	});

	it("should log a warning about missing knowledge path", () => {
		registerResources(
			mockServer as never,
			mockLogger as never,
			{} as never,
			{ mode: "docs-only", on: vi.fn() } as never,
		);

		const warnings = mockLogger.sendLog.mock.calls.filter(
			(c) => c[0].level === "warning",
		);
		expect(warnings.length).toBeGreaterThan(0);
		expect(warnings[0][0].data).toContain("Knowledge base path not found");
	});

	it("should still register resource handlers (4 total: 2 knowledge + 2 operator)", () => {
		registerResources(
			mockServer as never,
			mockLogger as never,
			{} as never,
			{ mode: "docs-only", on: vi.fn() } as never,
		);

		// registerKnowledgeResources registers 2 (index + template)
		// registerOperatorResources registers 2 (index + template)
		expect(mockServer.registerResource).toHaveBeenCalledTimes(4);
	});

	it("should return empty index when modules are listed", () => {
		registerResources(
			mockServer as never,
			mockLogger as never,
			{} as never,
			{ mode: "docs-only", on: vi.fn() } as never,
		);

		// Find the static index handler (td://modules)
		const moduleIndexCall = registeredResources.find(
			(r) => r.uriOrTemplate === "td://modules",
		);
		expect(moduleIndexCall).toBeDefined();

		// The callback is the 4th arg passed to registerResource
		const callArgs = mockServer.registerResource.mock.calls.find(
			(c: unknown[]) => c[1] === "td://modules",
		);
		expect(callArgs).toBeDefined();
		const callback = callArgs?.[3] as () => {
			contents: Array<{ text: string }>;
		};
		const result = callback();
		const parsed = JSON.parse(result.contents[0].text);
		expect(parsed.entries).toEqual([]);
	});
});
