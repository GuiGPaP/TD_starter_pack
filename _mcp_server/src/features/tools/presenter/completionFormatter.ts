/**
 * Formatters for project index and node context tools.
 */

import type {
	GetTdContext200Data,
	IndexTdProject200Data,
} from "../../../gen/endpoints/TouchDesignerAPI.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;

/**
 * Format the project index response.
 * The data already contains Markdown, so we pass it through with stats.
 */
export function formatProjectIndex(
	data: IndexTdProject200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("Project index not available.", opts, {
			context: { title: "Project Index" },
		});
	}

	const markdown = data.markdown ?? "";
	const stats = data.stats;
	const truncated = data.truncated ?? false;

	if (opts.detailLevel === "minimal") {
		const parts: string[] = [];
		if (stats) {
			parts.push(`ops=${stats.opCount ?? 0}`);
			parts.push(`comps=${stats.compCount ?? 0}`);
			parts.push(`extensions=${stats.extensionCount ?? 0}`);
		}
		if (truncated) parts.push("truncated");
		return finalizeFormattedText(parts.join(", "), opts, {
			context: { title: "Project Index" },
		});
	}

	// summary and detailed: return the Markdown directly
	return finalizeFormattedText(markdown, opts, {
		context: { title: "Project Index" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

/**
 * Format the node context response.
 * Renders each facet under a section header.
 */
export function formatTdContext(
	data: GetTdContext200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("Node context not available.", opts, {
			context: { title: "Node Context" },
		});
	}

	const nodePath = data.nodePath ?? "(unknown)";
	const facets = data.facets ?? {};
	const warnings = data.warnings ?? [];

	if (opts.detailLevel === "minimal") {
		const facetNames = Object.keys(facets);
		return finalizeFormattedText(
			`${nodePath}: ${facetNames.length} facets (${facetNames.join(", ")})`,
			opts,
			{ context: { title: "Node Context" } },
		);
	}

	const lines: string[] = [`# Context for \`${nodePath}\``, ""];

	for (const [facetName, facetData] of Object.entries(facets)) {
		lines.push(`## ${facetName}`);
		if (typeof facetData === "string") {
			lines.push(facetData);
		} else if (facetData !== null && facetData !== undefined) {
			lines.push("```json");
			lines.push(JSON.stringify(facetData, null, 2));
			lines.push("```");
		}
		lines.push("");
	}

	if (warnings.length > 0) {
		lines.push("## Warnings");
		for (const w of warnings) {
			lines.push(`- ${w}`);
		}
		lines.push("");
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { nodePath, title: "Node Context" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}
