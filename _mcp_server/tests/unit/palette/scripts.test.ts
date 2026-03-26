import { describe, expect, it } from "vitest";
import {
	buildIndexPaletteScript,
	buildLoadPaletteScript,
} from "../../../src/features/palette/scripts.js";

describe("buildIndexPaletteScript", () => {
	it("returns a non-empty Python script", () => {
		const script = buildIndexPaletteScript();
		expect(script.length).toBeGreaterThan(100);
	});

	it("uses app.installFolder for path discovery", () => {
		const script = buildIndexPaletteScript();
		expect(script).toContain("app.installFolder");
		expect(script).not.toContain("C:/Program Files");
	});

	it("sets result variable with JSON output", () => {
		const script = buildIndexPaletteScript();
		expect(script).toContain("result = json.dumps(");
	});

	it("includes schemaVersion in output", () => {
		const script = buildIndexPaletteScript();
		expect(script).toContain('"schemaVersion": "1.0"');
	});

	it("destroys loaded components for cleanup", () => {
		const script = buildIndexPaletteScript();
		expect(script).toContain("loaded.destroy()");
		expect(script).toContain("temp_container.destroy()");
	});
});

describe("buildLoadPaletteScript", () => {
	it("includes the provided parameters", () => {
		const script = buildLoadPaletteScript(
			"C:/TD/Palette/Tools/Bloom.tox",
			"/project1",
			"myBloom",
		);
		expect(script).toContain("C:/TD/Palette/Tools/Bloom.tox");
		expect(script).toContain("/project1");
		expect(script).toContain("myBloom");
	});

	it("normalizes backslashes in tox path", () => {
		const script = buildLoadPaletteScript(
			"C:\\TD\\Palette\\Bloom.tox",
			"/project1",
			"bloom",
		);
		expect(script).toContain("C:/TD/Palette/Bloom.tox");
	});

	it("sets result JSON with status field", () => {
		const script = buildLoadPaletteScript(
			"C:/TD/Palette/Bloom.tox",
			"/project1",
			"bloom",
		);
		expect(script).toContain('"status"');
		expect(script).toContain("result = json.dumps(");
	});
});
