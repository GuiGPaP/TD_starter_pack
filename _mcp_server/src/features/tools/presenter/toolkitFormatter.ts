import type { TDToolkitEntry } from "../../resources/types.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;

interface ToolkitSearchOptions extends FormatterOpts {
	query?: string;
}

export interface DetectedToolkit {
	detected: boolean;
	path: string;
	toolkitId: string;
	toolkitName: string;
}

/**
 * Format a single toolkit for the get_toolkit tool response.
 */
export function formatToolkitDetail(
	entry: TDToolkitEntry,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	const p = entry.payload;

	const lines: string[] = [`# ${entry.title}`, "", entry.content.summary, ""];

	lines.push(`- **ID:** ${entry.id}`);
	lines.push(`- **Name:** ${p.name}`);
	lines.push(`- **Vendor:** ${p.vendor}`);
	if (p.version) {
		lines.push(`- **Version:** ${p.version}`);
	}
	if (p.url) {
		lines.push(`- **URL:** ${p.url}`);
	}
	lines.push(`- **Op Family Prefix:** ${p.opFamilyPrefix}`);
	lines.push(
		`- **Confidence:** ${entry.provenance.confidence} | **License:** ${entry.provenance.license}`,
	);

	if (p.installHint) {
		lines.push("", "## Installation", "", p.installHint);
	}

	if (p.dependencies && p.dependencies.length > 0) {
		lines.push("", "## Dependencies");
		for (const d of p.dependencies) {
			lines.push(`- ${d}`);
		}
	}

	if (entry.content.warnings && entry.content.warnings.length > 0) {
		lines.push("", "## Warnings");
		for (const w of entry.content.warnings) {
			lines.push(`- ${w}`);
		}
	}

	if (p.detectionPaths && p.detectionPaths.length > 0) {
		lines.push("", `**Detection paths:** ${p.detectionPaths.join(", ")}`);
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: {
			id: entry.id,
			payload: p,
			provenance: entry.provenance,
			title: entry.title,
		},
	});
}

/**
 * Format toolkit search results for the search_toolkits tool response.
 */
export function formatToolkitSearchResults(
	results: TDToolkitEntry[],
	options?: ToolkitSearchOptions,
): string {
	const opts = mergeFormatterOptions(options);

	if (results.length === 0) {
		const hint = options?.query
			? `No toolkits found for "${options.query}".`
			: "No toolkits found.";
		return finalizeFormattedText(hint, opts);
	}

	const lines: string[] = [`Found ${results.length} toolkit(s):`, ""];

	for (const entry of results) {
		const p = entry.payload;
		const ver = p.version ? ` v${p.version}` : "";
		lines.push(`- **${p.name}${ver}** — ${entry.title}`);
		lines.push(`  ID: ${entry.id} | Vendor: ${p.vendor}`);
		if (opts.detailLevel !== "minimal") {
			lines.push(`  ${entry.content.summary.slice(0, 120)}...`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: results.map((e) => ({
			id: e.id,
			name: e.payload.name,
			opFamilyPrefix: e.payload.opFamilyPrefix,
			title: e.title,
			vendor: e.payload.vendor,
			version: e.payload.version,
		})),
	});
}

/**
 * Format detect_toolkits results.
 */
export function formatDetectResult(detected: DetectedToolkit[]): string {
	if (detected.length === 0) {
		return "No toolkits detected in the current project.";
	}

	const lines: string[] = [
		"## Toolkit Detection Results",
		"",
		`Checked ${detected.length} toolkit(s):`,
		"",
	];

	for (const d of detected) {
		const status = d.detected ? "INSTALLED" : "NOT FOUND";
		lines.push(`- **${d.toolkitName}** [${status}] — ${d.path}`);
	}

	return lines.join("\n");
}
