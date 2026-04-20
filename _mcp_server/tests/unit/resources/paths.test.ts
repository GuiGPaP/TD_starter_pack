import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveKnowledgePath } from "../../../src/features/resources/paths.js";

describe("resolveKnowledgePath", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `kp-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		delete process.env.TD_MCP_KNOWLEDGE_PATH;
	});

	afterEach(() => {
		rmSync(tempDir, { force: true, recursive: true });
		delete process.env.TD_MCP_KNOWLEDGE_PATH;
	});

	it("should respect TD_MCP_KNOWLEDGE_PATH env override", () => {
		const customPath = join(tempDir, "custom-knowledge");
		mkdirSync(customPath, { recursive: true });
		process.env.TD_MCP_KNOWLEDGE_PATH = customPath;

		// metaUrl doesn't matter when env is set
		const result = resolveKnowledgePath("file:///fake/path/paths.js");
		expect(result).toBe(customPath);
	});

	it("should find path in dev mode (data/td-knowledge/ relative to repo root)", () => {
		// Simulate: metaUrl = <tempDir>/src/features/resources/paths.js
		// → repoRoot = <tempDir>
		// → devPath = <tempDir>/data/td-knowledge/
		const srcDir = join(tempDir, "src", "features", "resources");
		mkdirSync(srcDir, { recursive: true });
		const dataDir = join(tempDir, "data", "td-knowledge");
		mkdirSync(dataDir, { recursive: true });

		const metaUrl = pathToFileURL(join(srcDir, "paths.js")).href;
		const result = resolveKnowledgePath(metaUrl);
		expect(result).toBe(dataDir);
	});

	it("should find path in dist mode (data/td-knowledge/ relative to 3 levels up)", () => {
		// In dist mode: metaUrl = <root>/dist/features/resources/paths.js
		// 3 levels up from dist/features/resources/ = <root>/
		// distPath = <root>/data/td-knowledge/ (same resolution as dev)
		// The build copies data/ into dist/data/, so the repo root data/ is the canonical path.
		const distSrcDir = join(tempDir, "dist", "features", "resources");
		mkdirSync(distSrcDir, { recursive: true });
		const dataDir = join(tempDir, "data", "td-knowledge");
		mkdirSync(dataDir, { recursive: true });

		const metaUrl = pathToFileURL(join(distSrcDir, "paths.js")).href;
		const result = resolveKnowledgePath(metaUrl);
		expect(result).toBe(dataDir);
	});

	it("should return undefined if no path exists", () => {
		// Empty tempDir, no data directory, no env var
		const srcDir = join(tempDir, "src", "features", "resources");
		mkdirSync(srcDir, { recursive: true });

		const metaUrl = pathToFileURL(join(srcDir, "paths.js")).href;
		const result = resolveKnowledgePath(metaUrl);
		expect(result).toBeUndefined();
	});

	it("should ignore env var if path does not exist", () => {
		process.env.TD_MCP_KNOWLEDGE_PATH = join(tempDir, "nonexistent");

		const srcDir = join(tempDir, "src", "features", "resources");
		mkdirSync(srcDir, { recursive: true });

		const metaUrl = pathToFileURL(join(srcDir, "paths.js")).href;
		const result = resolveKnowledgePath(metaUrl);
		// Falls through to dist/dev checks, which also don't exist
		expect(result).toBeUndefined();
	});
});
