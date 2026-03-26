import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;

interface BuildFeature {
	area: string;
	description: string;
}

interface ExperimentalBuild {
	breakingChanges: string[];
	features: BuildFeature[];
	graduatedTo: string | null;
	latestBuild: string;
	newOperators: string[];
	pythonApiAdditions: string[];
	releaseDate: string;
	series: string;
	status: string;
}

export function formatBuildDetail(
	build: ExperimentalBuild,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);

	const lines: string[] = [
		`# Experimental Build ${build.series}`,
		"",
		`- **Status:** ${build.status}`,
		`- **Latest Build:** ${build.latestBuild}`,
		`- **Release Date:** ${build.releaseDate}`,
	];

	if (build.graduatedTo) {
		lines.push(`- **Graduated to:** ${build.graduatedTo}`);
	}

	if (build.features.length > 0) {
		lines.push("", "## Features");
		for (const f of build.features) {
			lines.push(`- **${f.area}:** ${f.description}`);
		}
	}

	if (build.breakingChanges.length > 0) {
		lines.push("", "## Breaking Changes");
		for (const bc of build.breakingChanges) {
			lines.push(`- ${bc}`);
		}
	}

	if (build.newOperators.length > 0) {
		lines.push("", `## New Operators: ${build.newOperators.join(", ")}`);
	}

	if (build.pythonApiAdditions.length > 0) {
		lines.push("", "## Python API Additions");
		for (const a of build.pythonApiAdditions) {
			lines.push(`- ${a}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { series: build.series, title: "Experimental Build" },
		structured: build,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

export function formatBuildList(
	builds: ExperimentalBuild[],
	options?: FormatterOpts & { area?: string },
): string {
	const opts = mergeFormatterOptions(options);

	if (builds.length === 0) {
		return finalizeFormattedText("No experimental builds found.", opts, {
			context: { title: "Experimental Builds" },
		});
	}

	const lines: string[] = [`## ${builds.length} Experimental Build(s)`, ""];

	for (const b of builds) {
		const status = b.graduatedTo ? `graduated → ${b.graduatedTo}` : b.status;
		const areas = b.features.map((f) => f.area).join(", ");

		if (opts.detailLevel === "minimal") {
			lines.push(`- **${b.series}** (${status})`);
		} else {
			lines.push(`### ${b.series} — ${status}`);
			lines.push(`- **Latest:** ${b.latestBuild} (${b.releaseDate})`);
			lines.push(`- **Areas:** ${areas}`);
			if (b.newOperators.length > 0) {
				lines.push(`- **New ops:** ${b.newOperators.join(", ")}`);
			}
			lines.push("");
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { count: builds.length, title: "Experimental Builds" },
		structured: builds.map((b) => ({
			latestBuild: b.latestBuild,
			series: b.series,
			status: b.status,
		})),
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}
