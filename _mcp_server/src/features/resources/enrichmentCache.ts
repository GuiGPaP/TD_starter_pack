/** TTL for parameter schema cache entries (5 minutes). */
export const PARAM_SCHEMA_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
	value: T;
	expiresAt: number;
}

/**
 * Generic in-memory cache with per-entry TTL.
 * Used by FusionService to cache enriched operator entries.
 */
export class EnrichmentCache<T> {
	private readonly store = new Map<string, CacheEntry<T>>();

	get size(): number {
		return this.store.size;
	}

	get(key: string): T | undefined {
		const entry = this.store.get(key);
		if (!entry) return undefined;
		if (Date.now() >= entry.expiresAt) {
			this.store.delete(key);
			return undefined;
		}
		return entry.value;
	}

	set(key: string, value: T, ttlMs: number): void {
		this.store.set(key, { expiresAt: Date.now() + ttlMs, value });
	}

	invalidateAll(): void {
		this.store.clear();
	}
}
