import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	loadRuntimeOperatorEntries,
	mergeOperatorEntries,
	operatorEntryIdFromOpType,
	saveRuntimeOperatorEntries,
} from "../../../src/features/resources/operatorRuntimeCache.js";
import type { TDOperatorEntry } from "../../../src/features/resources/types.js";

function makeOperator(
	overrides: Partial<TDOperatorEntry> = {},
): TDOperatorEntry {
	return {
		content: { summary: "Runtime summary" },
		id: "noise-top",
		kind: "operator",
		payload: {
			opFamily: "TOP",
			opType: "noiseTOP",
			parameters: [{ default: 1, name: "period" }],
		},
		provenance: {
			confidence: "high",
			license: "local-user-cache-not-redistributed",
			source: "runtime-introspection",
		},
		searchKeywords: ["noise", "period"],
		title: "noiseTOP",
		...overrides,
	} as TDOperatorEntry;
}

describe("operatorRuntimeCache", () => {
	let tempDir: string;
	let previousCacheDir: string | undefined;

	beforeEach(() => {
		tempDir = join(tmpdir(), `td-operator-cache-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		previousCacheDir = process.env.TD_MCP_OPERATOR_CACHE_DIR;
		process.env.TD_MCP_OPERATOR_CACHE_DIR = tempDir;
	});

	afterEach(() => {
		if (previousCacheDir === undefined) {
			delete process.env.TD_MCP_OPERATOR_CACHE_DIR;
		} else {
			process.env.TD_MCP_OPERATOR_CACHE_DIR = previousCacheDir;
		}
		rmSync(tempDir, { force: true, recursive: true });
	});

	it("writes and loads a build-specific operator cache", () => {
		saveRuntimeOperatorEntries([makeOperator()], "2026.10000", "2026");

		const loaded = loadRuntimeOperatorEntries("2026.10000");

		expect(loaded).toHaveLength(1);
		expect(loaded[0].payload.opType).toBe("noiseTOP");
	});

	it("merges local OfflineHelp text with runtime parameter facts", () => {
		const runtime = makeOperator();
		const offline = makeOperator({
			content: { summary: "Noise creates procedural images." },
			payload: {
				opFamily: "TOP",
				opType: "noiseTOP",
				parameters: [
					{
						description: "period - Controls the noise scale.",
						label: "Period",
						name: "period",
					},
				],
			},
			provenance: {
				confidence: "high",
				license: "local-user-cache-not-redistributed",
				source: "local-offline-help",
			},
			searchKeywords: ["noise", "scale"],
		});

		const merged = mergeOperatorEntries(runtime, offline);

		expect(merged.content.summary).toContain("procedural");
		expect(merged.payload.parameters[0]).toMatchObject({
			default: 1,
			description: "period - Controls the noise scale.",
			name: "period",
		});
		expect(merged.searchKeywords).toContain("scale");
	});

	it("derives stable IDs from opType suffixes", () => {
		expect(operatorEntryIdFromOpType("audiofileinCHOP")).toBe(
			"audiofilein-chop",
		);
		expect(operatorEntryIdFromOpType("glslTOP")).toBe("glsl-top");
	});
});
