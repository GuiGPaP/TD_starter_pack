import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ILogger } from "../../core/logger.js";
import {
	type AssetSource,
	assetManifestSchema,
	type LoadedAsset,
} from "./types.js";

/**
 * Load a single asset manifest from a directory.
 * Returns undefined (with a warning log) if the manifest is missing or invalid.
 */
export function loadAssetFromDir(
	dirPath: string,
	source: AssetSource,
	logger?: ILogger,
): LoadedAsset | undefined {
	const manifestPath = join(dirPath, "manifest.json");
	if (!existsSync(manifestPath)) {
		logger?.sendLog({
			data: `No manifest.json found in ${dirPath}, skipping`,
			level: "warning",
			logger: "AssetLoader",
		});
		return undefined;
	}

	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
	} catch (err) {
		logger?.sendLog({
			data: `Failed to parse ${manifestPath}: ${err}`,
			level: "warning",
			logger: "AssetLoader",
		});
		return undefined;
	}

	const result = assetManifestSchema.safeParse(raw);
	if (!result.success) {
		logger?.sendLog({
			data: `Invalid manifest in ${dirPath}: ${result.error.message}`,
			level: "warning",
			logger: "AssetLoader",
		});
		return undefined;
	}

	const manifest = result.data;
	const asset: LoadedAsset = {
		dirPath,
		manifest,
		source,
	};

	// Load optional README
	const readmePath = join(dirPath, "README.md");
	if (existsSync(readmePath)) {
		try {
			asset.readme = readFileSync(readmePath, "utf-8");
		} catch {
			// Non-critical — skip README
		}
	}

	// Resolve tox path for tox-asset kind
	if (manifest.kind === "tox-asset") {
		const toxPath = join(dirPath, "asset.tox");
		if (existsSync(toxPath)) {
			asset.toxPath = toxPath;
		} else {
			logger?.sendLog({
				data: `asset.tox missing for tox-asset "${manifest.id}" in ${dirPath}`,
				level: "warning",
				logger: "AssetLoader",
			});
		}
	}

	return asset;
}

/**
 * Load all assets from a base directory (scans immediate subdirectories).
 * Each subdirectory should contain a manifest.json.
 * Invalid manifests are skipped with a warning (fail-soft).
 */
export function loadAssetsFromDir(
	basePath: string,
	source: AssetSource,
	logger?: ILogger,
): LoadedAsset[] {
	if (!existsSync(basePath)) {
		return [];
	}

	let entries: string[];
	try {
		entries = readdirSync(basePath, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name);
	} catch (err) {
		logger?.sendLog({
			data: `Failed to read directory ${basePath}: ${err}`,
			level: "warning",
			logger: "AssetLoader",
		});
		return [];
	}

	const assets: LoadedAsset[] = [];
	for (const entry of entries) {
		const asset = loadAssetFromDir(join(basePath, entry), source, logger);
		if (asset) {
			assets.push(asset);
		}
	}
	return assets;
}
