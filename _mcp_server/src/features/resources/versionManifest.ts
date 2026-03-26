import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ILogger } from "../../core/logger.js";
import { resolveKnowledgePath } from "./paths.js";

export interface TDVersionInfo {
	breakingChanges?: string[];
	highlights?: string[];
	id: string;
	label?: string;
	newOperators?: string[];
	pythonVersion: string;
	releaseYear?: number;
	supportStatus: "active" | "current" | "legacy" | "maintenance";
}

export interface CompatibilityInfo {
	level: "compatible" | "deprecated" | "unavailable" | "unknown";
	reason?: string;
	since?: string;
	suggestedReplacement?: string;
}

interface VersionManifestData {
	currentStable: string;
	schemaVersion: string;
	versions: TDVersionInfo[];
}

/**
 * Normalize a raw TD build string to a major year (e.g., "2023", "2024").
 *
 * Handles two known formats:
 * - "2023.11000" → "2023"
 * - "099.2025.31760" → "2025"
 */
export function normalizeTdVersion(tdBuild: string): string | null {
	if (!tdBuild) return null;

	// Format "2023.11000" — year is the first segment, 4 digits starting with 20xx
	const dotParts = tdBuild.split(".");
	for (const part of dotParts) {
		const num = Number.parseInt(part, 10);
		if (num >= 2020 && num <= 2099) {
			return String(num);
		}
	}

	return null;
}

/**
 * Loads and queries the TD version manifest.
 * Loaded from `data/td-knowledge/version-manifest.json` (dedicated file, not via generic loader).
 */
export class VersionManifest {
	private readonly versions = new Map<string, TDVersionInfo>();
	private currentStable: string | null = null;

	constructor(private readonly logger?: ILogger) {}

	get size(): number {
		return this.versions.size;
	}

	/**
	 * Load from the standard knowledge base path.
	 * Uses the same resolution as KnowledgeRegistry.
	 */
	loadFromKnowledgePath(importMetaUrl: string): boolean {
		const basePath = resolveKnowledgePath(importMetaUrl);
		if (!basePath) return false;

		const manifestPath = join(basePath, "version-manifest.json");
		return this.loadFromFile(manifestPath);
	}

	loadFromFile(filePath: string): boolean {
		if (!existsSync(filePath)) {
			this.logger?.sendLog({
				data: `Version manifest not found: ${filePath}`,
				level: "warning",
				logger: "VersionManifest",
			});
			return false;
		}

		try {
			const raw = readFileSync(filePath, "utf-8");
			const data: VersionManifestData = JSON.parse(raw);
			this.currentStable = data.currentStable;
			for (const v of data.versions) {
				this.versions.set(v.id, v);
			}
			this.logger?.sendLog({
				data: `Version manifest loaded: ${this.versions.size} versions`,
				level: "info",
				logger: "VersionManifest",
			});
			return true;
		} catch (err) {
			this.logger?.sendLog({
				data: `Failed to load version manifest: ${err}`,
				level: "warning",
				logger: "VersionManifest",
			});
			return false;
		}
	}

	getVersion(id: string): TDVersionInfo | undefined {
		return this.versions.get(id);
	}

	getCurrentStable(): string | null {
		return this.currentStable;
	}

	getAllVersions(): TDVersionInfo[] {
		return [...this.versions.values()];
	}

	/**
	 * Check operator compatibility against a TD version.
	 *
	 * @param operatorVersions - The versions field from the operator entry
	 * @param tdVersion - Normalized TD version year (e.g., "2023")
	 */
	checkCompatibility(
		operatorVersions:
			| {
					addedIn?: string;
					deprecated?: boolean;
					deprecatedSince?: string;
					removedIn?: string;
					suggestedReplacement?: string;
			  }
			| undefined,
		tdVersion: string | null,
	): CompatibilityInfo {
		if (!tdVersion || !operatorVersions) {
			return { level: "unknown" };
		}

		const tdYear = Number.parseInt(tdVersion, 10);
		if (Number.isNaN(tdYear)) return { level: "unknown" };

		// Check if removed
		if (operatorVersions.removedIn) {
			const removedYear = Number.parseInt(operatorVersions.removedIn, 10);
			if (!Number.isNaN(removedYear) && tdYear >= removedYear) {
				return {
					level: "unavailable",
					reason: `Removed in TD ${operatorVersions.removedIn}`,
					since: operatorVersions.removedIn,
					suggestedReplacement: operatorVersions.suggestedReplacement,
				};
			}
		}

		// Check if not yet available
		if (operatorVersions.addedIn) {
			const addedYear = Number.parseInt(operatorVersions.addedIn, 10);
			if (!Number.isNaN(addedYear) && tdYear < addedYear) {
				return {
					level: "unavailable",
					reason: `Not available until TD ${operatorVersions.addedIn}`,
					since: operatorVersions.addedIn,
				};
			}
		}

		// Check deprecated
		if (operatorVersions.deprecated) {
			return {
				level: "deprecated",
				reason: operatorVersions.deprecatedSince
					? `Deprecated since TD ${operatorVersions.deprecatedSince}`
					: "Deprecated",
				since: operatorVersions.deprecatedSince,
				suggestedReplacement: operatorVersions.suggestedReplacement,
			};
		}

		return { level: "compatible" };
	}
}
