import type { TDLessonEntry } from "../../resources/types.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;

interface LessonSearchOptions extends FormatterOpts {
	query?: string;
}

/**
 * Format a single lesson for the get_lesson tool response.
 */
export function formatLessonDetail(
	entry: TDLessonEntry,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	const p = entry.payload;

	const lines: string[] = [`# ${entry.title}`, "", entry.content.summary, ""];

	lines.push(`- **ID:** ${entry.id}`);
	lines.push(`- **Category:** ${p.category}`);
	if (p.difficulty) {
		lines.push(`- **Difficulty:** ${p.difficulty}`);
	}
	if (p.tags.length > 0) {
		lines.push(`- **Tags:** ${p.tags.join(", ")}`);
	}
	lines.push(
		`- **Confidence:** ${entry.provenance.confidence} (validated ${entry.provenance.validationCount}x)`,
	);
	if (entry.provenance.discoveredIn) {
		lines.push(`- **Discovered in:** ${entry.provenance.discoveredIn}`);
	}

	if (entry.content.warnings && entry.content.warnings.length > 0) {
		lines.push("", "## Warnings");
		for (const w of entry.content.warnings) {
			lines.push(`- ${w}`);
		}
	}

	if (p.operatorChain && p.operatorChain.length > 0) {
		lines.push("", "## Operators Involved");
		for (const op of p.operatorChain) {
			const role = op.role ? ` (${op.role})` : "";
			lines.push(`- ${op.opType} [${op.family}]${role}`);
		}
	}

	if (p.category === "pattern" && p.recipe) {
		lines.push("", "## Recipe", "", p.recipe.description);
		if (p.recipe.steps && p.recipe.steps.length > 0) {
			lines.push("");
			for (let i = 0; i < p.recipe.steps.length; i++) {
				lines.push(`${i + 1}. ${p.recipe.steps[i]}`);
			}
		}
		if (p.recipe.example) {
			lines.push("", `**Example:** ${p.recipe.example.description}`);
			if (p.recipe.example.code) {
				const lang = p.recipe.example.language ?? "python";
				lines.push("", `\`\`\`${lang}`, p.recipe.example.code, "```");
			}
		}
	}

	if (p.category === "pitfall") {
		if (p.symptom) {
			lines.push("", "## Symptom", "", p.symptom);
		}
		if (p.cause) {
			lines.push("", "## Cause", "", p.cause);
		}
		if (p.fix) {
			lines.push("", "## Fix", "", p.fix);
		}
	}

	if (p.relatedPatternIds && p.relatedPatternIds.length > 0) {
		lines.push("", `**Related:** ${p.relatedPatternIds.join(", ")}`);
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: {
			category: p.category,
			id: entry.id,
			payload: p,
			provenance: entry.provenance,
			title: entry.title,
		},
	});
}

/**
 * Format lesson search results for the search_lessons tool response.
 */
export function formatLessonSearchResults(
	results: TDLessonEntry[],
	options?: LessonSearchOptions,
): string {
	const opts = mergeFormatterOptions(options);

	if (results.length === 0) {
		const hint = options?.query
			? `No lessons found for "${options.query}".`
			: "No lessons found.";
		return finalizeFormattedText(hint, opts);
	}

	const lines: string[] = [`Found ${results.length} lesson(s):`, ""];

	for (const entry of results) {
		const p = entry.payload;
		const badge = p.category === "pitfall" ? "[PITFALL]" : "[PATTERN]";
		const conf = `(${entry.provenance.confidence})`;
		lines.push(`- **${entry.title}** ${badge} ${conf}`);
		lines.push(`  ID: ${entry.id}`);
		if (opts.detailLevel !== "minimal") {
			lines.push(`  ${entry.content.summary.slice(0, 120)}...`);
			if (p.tags.length > 0) {
				lines.push(`  Tags: ${p.tags.join(", ")}`);
			}
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: results.map((e) => ({
			category: e.payload.category,
			confidence: e.provenance.confidence,
			id: e.id,
			tags: e.payload.tags,
			title: e.title,
		})),
	});
}
