export { indexFileName, resolveIndexCacheDir } from "./paths.js";
export { readIndex, writeIndex } from "./persistence.js";
export type { PaletteSearchOptions } from "./registry.js";
export { PaletteRegistry } from "./registry.js";
export { buildIndexPaletteScript, buildLoadPaletteScript } from "./scripts.js";
export {
	type PaletteEntry,
	type PaletteIndex,
	paletteEntrySchema,
	paletteIndexSchema,
} from "./types.js";
