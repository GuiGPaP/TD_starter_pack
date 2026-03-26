import type { TDTutorialEntry } from "../../resources/types.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat"> & {
	query?: string;
};

/**
 * Format tutorial search results for the search_tutorials tool.
 */
export function formatTutorialSearchResults(
	results: TDTutorialEntry[],
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);

	if (results.length === 0) {
		const hint = options?.query
			? ` matching "${options.query}"`
			: "";
		return finalizeFormattedText(
			`No tutorials found${hint}.`,
			opts,
		);
	}

	const lines: string[] = [
		`Tutorials (${results.length} results):`,
		"",
	];

	for (const entry of results) {
		const p = entry.payload;

		if (opts.detailLevel === "minimal") {
			lines.push(
				`${entry.title} (${p.difficulty}, ${p.estimatedTime})`,
			);
		} else {
			lines.push(
				`**${entry.title}** (${p.difficulty}, ${p.estimatedTime})`,
			);
			lines.push(`  ID: ${entry.id}`);
			if (opts.detailLevel === "detailed") {
				lines.push(`  ${entry.content.summary}`);
				if (p.tags.length > 0) {
					lines.push(`  Tags: ${p.tags.join(", ")}`);
				}
				lines.push(
					`  Sections: ${p.sections.map((s) => s.title).join(" → ")}`,
				);
			}
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: results.map((r) => ({
			difficulty: r.payload.difficulty,
			estimatedTime: r.payload.estimatedTime,
			id: r.id,
			sectionCount: r.payload.sections.length,
			tags: r.payload.tags,
			title: r.title,
		})),
	});
}

/**
 * Format a single tutorial for the get_tutorial tool.
 */
export function formatTutorialDetail(
	entry: TDTutorialEntry,
	options?: Pick<FormatterOptions, "detailLevel" | "responseFormat">,
): string {
	const opts = mergeFormatterOptions(options);
	const p = entry.payload;

	const lines: string[] = [`# ${entry.title}`, "", entry.content.summary, ""];

	lines.push(`- **ID:** ${entry.id}`);
	lines.push(`- **Difficulty:** ${p.difficulty}`);
	lines.push(`- **Estimated time:** ${p.estimatedTime}`);
	if (p.tags.length > 0) {
		lines.push(`- **Tags:** ${p.tags.join(", ")}`);
	}
	if (p.prerequisites.length > 0) {
		lines.push(`- **Prerequisites:** ${p.prerequisites.join(", ")}`);
	}
	if (p.relatedOperators.length > 0) {
		lines.push(
			`- **Related operators:** ${p.relatedOperators.join(", ")}`,
		);
	}

	for (const section of p.sections) {
		lines.push("");
		lines.push(`## ${section.title}`);
		lines.push(section.content);
		if (section.code) {
			lines.push("");
			lines.push("```python");
			lines.push(section.code);
			lines.push("```");
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: {
			difficulty: p.difficulty,
			estimatedTime: p.estimatedTime,
			id: entry.id,
			prerequisites: p.prerequisites,
			relatedOperators: p.relatedOperators,
			sections: p.sections.map((s) => ({
				hasCode: !!s.code,
				title: s.title,
			})),
			tags: p.tags,
			title: entry.title,
		},
	});
}
