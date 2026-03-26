import { describe, expect, it } from "vitest";
import {
	normalizeTdVersion,
	VersionManifest,
} from "../../../src/features/resources/versionManifest.js";

describe("normalizeTdVersion", () => {
	it("extracts year from 2023.11000 format", () => {
		expect(normalizeTdVersion("2023.11000")).toBe("2023");
	});

	it("extracts year from 099.2025.31760 format", () => {
		expect(normalizeTdVersion("099.2025.31760")).toBe("2025");
	});

	it("extracts year from 2024.20000 format", () => {
		expect(normalizeTdVersion("2024.20000")).toBe("2024");
	});

	it("returns null for empty string", () => {
		expect(normalizeTdVersion("")).toBeNull();
	});

	it("returns null for unrecognized format", () => {
		expect(normalizeTdVersion("1.2.3")).toBeNull();
	});
});

describe("VersionManifest", () => {
	function createManifest(): VersionManifest {
		const manifest = new VersionManifest();
		// Load from the actual data file
		const path = new URL(
			"../../../data/td-knowledge/version-manifest.json",
			import.meta.url,
		);
		manifest.loadFromFile(path.pathname.replace(/^\/([A-Z]:)/, "$1"));
		return manifest;
	}

	it("loads versions from file", () => {
		const m = createManifest();
		expect(m.size).toBeGreaterThanOrEqual(6);
	});

	it("returns current stable", () => {
		const m = createManifest();
		expect(m.getCurrentStable()).toBe("2025");
	});

	it("looks up version by id", () => {
		const m = createManifest();
		const v = m.getVersion("2023");
		expect(v).toBeDefined();
		expect(v?.pythonVersion).toBe("3.11");
	});

	describe("checkCompatibility", () => {
		const m = new VersionManifest();

		it("returns unknown when no version data", () => {
			expect(m.checkCompatibility(undefined, "2023")).toEqual({
				level: "unknown",
			});
		});

		it("returns unknown when no TD version", () => {
			expect(m.checkCompatibility({ addedIn: "2020" }, null)).toEqual({
				level: "unknown",
			});
		});

		it("returns compatible when addedIn <= tdVersion", () => {
			const result = m.checkCompatibility({ addedIn: "2020" }, "2023");
			expect(result.level).toBe("compatible");
		});

		it("returns unavailable when addedIn > tdVersion", () => {
			const result = m.checkCompatibility({ addedIn: "2024" }, "2023");
			expect(result.level).toBe("unavailable");
			expect(result.reason).toContain("2024");
		});

		it("returns unavailable when removedIn <= tdVersion", () => {
			const result = m.checkCompatibility(
				{ addedIn: "2020", removedIn: "2023" },
				"2024",
			);
			expect(result.level).toBe("unavailable");
		});

		it("returns deprecated", () => {
			const result = m.checkCompatibility(
				{
					addedIn: "2020",
					deprecated: true,
					deprecatedSince: "2024",
					suggestedReplacement: "newOp",
				},
				"2024",
			);
			expect(result.level).toBe("deprecated");
			expect(result.suggestedReplacement).toBe("newOp");
		});

		it("removedIn takes priority over deprecated", () => {
			const result = m.checkCompatibility(
				{
					deprecated: true,
					removedIn: "2023",
				},
				"2024",
			);
			expect(result.level).toBe("unavailable");
		});
	});
});
