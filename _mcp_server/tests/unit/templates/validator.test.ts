import { describe, expect, it } from "vitest";
import { validateManifest } from "../../../src/features/templates/validator.js";

describe("validateManifest", () => {
	describe("tox-asset kind", () => {
		const validToxAsset = {
			deploy: { containerName: "test_asset", mode: "import_tox" },
			description: "A test asset",
			id: "test-asset",
			kind: "tox-asset",
			provenance: { license: "MIT", source: "project-original" },
			sha256: "a".repeat(64),
			tdVersion: { min: "2023.11000" },
			title: "Test Asset",
			version: "1.0.0",
		};

		it("accepts a valid tox-asset manifest", () => {
			const result = validateManifest(validToxAsset);
			expect(result.valid).toBe(true);
			expect(result.manifest?.kind).toBe("tox-asset");
		});

		it("rejects tox-asset without sha256", () => {
			const { sha256: _, ...incomplete } = validToxAsset;
			const result = validateManifest(incomplete);
			expect(result.valid).toBe(false);
			expect(result.errors).toBeDefined();
		});

		it("rejects tox-asset without version", () => {
			const { version: _, ...incomplete } = validToxAsset;
			const result = validateManifest(incomplete);
			expect(result.valid).toBe(false);
		});

		it("rejects invalid sha256 format", () => {
			const result = validateManifest({
				...validToxAsset,
				sha256: "not-a-hash",
			});
			expect(result.valid).toBe(false);
		});

		it("rejects invalid version format", () => {
			const result = validateManifest({
				...validToxAsset,
				version: "v1.0",
			});
			expect(result.valid).toBe(false);
		});

		it("accepts optional fields", () => {
			const result = validateManifest({
				...validToxAsset,
				aliases: ["test"],
				tags: ["debug"],
				useCases: ["testing"],
			});
			expect(result.valid).toBe(true);
		});
	});

	describe("external-ref kind", () => {
		const validExternalRef = {
			deployable: false,
			description: "An external reference",
			id: "ext-ref",
			kind: "external-ref",
			title: "External Ref",
		};

		it("accepts a valid external-ref manifest", () => {
			const result = validateManifest(validExternalRef);
			expect(result.valid).toBe(true);
			expect(result.manifest?.kind).toBe("external-ref");
		});

		it("rejects external-ref with deployable=true", () => {
			const result = validateManifest({
				...validExternalRef,
				deployable: true,
			});
			expect(result.valid).toBe(false);
		});

		it("does not require sha256, version, deploy", () => {
			const result = validateManifest(validExternalRef);
			expect(result.valid).toBe(true);
		});
	});

	describe("invalid input", () => {
		it("rejects null", () => {
			const result = validateManifest(null);
			expect(result.valid).toBe(false);
		});

		it("rejects empty object", () => {
			const result = validateManifest({});
			expect(result.valid).toBe(false);
		});

		it("rejects unknown kind", () => {
			const result = validateManifest({
				description: "test",
				id: "test",
				kind: "unknown-kind",
				title: "Test",
			});
			expect(result.valid).toBe(false);
		});

		it("rejects invalid id format", () => {
			const result = validateManifest({
				deployable: false,
				description: "test",
				id: "Invalid_ID",
				kind: "external-ref",
				title: "Test",
			});
			expect(result.valid).toBe(false);
		});
	});
});
