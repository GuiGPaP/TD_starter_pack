import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { type PaletteIndex, paletteIndexSchema } from "./types.js";

/**
 * Read and validate a persisted palette index. Returns null on any error.
 */
export function readIndex(filePath: string): PaletteIndex | null {
	try {
		if (!existsSync(filePath)) return null;
		const raw = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw);
		const result = paletteIndexSchema.safeParse(parsed);
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}

/**
 * Persist a palette index atomically (write-tmp then rename).
 */
export function writeIndex(filePath: string, index: PaletteIndex): void {
	const dir = dirname(filePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	const tmp = join(dir, `.palette-index-${Date.now()}.tmp`);
	writeFileSync(tmp, JSON.stringify(index, null, "\t"), "utf-8");
	renameSync(tmp, filePath);
}
