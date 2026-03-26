import type { ZodError } from "zod";
import type { AssetManifest } from "./types.js";
import { assetManifestSchema } from "./types.js";

export interface ValidationResult {
	errors?: string[];
	manifest?: AssetManifest;
	valid: boolean;
}

/**
 * Validate a raw manifest object against the asset manifest schema.
 * Returns a structured result with parsed manifest or error messages.
 */
export function validateManifest(raw: unknown): ValidationResult {
	const result = assetManifestSchema.safeParse(raw);
	if (result.success) {
		return { manifest: result.data, valid: true };
	}
	return {
		errors: formatZodErrors(result.error),
		valid: false,
	};
}

function formatZodErrors(error: ZodError): string[] {
	return error.issues.map((issue) => {
		const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
		return `${path}: ${issue.message}`;
	});
}
