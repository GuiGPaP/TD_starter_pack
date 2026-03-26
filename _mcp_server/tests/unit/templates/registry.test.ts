import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../../../src/features/templates/registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const builtInDir = join(__dirname, "../../../data/td-assets/built-in");

function createRegistry(): AssetRegistry {
	const registry = new AssetRegistry();
	registry.loadAll([{ path: builtInDir, source: "builtin" }]);
	return registry;
}

describe("AssetRegistry", () => {
	describe("loadAll", () => {
		it("loads built-in assets", () => {
			const registry = createRegistry();
			expect(registry.size).toBeGreaterThanOrEqual(3);
		});

		it("skips nonexistent paths", () => {
			const registry = new AssetRegistry();
			registry.loadAll([{ path: "/nonexistent", source: "builtin" }]);
			expect(registry.size).toBe(0);
		});

		it("first-loaded wins on duplicate IDs", () => {
			const registry = new AssetRegistry();
			registry.loadAll([
				{ path: builtInDir, source: "builtin" },
				{ path: builtInDir, source: "user" },
			]);
			// Same IDs from second load should be skipped
			const asset = registry.getById("null-debug");
			expect(asset?.source).toBe("builtin");
		});
	});

	describe("getById", () => {
		it("returns asset by ID", () => {
			const registry = createRegistry();
			const asset = registry.getById("null-debug");
			expect(asset).toBeDefined();
			expect(asset?.manifest.id).toBe("null-debug");
		});

		it("returns undefined for unknown ID", () => {
			const registry = createRegistry();
			expect(registry.getById("nonexistent")).toBeUndefined();
		});
	});

	describe("search", () => {
		it("returns all assets with empty query", () => {
			const registry = createRegistry();
			const results = registry.search();
			expect(results.length).toBe(registry.size);
		});

		it("searches by query in title", () => {
			const registry = createRegistry();
			const results = registry.search({ query: "feedback" });
			expect(results.length).toBeGreaterThanOrEqual(1);
			expect(results.some((a) => a.manifest.id === "simple-feedback")).toBe(
				true,
			);
		});

		it("searches by query in description", () => {
			const registry = createRegistry();
			const results = registry.search({ query: "debug" });
			expect(results.some((a) => a.manifest.id === "null-debug")).toBe(true);
		});

		it("searches by query in aliases", () => {
			const registry = createRegistry();
			const results = registry.search({ query: "fps overlay" });
			expect(results.some((a) => a.manifest.id === "resolution-monitor")).toBe(
				true,
			);
		});

		it("filters by tags", () => {
			const registry = createRegistry();
			const results = registry.search({ tags: ["generative"] });
			expect(results.length).toBeGreaterThanOrEqual(1);
			expect(results.some((a) => a.manifest.id === "simple-feedback")).toBe(
				true,
			);
		});

		it("respects maxResults", () => {
			const registry = createRegistry();
			const results = registry.search({ maxResults: 1 });
			expect(results.length).toBe(1);
		});

		it("is case-insensitive", () => {
			const registry = createRegistry();
			const results = registry.search({ query: "DEBUG" });
			expect(results.some((a) => a.manifest.id === "null-debug")).toBe(true);
		});
	});
});
