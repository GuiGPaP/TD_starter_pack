import { describe, expect, it } from "vitest";
import {
	formatChopChannels,
	formatCompExtensions,
	formatCompleteOpPaths,
	formatDatTableInfo,
	formatParameterSchema,
} from "../../../src/features/tools/presenter/introspectionFormatter";

describe("formatParameterSchema", () => {
	it("handles undefined data", () => {
		expect(formatParameterSchema(undefined)).toContain("No parameter schema");
	});

	it("formats summary with parameters", () => {
		const text = formatParameterSchema(
			{
				count: 1,
				nodePath: "/p1/noise1",
				opType: "noiseCHOP",
				parameters: [
					{
						max: 100,
						menuLabels: [],
						menuNames: [],
						min: 0,
						name: "seed",
						style: "Int",
						val: 42,
					},
				],
			},
			{ detailLevel: "summary" },
		);
		expect(text).toContain("seed");
		expect(text).toContain("Int");
	});

	it("minimal shows only count", () => {
		const text = formatParameterSchema(
			{
				count: 2,
				nodePath: "/p1/noise1",
				opType: "noiseCHOP",
				parameters: [
					{ menuLabels: [], menuNames: [], name: "a", style: "Float", val: 0 },
					{ menuLabels: [], menuNames: [], name: "b", style: "Float", val: 1 },
				],
			},
			{ detailLevel: "minimal" },
		);
		expect(text).toContain("2 parameter(s)");
		expect(text).not.toContain("Float");
	});
});

describe("formatCompleteOpPaths", () => {
	it("handles no matches", () => {
		const text = formatCompleteOpPaths({
			contextNodePath: "/p1/s1",
			count: 0,
			matches: [],
			prefix: "zzz",
			truncated: false,
		});
		expect(text).toContain("No matches");
	});

	it("formats matches", () => {
		const text = formatCompleteOpPaths({
			contextNodePath: "/p1/s1",
			count: 1,
			matches: [
				{
					family: "CHOP",
					name: "noise1",
					opType: "noiseCHOP",
					path: "/p1/noise1",
					relativeRef: "noise1",
				},
			],
			prefix: "noise",
			truncated: false,
		});
		expect(text).toContain("noise1");
	});
});

describe("formatChopChannels", () => {
	it("formats channel list", () => {
		const text = formatChopChannels({
			channels: [{ name: "tx" }, { name: "ty" }],
			nodePath: "/p1/noise1",
			numChannels: 2,
			numSamples: 100,
			sampleRate: 60,
			truncated: false,
		});
		expect(text).toContain("tx");
		expect(text).toContain("60 Hz");
	});
});

describe("formatDatTableInfo", () => {
	it("formats table dimensions", () => {
		const text = formatDatTableInfo({
			nodePath: "/p1/table1",
			numCols: 2,
			numRows: 3,
			sampleData: [
				["a", "b"],
				["1", "2"],
			],
			truncatedCells: false,
			truncatedCols: false,
			truncatedRows: false,
		});
		expect(text).toContain("3 rows");
		expect(text).toContain("2 cols");
	});
});

describe("formatCompExtensions", () => {
	it("formats empty extensions", () => {
		const text = formatCompExtensions({
			compPath: "/p1/base1",
			extensions: [],
		});
		expect(text).toContain("no extensions");
	});

	it("formats extension summary", () => {
		const text = formatCompExtensions({
			compPath: "/p1/base1",
			extensions: [
				{
					methodCount: 3,
					methods: [{ name: "doStuff", signature: "(x: int)" }],
					name: "MyExt",
					properties: [{ name: "color", type: "str" }],
					propertyCount: 1,
				},
			],
		});
		expect(text).toContain("MyExt");
		expect(text).toContain("3 methods");
	});
});
