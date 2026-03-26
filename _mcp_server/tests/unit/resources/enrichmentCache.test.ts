import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	EnrichmentCache,
	PARAM_SCHEMA_TTL_MS,
} from "../../../src/features/resources/enrichmentCache.js";

describe("EnrichmentCache", () => {
	let cache: EnrichmentCache<string>;

	beforeEach(() => {
		vi.useFakeTimers();
		cache = new EnrichmentCache<string>();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should return undefined for missing key", () => {
		expect(cache.get("missing")).toBeUndefined();
	});

	it("should return cached value before TTL", () => {
		cache.set("key", "value", 1000);
		expect(cache.get("key")).toBe("value");
	});

	it("should return undefined after TTL expiration", () => {
		cache.set("key", "value", 1000);
		vi.advanceTimersByTime(1001);
		expect(cache.get("key")).toBeUndefined();
	});

	it("should overwrite existing key", () => {
		cache.set("key", "first", 5000);
		cache.set("key", "second", 5000);
		expect(cache.get("key")).toBe("second");
	});

	it("should invalidateAll and clear all entries", () => {
		cache.set("a", "1", 5000);
		cache.set("b", "2", 5000);
		expect(cache.size).toBe(2);

		cache.invalidateAll();
		expect(cache.size).toBe(0);
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBeUndefined();
	});

	it("should track size correctly", () => {
		expect(cache.size).toBe(0);
		cache.set("a", "1", 5000);
		expect(cache.size).toBe(1);
		cache.set("b", "2", 5000);
		expect(cache.size).toBe(2);
	});

	it("should export PARAM_SCHEMA_TTL_MS as 5 minutes", () => {
		expect(PARAM_SCHEMA_TTL_MS).toBe(5 * 60 * 1000);
	});
});
