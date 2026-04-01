import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { TDLessonEntry } from "../resources/types.js";
import { knowledgeEntrySchema } from "../resources/types.js";
import {
	CATALOG_SIDECAR_SUFFIX,
	LESSONS_SIDECAR_SUFFIX,
	type ProjectEntry,
	type ProjectManifest,
	projectManifestSchema,
} from "./types.js";

/**
 * Derive the sidecar manifest path from a .toe file path.
 * Example: /path/to/foo.toe → /path/to/foo.td-catalog.json
 */
export function manifestPathFor(toePath: string): string {
	const name = basename(toePath, ".toe");
	return join(dirname(toePath), `${name}${CATALOG_SIDECAR_SUFFIX}.json`);
}

/**
 * Derive the sidecar markdown path from a .toe file path.
 */
export function markdownPathFor(toePath: string): string {
	const name = basename(toePath, ".toe");
	return join(dirname(toePath), `${name}${CATALOG_SIDECAR_SUFFIX}.md`);
}

/**
 * Derive the sidecar thumbnail path from a .toe file path.
 */
export function thumbnailPathFor(toePath: string): string {
	const name = basename(toePath, ".toe");
	return join(dirname(toePath), `${name}${CATALOG_SIDECAR_SUFFIX}.png`);
}

/**
 * Load a manifest sidecar for a .toe file, if it exists.
 * Returns null if the sidecar doesn't exist or is invalid.
 */
export function loadManifest(toePath: string): ProjectManifest | null {
	const mPath = manifestPathFor(toePath);
	if (!existsSync(mPath)) return null;

	try {
		const raw = readFileSync(mPath, "utf-8");
		const parsed = JSON.parse(raw);
		const result = projectManifestSchema.safeParse(parsed);
		if (!result.success) return null;
		return result.data;
	} catch {
		return null;
	}
}

/**
 * Derive the sidecar lessons path from a .toe file path.
 * Example: /path/to/foo.toe → /path/to/foo.td-lessons.json
 */
export function lessonsPathFor(toePath: string): string {
	const name = basename(toePath, ".toe");
	return join(dirname(toePath), `${name}${LESSONS_SIDECAR_SUFFIX}.json`);
}

/**
 * Load lesson entries from a sidecar file next to a .toe file.
 * Returns empty array if the sidecar doesn't exist or is invalid.
 */
export function loadLessons(toePath: string): TDLessonEntry[] {
	const lPath = lessonsPathFor(toePath);
	if (!existsSync(lPath)) return [];

	try {
		const raw = readFileSync(lPath, "utf-8");
		const parsed = JSON.parse(raw);
		const entries = Array.isArray(parsed) ? parsed : [parsed];
		const valid: TDLessonEntry[] = [];
		for (const entry of entries) {
			const result = knowledgeEntrySchema.safeParse(entry);
			if (result.success && result.data.kind === "lesson") {
				valid.push(result.data as TDLessonEntry);
			}
		}
		return valid;
	} catch {
		return [];
	}
}

export interface ScanResult {
	indexed: ProjectEntry[];
	notIndexed: string[];
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".venv", "dist", "Backup"]);

function visitEntry(
	entry: string,
	dir: string,
	indexed: ProjectEntry[],
	notIndexed: string[],
	walk: (dir: string, depth: number) => void,
	depth: number,
): void {
	if (SKIP_DIRS.has(entry)) return;

	const fullPath = join(dir, entry);
	try {
		const stat = statSync(fullPath);
		if (stat.isDirectory()) {
			walk(fullPath, depth + 1);
		} else if (entry.endsWith(".toe") && !entry.endsWith(".toe.bak")) {
			const manifest = loadManifest(fullPath);
			if (manifest) {
				indexed.push({ manifest, toePath: fullPath });
			} else {
				notIndexed.push(fullPath);
			}
		}
	} catch {
		// Permission denied or broken symlink — skip
	}
}

/**
 * Recursively scan a directory for .toe files and check for manifest sidecars.
 */
export function scanForProjects(rootDir: string, maxDepth = 5): ScanResult {
	const indexed: ProjectEntry[] = [];
	const notIndexed: string[] = [];

	function walk(dir: string, depth: number): void {
		if (depth > maxDepth) return;
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const entry of entries) {
			visitEntry(entry, dir, indexed, notIndexed, walk, depth);
		}
	}

	walk(rootDir, 0);
	return { indexed, notIndexed };
}
