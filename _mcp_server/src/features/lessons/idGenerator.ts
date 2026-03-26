import type { KnowledgeRegistry } from "../resources/registry.js";

/**
 * Convert a human-readable title to a kebab-case ID.
 * Must match the knowledge entry schema: /^[a-z0-9][a-z0-9-]*$/
 */
export function titleToId(title: string): string {
	return title
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Generate a unique ID by appending a numeric suffix if the base ID is taken.
 */
export function deduplicateId(
	baseId: string,
	registry: KnowledgeRegistry,
): string {
	if (!registry.getById(baseId)) {
		return baseId;
	}
	for (let i = 2; i <= 100; i++) {
		const candidate = `${baseId}-${i}`;
		if (!registry.getById(candidate)) {
			return candidate;
		}
	}
	return `${baseId}-${Date.now()}`;
}
