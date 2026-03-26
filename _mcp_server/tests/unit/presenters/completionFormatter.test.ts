import { describe, expect, it } from "vitest";
import {
	formatProjectIndex,
	formatTdContext,
} from "../../../src/features/tools/presenter/completionFormatter";

describe("formatProjectIndex", () => {
	it("handles undefined data", () => {
		expect(formatProjectIndex(undefined)).toContain("not available");
	});

	it("formats minimal with stats", () => {
		const text = formatProjectIndex(
			{
				markdown: "# Project\nsome content",
				stats: {
					compCount: 3,
					extensionCount: 1,
					opCount: 10,
					warningCount: 0,
				},
				truncated: false,
				warnings: [],
			},
			{ detailLevel: "minimal" },
		);
		expect(text).toContain("ops=10");
		expect(text).toContain("comps=3");
		expect(text).toContain("extensions=1");
	});

	it("minimal shows truncated flag", () => {
		const text = formatProjectIndex(
			{
				markdown: "# Project",
				stats: { opCount: 500 },
				truncated: true,
				warnings: [],
			},
			{ detailLevel: "minimal" },
		);
		expect(text).toContain("truncated");
	});

	it("summary returns markdown content", () => {
		const md = "# Builtins Anti-Erreurs\n\n## td Module\nstuff here";
		const text = formatProjectIndex(
			{
				markdown: md,
				stats: { opCount: 5 },
				truncated: false,
				warnings: [],
			},
			{ detailLevel: "summary" },
		);
		expect(text).toContain("Builtins Anti-Erreurs");
		expect(text).toContain("stuff here");
	});

	it("handles missing stats gracefully", () => {
		const text = formatProjectIndex(
			{ markdown: "empty", warnings: [] },
			{ detailLevel: "minimal" },
		);
		// With no stats object, minimal still renders without crashing
		expect(text).toBeDefined();
		expect(text.length).toBeGreaterThan(0);
	});
});

describe("formatTdContext", () => {
	it("handles undefined data", () => {
		expect(formatTdContext(undefined)).toContain("not available");
	});

	it("formats minimal with facet names", () => {
		const text = formatTdContext(
			{
				facets: { errors: { errors: [] }, parameters: { pars: [] } },
				nodePath: "/project1/geo1",
				warnings: [],
			},
			{ detailLevel: "minimal" },
		);
		expect(text).toContain("/project1/geo1");
		expect(text).toContain("2 facets");
		expect(text).toContain("parameters");
		expect(text).toContain("errors");
	});

	it("summary renders facet sections", () => {
		const text = formatTdContext(
			{
				facets: {
					parameters: { count: 3, pars: ["seed", "amp", "period"] },
				},
				nodePath: "/project1/noise1",
				warnings: [],
			},
			{ detailLevel: "summary" },
		);
		expect(text).toContain("# Context for `/project1/noise1`");
		expect(text).toContain("## parameters");
		expect(text).toContain("seed");
	});

	it("renders warnings section", () => {
		const text = formatTdContext(
			{
				facets: {},
				nodePath: "/project1/geo1",
				warnings: ["channels failed: not a CHOP"],
			},
			{ detailLevel: "summary" },
		);
		expect(text).toContain("## Warnings");
		expect(text).toContain("not a CHOP");
	});

	it("handles empty facets", () => {
		const text = formatTdContext(
			{
				facets: {},
				nodePath: "/project1/geo1",
				warnings: [],
			},
			{ detailLevel: "summary" },
		);
		expect(text).toContain("/project1/geo1");
		expect(text).not.toContain("## Warnings");
	});
});
