import { z } from "zod";

export const paletteEntrySchema = z.object({
	author: z.string().default("Derivative"),
	category: z.string(),
	description: z.string().default(""),
	help: z.string().optional(),
	name: z.string(),
	operators: z.record(z.string(), z.number()).optional(),
	relativePath: z.string(),
	source: z.enum(["builtin", "user"]).optional(),
	tags: z.array(z.string()).default([]),
	topLevelChildren: z.array(z.string()).optional(),
	toxPath: z.string(),
	version: z.string().optional(),
});

export type PaletteEntry = z.infer<typeof paletteEntrySchema>;

export const paletteIndexSchema = z.object({
	entries: z.array(paletteEntrySchema),
	entryCount: z.number(),
	indexedAt: z.string(),
	paletteRoot: z.string(),
	schemaVersion: z.literal("1.0"),
	tdBuild: z.string().optional(),
	tdVersion: z.string(),
	userPaletteRoot: z.string().nullable().optional(),
});

export type PaletteIndex = z.infer<typeof paletteIndexSchema>;
