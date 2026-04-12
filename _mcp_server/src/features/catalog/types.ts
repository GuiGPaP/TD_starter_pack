import { z } from "zod";

const projectParameterValueSchema = z.object({
	expr: z.string().optional(),
	mode: z.string().optional(),
	style: z.string().optional(),
	value: z.unknown().optional(),
});

const projectCustomParameterSchema = z.object({
	label: z.string().optional(),
	name: z.string(),
	page: z.string().optional(),
	style: z.string().optional(),
	value: z.unknown().optional(),
});

const projectNodeSchema = z.object({
	customParameters: z.array(projectCustomParameterSchema).optional(),
	errors: z.string().optional(),
	family: z.string(),
	name: z.string(),
	opType: z.string(),
	parameters: z.record(z.string(), projectParameterValueSchema).optional(),
	parentPath: z.string().optional(),
	path: z.string(),
	tags: z.array(z.string()).optional(),
});

const projectConnectionSchema = z.object({
	from: z.string(),
	fromOutput: z.number().int(),
	to: z.string(),
	toInput: z.number().int(),
});

const projectPatternSchema = z.object({
	kind: z.string(),
	summary: z.string(),
});

export const projectManifestSchema = z.object({
	author: z.string().optional(),
	components: z.array(z.string()).optional(),
	connectionCount: z.number().int().optional(),
	connections: z.array(projectConnectionSchema).optional(),
	created: z.string().optional(),
	description: z.string().default(""),
	file: z.string(),
	modified: z.string().optional(),
	name: z.string(),
	nodeCount: z.number().int().optional(),
	nodes: z.array(projectNodeSchema).optional(),
	operators: z.record(z.string(), z.number()).optional(),
	patterns: z.array(projectPatternSchema).optional(),
	projectVersion: z.string().optional(),
	schemaVersion: z.enum(["1.0", "1.1"]),
	tags: z.array(z.string()).default([]),
	tdVersion: z.string().optional(),
	thumbnail: z.string().nullable().optional(),
	warnings: z.array(z.string()).optional(),
});

export type ProjectManifest = z.infer<typeof projectManifestSchema>;

export interface ProjectEntry {
	manifest: ProjectManifest;
	toePath: string;
}

export const CATALOG_SIDECAR_SUFFIX = ".td-catalog";
export const LESSONS_SIDECAR_SUFFIX = ".td-lessons";
