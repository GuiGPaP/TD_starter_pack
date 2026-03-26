import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the path to the built-in assets directory.
 *
 * Resolution order:
 * 1. TD_MCP_ASSETS_BUILTIN_PATH env var (explicit override)
 * 2. dist/data/td-assets/built-in/ (prod, relative to this module)
 * 3. data/td-assets/built-in/ (dev/test, relative to repo root)
 */
export function resolveBuiltinAssetsPath(metaUrl: string): string | undefined {
	// 1. Env override
	const envPath = process.env.TD_MCP_ASSETS_BUILTIN_PATH;
	if (envPath && existsSync(envPath)) {
		return envPath;
	}

	// 2. Relative to module location (dist/features/templates/paths.js → dist/data/td-assets/built-in/)
	const thisDir = dirname(fileURLToPath(metaUrl));
	const distPath = join(
		thisDir,
		"..",
		"..",
		"..",
		"data",
		"td-assets",
		"built-in",
	);
	if (existsSync(distPath)) {
		return distPath;
	}

	// 3. Repo root fallback (dev/test)
	const repoRoot = join(thisDir, "..", "..", "..");
	const devPath = join(repoRoot, "data", "td-assets", "built-in");
	if (existsSync(devPath)) {
		return devPath;
	}

	return undefined;
}

/**
 * Resolve the user assets directory (cross-platform).
 *
 * - Windows: %APPDATA%/td-mcp/assets/
 * - macOS: ~/Library/Application Support/td-mcp/assets/
 * - Linux: $XDG_CONFIG_HOME/td-mcp/assets/ (fallback ~/.config/td-mcp/assets/)
 */
export function resolveUserAssetsPath(): string | undefined {
	const platform = process.platform;
	let base: string | undefined;

	if (platform === "win32") {
		base = process.env.APPDATA;
	} else if (platform === "darwin") {
		const home = process.env.HOME;
		if (home) {
			base = join(home, "Library", "Application Support");
		}
	} else {
		base =
			process.env.XDG_CONFIG_HOME ??
			(process.env.HOME ? join(process.env.HOME, ".config") : undefined);
	}

	if (!base) return undefined;
	const userPath = join(base, "td-mcp", "assets");
	return existsSync(userPath) ? userPath : undefined;
}

/**
 * Resolve the project assets directory from env var.
 */
export function resolveProjectAssetsPath(): string | undefined {
	const envPath = process.env.TD_MCP_ASSETS_PATH;
	if (envPath && existsSync(envPath)) {
		return envPath;
	}
	return undefined;
}
