export {
	lessonsPathFor,
	loadLessons,
	loadManifest,
	manifestPathFor,
	markdownPathFor,
	scanForProjects,
	thumbnailPathFor,
} from "./loader.js";
export { ProjectCatalogRegistry } from "./registry.js";
export type { ProjectEntry, ProjectManifest } from "./types.js";
export {
	CATALOG_SIDECAR_SUFFIX,
	LESSONS_SIDECAR_SUFFIX,
	projectManifestSchema,
} from "./types.js";
