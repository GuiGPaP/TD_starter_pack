import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the path to the td-knowledge data directory.
 *
 * Resolution order:
 * 1. TD_MCP_KNOWLEDGE_PATH env var (explicit override)
 * 2. dist/data/td-knowledge/ (prod, relative to this module)
 * 3. data/td-knowledge/ (dev/test, relative to repo root)
 */
export function resolveKnowledgePath(metaUrl: string): string | undefined {
	// 1. Env override
	const envPath = process.env.TD_MCP_KNOWLEDGE_PATH;
	if (envPath && existsSync(envPath)) {
		return envPath;
	}

	// 2. Relative to module location (dist/features/resources/paths.js → dist/data/td-knowledge/)
	const thisDir = dirname(fileURLToPath(metaUrl));
	const distPath = join(thisDir, "..", "..", "..", "data", "td-knowledge");
	if (existsSync(distPath)) {
		return distPath;
	}

	// 3. Repo root fallback (dev/test)
	const repoRoot = join(thisDir, "..", "..", "..");
	const devPath = join(repoRoot, "data", "td-knowledge");
	if (existsSync(devPath)) {
		return devPath;
	}

	return undefined;
}
