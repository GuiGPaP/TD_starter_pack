import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ILogger } from "../../core/logger.js";
import { knowledgeEntrySchema, type TDKnowledgeEntry } from "./types.js";

/**
 * Load a single knowledge entry from a JSON file.
 * Returns undefined (with a warning log) if the file is missing or invalid.
 */
export function loadKnowledgeEntry(
	filePath: string,
	logger?: ILogger,
): TDKnowledgeEntry | undefined {
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(filePath, "utf-8"));
	} catch (err) {
		logger?.sendLog({
			data: `Failed to parse ${filePath}: ${err}`,
			level: "warning",
			logger: "KnowledgeLoader",
		});
		return undefined;
	}

	const result = knowledgeEntrySchema.safeParse(raw);
	if (!result.success) {
		logger?.sendLog({
			data: `Invalid knowledge entry in ${filePath}: ${result.error.message}`,
			level: "warning",
			logger: "KnowledgeLoader",
		});
		return undefined;
	}

	return result.data;
}

/**
 * Load all knowledge entries from a base directory (scans *.json recursively in subdirectories).
 * Invalid entries are skipped with a warning (fail-soft).
 */
export function loadKnowledgeEntries(
	basePath: string,
	logger?: ILogger,
): TDKnowledgeEntry[] {
	if (!existsSync(basePath)) {
		return [];
	}

	const entries: TDKnowledgeEntry[] = [];

	let subdirs: string[];
	try {
		subdirs = readdirSync(basePath, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name);
	} catch (err) {
		logger?.sendLog({
			data: `Failed to read directory ${basePath}: ${err}`,
			level: "warning",
			logger: "KnowledgeLoader",
		});
		return [];
	}

	for (const subdir of subdirs) {
		const dirPath = join(basePath, subdir);
		let files: string[];
		try {
			files = readdirSync(dirPath).filter((f) => f.endsWith(".json"));
		} catch {
			continue;
		}
		for (const file of files) {
			const entry = loadKnowledgeEntry(join(dirPath, file), logger);
			if (entry) {
				entries.push(entry);
			}
		}
	}

	return entries;
}
