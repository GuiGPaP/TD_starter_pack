import { z } from "zod";

/**
 * Asset source — where the asset was discovered.
 */
export const assetSourceSchema = z.enum([
	"builtin",
	"user",
	"project",
] as const);
export type AssetSource = z.infer<typeof assetSourceSchema>;

/**
 * Asset kind discriminator.
 */
export const assetKindSchema = z.enum(["tox-asset", "external-ref"] as const);
export type AssetKind = z.infer<typeof assetKindSchema>;

/**
 * Provenance information for a tox-asset.
 */
export const provenanceSchema = z.object({
	license: z.string(),
	source: z.enum(["project-original", "community", "palette"] as const),
});

/**
 * Deploy configuration for a tox-asset.
 */
export const deployConfigSchema = z.object({
	containerName: z.string(),
	mode: z.literal("import_tox"),
});

/**
 * TD version compatibility.
 */
export const tdVersionSchema = z.object({
	min: z.string(),
});

/**
 * Base manifest fields shared by all kinds.
 */
const baseManifestSchema = z.object({
	aliases: z.array(z.string()).optional(),
	description: z.string(),
	id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
	postDeployChecks: z.array(z.string()).optional(),
	requirements: z.array(z.string()).optional(),
	tags: z.array(z.string()).optional(),
	title: z.string(),
	useCases: z.array(z.string()).optional(),
});

/**
 * Manifest for a deployable .tox asset.
 */
export const toxAssetManifestSchema = baseManifestSchema.extend({
	deploy: deployConfigSchema,
	kind: z.literal("tox-asset"),
	provenance: provenanceSchema,
	sha256: z.string().regex(/^[a-f0-9]{64}$/),
	tdVersion: tdVersionSchema,
	version: z.string().regex(/^\d+\.\d+\.\d+$/),
});
export type ToxAssetManifest = z.infer<typeof toxAssetManifestSchema>;

/**
 * Manifest for an external reference (documentation-only, not deployable).
 */
export const externalRefManifestSchema = baseManifestSchema.extend({
	deployable: z.literal(false),
	kind: z.literal("external-ref"),
});
export type ExternalRefManifest = z.infer<typeof externalRefManifestSchema>;

/**
 * Discriminated union of all manifest kinds.
 */
export const assetManifestSchema = z.discriminatedUnion("kind", [
	toxAssetManifestSchema,
	externalRefManifestSchema,
]);
export type AssetManifest = z.infer<typeof assetManifestSchema>;

/**
 * A loaded asset entry with resolved paths and source metadata.
 */
export interface LoadedAsset {
	/** Absolute path to the directory containing the manifest */
	dirPath: string;
	manifest: AssetManifest;
	/** README content, if available */
	readme?: string;
	source: AssetSource;
	/** Absolute path to asset.tox (only for tox-asset kind) */
	toxPath?: string;
}
