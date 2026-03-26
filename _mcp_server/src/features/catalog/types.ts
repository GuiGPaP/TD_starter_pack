import { z } from "zod";

export const projectManifestSchema = z.object({
	author: z.string().optional(),
	components: z.array(z.string()).optional(),
	created: z.string().optional(),
	description: z.string().default(""),
	file: z.string(),
	modified: z.string().optional(),
	name: z.string(),
	operators: z.record(z.string(), z.number()).optional(),
	projectVersion: z.string().optional(),
	schemaVersion: z.literal("1.0"),
	tags: z.array(z.string()).default([]),
	tdVersion: z.string().optional(),
	thumbnail: z.string().nullable().optional(),
});

export type ProjectManifest = z.infer<typeof projectManifestSchema>;

export interface ProjectEntry {
	manifest: ProjectManifest;
	toePath: string;
}

export const CATALOG_SIDECAR_SUFFIX = ".td-catalog";
export const LESSONS_SIDECAR_SUFFIX = ".td-lessons";
