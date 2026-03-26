import type { ILogger } from "../../core/logger.js";
import { loadAssetsFromDir } from "./loader.js";
import type { AssetSource, LoadedAsset } from "./types.js";

export interface SearchOptions {
	maxResults?: number;
	minTdVersion?: string;
	query?: string;
	tags?: string[];
}

/**
 * In-memory registry of loaded TD assets.
 * Supports search and lookup by ID. Fail-soft: invalid manifests are skipped.
 */
export class AssetRegistry {
	private readonly assets = new Map<string, LoadedAsset>();
	private readonly logger?: ILogger;

	constructor(logger?: ILogger) {
		this.logger = logger;
	}

	/** Number of loaded assets. */
	get size(): number {
		return this.assets.size;
	}

	/** Get a single asset by ID. */
	getById(id: string): LoadedAsset | undefined {
		return this.assets.get(id);
	}

	/** Get all loaded assets. */
	getAll(): LoadedAsset[] {
		return [...this.assets.values()];
	}

	/**
	 * Load assets from multiple base paths.
	 * Duplicate IDs: first-loaded wins (built-in > user > project).
	 */
	loadAll(paths: Array<{ path: string; source: AssetSource }>): void {
		for (const { path, source } of paths) {
			const loaded = loadAssetsFromDir(path, source, this.logger);
			for (const asset of loaded) {
				if (this.assets.has(asset.manifest.id)) {
					this.logger?.sendLog({
						data: `Duplicate asset ID "${asset.manifest.id}" from ${source}:${path}, skipping (first-loaded wins)`,
						level: "warning",
						logger: "AssetRegistry",
					});
					continue;
				}
				this.assets.set(asset.manifest.id, asset);
			}
		}
		this.logger?.sendLog({
			data: `Asset registry loaded: ${this.assets.size} asset(s)`,
			level: "info",
			logger: "AssetRegistry",
		});
	}

	/**
	 * Search assets by query string and/or tags.
	 * Matches against id, title, aliases, description, tags, useCases.
	 */
	search(opts: SearchOptions = {}): LoadedAsset[] {
		const { maxResults = 20, minTdVersion, query, tags } = opts;
		const normalizedQuery = query?.trim().toLowerCase();

		let results = this.getAll();

		// Filter by query
		if (normalizedQuery) {
			results = results.filter((a) => matchesQuery(a, normalizedQuery));
		}

		// Filter by tags
		if (tags && tags.length > 0) {
			const normalizedTags = tags.map((t) => t.toLowerCase());
			results = results.filter((a) => {
				const assetTags = a.manifest.tags?.map((t) => t.toLowerCase()) ?? [];
				return normalizedTags.some((t) => assetTags.includes(t));
			});
		}

		// Filter by min TD version
		if (minTdVersion) {
			results = results.filter((a) => {
				if (a.manifest.kind !== "tox-asset") return true;
				return a.manifest.tdVersion.min <= minTdVersion;
			});
		}

		return results.slice(0, maxResults);
	}
}

function matchesQuery(asset: LoadedAsset, query: string): boolean {
	const m = asset.manifest;
	const haystacks = [
		m.id,
		m.title,
		m.description,
		...(m.aliases ?? []),
		...(m.tags ?? []),
		...(m.useCases ?? []),
	];
	return haystacks.some((h) => h.toLowerCase().includes(query));
}
