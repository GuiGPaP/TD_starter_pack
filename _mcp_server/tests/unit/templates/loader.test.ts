import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	loadAssetFromDir,
	loadAssetsFromDir,
} from "../../../src/features/templates/loader.js";
import { assetManifestSchema } from "../../../src/features/templates/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const builtInDir = join(__dirname, "../../../data/td-assets/built-in");

describe("asset loader", () => {
	const assetDirs = readdirSync(builtInDir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name);

	describe("manifest validation", () => {
		for (const dir of assetDirs) {
			it(`${dir}/manifest.json passes schema validation`, () => {
				const manifestPath = join(builtInDir, dir, "manifest.json");
				const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
				const result = assetManifestSchema.safeParse(raw);
				expect(result.success).toBe(true);
			});
		}
	});

	describe("sha256 integrity", () => {
		for (const dir of assetDirs) {
			it(`${dir}/asset.tox sha256 matches manifest`, () => {
				const manifestPath = join(builtInDir, dir, "manifest.json");
				const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
				if (manifest.kind !== "tox-asset") return;

				const toxPath = join(builtInDir, dir, "asset.tox");
				const toxData = readFileSync(toxPath);
				const actualHash = createHash("sha256").update(toxData).digest("hex");
				expect(actualHash).toBe(manifest.sha256);
			});
		}
	});

	describe("no duplicate IDs", () => {
		it("all asset IDs are unique", () => {
			const ids = new Set<string>();
			for (const dir of assetDirs) {
				const manifestPath = join(builtInDir, dir, "manifest.json");
				const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
				expect(ids.has(manifest.id)).toBe(false);
				ids.add(manifest.id);
			}
		});
	});

	describe("required fields", () => {
		for (const dir of assetDirs) {
			it(`${dir} has all required fields for its kind`, () => {
				const manifestPath = join(builtInDir, dir, "manifest.json");
				const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

				expect(manifest.id).toBeDefined();
				expect(manifest.title).toBeDefined();
				expect(manifest.kind).toBeDefined();
				expect(manifest.description).toBeDefined();

				if (manifest.kind === "tox-asset") {
					expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
					expect(manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
					expect(manifest.tdVersion?.min).toBeDefined();
					expect(manifest.deploy?.mode).toBe("import_tox");
					expect(manifest.deploy?.containerName).toBeDefined();
					expect(manifest.provenance?.source).toBeDefined();
					expect(manifest.provenance?.license).toBeDefined();
				}
			});
		}
	});

	describe("loadAssetFromDir", () => {
		it("loads a valid asset directory", () => {
			const asset = loadAssetFromDir(join(builtInDir, "null-debug"), "builtin");
			expect(asset).toBeDefined();
			expect(asset?.manifest.id).toBe("null-debug");
			expect(asset?.manifest.kind).toBe("tox-asset");
			expect(asset?.source).toBe("builtin");
			expect(asset?.toxPath).toBeDefined();
		});

		it("returns undefined for nonexistent directory", () => {
			const asset = loadAssetFromDir(
				join(builtInDir, "does-not-exist"),
				"builtin",
			);
			expect(asset).toBeUndefined();
		});
	});

	describe("loadAssetsFromDir", () => {
		it("loads all built-in assets", () => {
			const assets = loadAssetsFromDir(builtInDir, "builtin");
			expect(assets.length).toBe(assetDirs.length);
			const ids = assets.map((a) => a.manifest.id).sort();
			expect(ids).toEqual(
				assetDirs
					.map((d) => {
						const m = JSON.parse(
							readFileSync(join(builtInDir, d, "manifest.json"), "utf-8"),
						);
						return m.id;
					})
					.sort(),
			);
		});

		it("returns empty array for nonexistent path", () => {
			const assets = loadAssetsFromDir("/nonexistent/path", "builtin");
			expect(assets).toEqual([]);
		});
	});
});
