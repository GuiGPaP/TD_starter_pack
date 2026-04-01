import type { TDTechniqueEntry } from "../../resources/types.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<
	FormatterOptions,
	"detailLevel" | "responseFormat"
> & {
	query?: string;
};

/**
 * Format technique search results for the search_techniques tool.
 */
export function formatTechniqueSearchResults(
	results: TDTechniqueEntry[],
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);

	if (results.length === 0) {
		const hint = options?.query ? ` matching "${options.query}"` : "";
		return finalizeFormattedText(`No techniques found${hint}.`, opts);
	}

	const lines: string[] = [`Techniques (${results.length} results):`, ""];

	for (const entry of results) {
		const p = entry.payload;

		if (opts.detailLevel === "minimal") {
			lines.push(`${entry.title} [${p.category}] (${p.difficulty})`);
		} else {
			lines.push(`**${entry.title}** [${p.category}] (${p.difficulty})`);
			lines.push(`  ID: ${entry.id}`);
			if (opts.detailLevel === "detailed") {
				lines.push(`  ${entry.content.summary}`);
				if (p.tags.length > 0) {
					lines.push(`  Tags: ${p.tags.join(", ")}`);
				}
				if (p.operatorChain?.length) {
					lines.push(
						`  Operators: ${p.operatorChain.map((o) => o.opType).join(" → ")}`,
					);
				}
			}
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: results.map((r) => ({
			category: r.payload.category,
			difficulty: r.payload.difficulty,
			id: r.id,
			tags: r.payload.tags,
			title: r.title,
		})),
	});
}

/**
 * Format a single technique for the get_technique tool.
 */
export function formatTechniqueDetail(
	entry: TDTechniqueEntry,
	options?: Pick<FormatterOptions, "detailLevel" | "responseFormat">,
): string {
	const opts = mergeFormatterOptions(options);
	const p = entry.payload;

	const lines: string[] = [`# ${entry.title}`, "", entry.content.summary, ""];

	lines.push(`- **ID:** ${entry.id}`);
	lines.push(`- **Category:** ${p.category}`);
	lines.push(`- **Difficulty:** ${p.difficulty}`);
	if (p.tags.length > 0) {
		lines.push(`- **Tags:** ${p.tags.join(", ")}`);
	}

	if (p.operatorChain?.length) {
		lines.push("");
		lines.push("## Operator Chain");
		for (const op of p.operatorChain) {
			const role = op.role ? ` (${op.role})` : "";
			lines.push(`- ${op.opType} [${op.family}]${role}`);
		}
	}

	if (p.codeSnippets?.length) {
		lines.push("");
		lines.push("## Code Snippets");
		for (const snippet of p.codeSnippets) {
			lines.push("");
			lines.push(`### ${snippet.label}`);
			if (snippet.description) {
				lines.push(snippet.description);
			}
			lines.push(`\`\`\`${snippet.language}`);
			lines.push(snippet.code);
			lines.push("```");
		}
	}

	if (p.tips?.length) {
		lines.push("");
		lines.push("## Tips");
		for (const tip of p.tips) {
			lines.push(`- ${tip}`);
		}
	}

	if (entry.content.warnings?.length) {
		lines.push("");
		lines.push("## Warnings");
		for (const w of entry.content.warnings) {
			lines.push(`- ${w}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: {
			category: p.category,
			codeSnippets: p.codeSnippets,
			difficulty: p.difficulty,
			id: entry.id,
			operatorChain: p.operatorChain,
			tags: p.tags,
			tips: p.tips,
			title: entry.title,
		},
	});
}
