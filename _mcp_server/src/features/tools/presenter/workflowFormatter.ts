import type { TDWorkflowPatternEntry } from "../../resources/types.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;

/**
 * Format a single workflow pattern for the get_workflow_pattern tool.
 */
export function formatWorkflowDetail(
	entry: TDWorkflowPatternEntry,
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
	if (p.tags && p.tags.length > 0) {
		lines.push(`- **Tags:** ${p.tags.join(", ")}`);
	}

	lines.push("", "## Operators");
	for (const op of p.operators) {
		const role = op.role ? ` (${op.role})` : "";
		lines.push(`- ${op.opType} [${op.family}]${role}`);
	}

	if (p.connections.length > 0) {
		lines.push("", "## Connections");
		for (const c of p.connections) {
			lines.push(
				`- ${c.from} [out:${c.fromOutput}] → ${c.to} [in:${c.toInput}]`,
			);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { category: p.category, title: "Workflow Pattern" },
		structured: entry,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

/**
 * Format workflow search results for the search_workflow_patterns tool.
 */
export function formatWorkflowSearchResults(
	entries: TDWorkflowPatternEntry[],
	options?: FormatterOpts & { query?: string },
): string {
	const opts = mergeFormatterOptions(options);

	if (entries.length === 0) {
		return finalizeFormattedText(
			"No workflow patterns found matching your query.",
			opts,
			{ context: { title: "Workflow Search" } },
		);
	}

	const lines: string[] = [
		`## ${entries.length} Workflow Pattern(s) Found`,
		"",
	];

	for (const e of entries) {
		const p = e.payload;
		const tags = p.tags?.join(", ") ?? "";
		const diff = p.difficulty ? ` [${p.difficulty}]` : "";
		const opTypes = p.operators.map((o) => o.opType).join(" → ");

		if (opts.detailLevel === "minimal") {
			lines.push(`- **${e.title}** (${e.id})${diff}`);
		} else {
			lines.push(`### ${e.title}`);
			lines.push(`- **ID:** ${e.id}`);
			lines.push(`- **Category:** ${p.category}${diff}`);
			lines.push(`- **Chain:** ${opTypes}`);
			if (tags) lines.push(`- **Tags:** ${tags}`);
			lines.push(`- ${e.content.summary}`);
			lines.push("");
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { count: entries.length, title: "Workflow Search" },
		structured: entries.map((e) => ({
			category: e.payload.category,
			id: e.id,
			title: e.title,
		})),
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

interface TransitionSuggestion {
	direction: "downstream" | "upstream";
	family: string;
	opType: string;
	port: number;
	reason: string;
}

/**
 * Format suggest_workflow results (transitions + related patterns).
 */
export function formatSuggestWorkflow(
	opType: string,
	transitions: {
		downstream: TransitionSuggestion[];
		upstream: TransitionSuggestion[];
	},
	relatedPatterns: TDWorkflowPatternEntry[],
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);

	const lines: string[] = [`## Workflow Suggestions for \`${opType}\``, ""];

	if (transitions.downstream.length > 0) {
		lines.push("### Downstream (connect output to)");
		for (const t of transitions.downstream) {
			lines.push(
				`- **${t.opType}** [${t.family}] port:${t.port} — ${t.reason}`,
			);
		}
		lines.push("");
	}

	if (transitions.upstream.length > 0) {
		lines.push("### Upstream (connect input from)");
		for (const t of transitions.upstream) {
			lines.push(
				`- **${t.opType}** [${t.family}] port:${t.port} — ${t.reason}`,
			);
		}
		lines.push("");
	}

	if (
		transitions.downstream.length === 0 &&
		transitions.upstream.length === 0
	) {
		lines.push("No known transitions for this operator.", "");
	}

	if (relatedPatterns.length > 0) {
		lines.push("### Related Workflow Patterns");
		for (const p of relatedPatterns) {
			lines.push(`- **${p.title}** (${p.id}) — ${p.content.summary}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { opType, title: "Suggest Workflow" },
		structured: {
			opType,
			relatedPatterns: relatedPatterns.map((p) => p.id),
			transitions,
		},
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}
