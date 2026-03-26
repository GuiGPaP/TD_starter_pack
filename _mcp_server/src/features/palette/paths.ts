import { join } from "node:path";

/**
 * Resolve the palette index cache directory (cross-platform).
 *
 * Override: TD_MCP_PALETTE_INDEX_PATH env var.
 * - Windows: %APPDATA%/td-mcp/palette/
 * - macOS:   ~/Library/Application Support/td-mcp/palette/
 * - Linux:   $XDG_CONFIG_HOME/td-mcp/palette/
 */
export function resolveIndexCacheDir(): string | undefined {
	const envOverride = process.env.TD_MCP_PALETTE_INDEX_PATH;
	if (envOverride) return envOverride;

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
	return join(base, "td-mcp", "palette");
}

/**
 * Build the index file name for a given TD version.
 */
export function indexFileName(tdVersion: string): string {
	const safe = tdVersion.replace(/[^a-zA-Z0-9._-]/g, "_");
	return `palette-index-${safe}.json`;
}
