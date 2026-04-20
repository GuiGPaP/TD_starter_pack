import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	readIndex,
	writeIndex,
} from "../../../src/features/palette/persistence.js";
import type { PaletteIndex } from "../../../src/features/palette/types.js";

const TEST_DIR = join(tmpdir(), `palette-test-${Date.now()}`);

function validIndex(): PaletteIndex {
	return {
		entries: [
			{
				author: "Derivative",
				category: "Tools",
				description: "Test component",
				name: "TestComp",
				relativePath: "Tools/TestComp.tox",
				tags: ["tools"],
				toxPath: "C:/TD/Palette/Tools/TestComp.tox",
			},
		],
		entryCount: 1,
		indexedAt: "2026-01-01T00:00:00",
		paletteRoot: "C:/TD/Palette",
		schemaVersion: "1.0",
		tdVersion: "2024.11000",
	};
}

afterEach(() => {
	if (existsSync(TEST_DIR)) {
		rmSync(TEST_DIR, { force: true, recursive: true });
	}
});

describe("palette persistence", () => {
	it("writeIndex + readIndex round-trips correctly", () => {
		const filePath = join(TEST_DIR, "palette-index-test.json");
		const index = validIndex();
		writeIndex(filePath, index);

		expect(existsSync(filePath)).toBe(true);
		const loaded = readIndex(filePath);
		expect(loaded).not.toBeNull();
		if (!loaded) throw new Error("Expected palette index to load");
		expect(loaded.entryCount).toBe(1);
		expect(loaded.entries[0].name).toBe("TestComp");
	});

	it("readIndex returns null for missing file", () => {
		expect(readIndex("/nonexistent/path.json")).toBeNull();
	});

	it("readIndex returns null for invalid JSON", () => {
		mkdirSync(TEST_DIR, { recursive: true });
		const filePath = join(TEST_DIR, "bad.json");
		require("node:fs").writeFileSync(filePath, "not json");
		expect(readIndex(filePath)).toBeNull();
	});

	it("readIndex returns null for wrong schema", () => {
		mkdirSync(TEST_DIR, { recursive: true });
		const filePath = join(TEST_DIR, "wrong.json");
		require("node:fs").writeFileSync(filePath, JSON.stringify({ foo: "bar" }));
		expect(readIndex(filePath)).toBeNull();
	});

	it("writeIndex creates directories if needed", () => {
		const deep = join(TEST_DIR, "a", "b", "index.json");
		writeIndex(deep, validIndex());
		expect(existsSync(deep)).toBe(true);
		const content = JSON.parse(readFileSync(deep, "utf-8"));
		expect(content.schemaVersion).toBe("1.0");
	});
});
