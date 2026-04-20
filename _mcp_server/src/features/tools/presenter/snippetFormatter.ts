import type {
	Snippet,
	SnippetExample,
	SnippetIndexEntry,
} from "../../snippets/types.js";
import type { DetailLevel, FormatterOptions } from "./responseFormatter.js";
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
 * Format snippet search results.
 */
export function formatSnippetSearchResults(
	results: Array<{ entry: SnippetIndexEntry; id: string; score: number }>,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);

	if (results.length === 0) {
		const hint = options?.query ? ` matching "${options.query}"` : "";
		return finalizeFormattedText(
			`No snippets found${hint}. Run the extraction script first if snippets_data/ is empty.`,
			opts,
		);
	}

	const lines: string[] = [
		`Local Operator Snippets (${results.length} results):`,
		"",
	];

	for (const { entry, id } of results) {
		if (opts.detailLevel === "minimal") {
			lines.push(`${id} [${entry.family}] ${entry.exampleCount} examples`);
		} else {
			lines.push(
				`**${entry.opType}** [${entry.family}] — ${entry.exampleCount} examples, ${entry.totalOps} ops`,
			);
			lines.push(`  ID: ${id}`);
			if (opts.detailLevel === "detailed" && entry.readMePreview) {
				lines.push(`  ${entry.readMePreview.slice(0, 200)}`);
			}
			if (entry.hasExports) lines.push("  Has CHOP exports");
			if (entry.hasDatCode) lines.push("  Has embedded code (DATs)");
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: results.map((r) => ({
			exampleCount: r.entry.exampleCount,
			family: r.entry.family,
			id: r.id,
			opType: r.entry.opType,
			readMePreview: r.entry.readMePreview?.slice(0, 200),
			totalOps: r.entry.totalOps,
		})),
	});
}

/** Push operator lines for an example. */
function pushOperators(
	lines: string[],
	example: SnippetExample,
	detailLevel: DetailLevel,
): void {
	if (example.operators.length === 0) return;
	lines.push("", "### Operators");
	for (const op of example.operators) {
		const params = Object.entries(op.nonDefaultParams);
		if (params.length > 0 && detailLevel === "detailed") {
			lines.push(`- **${op.name}** (${op.opType} [${op.family}])`);
			for (const [k, v] of params) {
				lines.push(`  - ${k}: ${v}`);
			}
		} else {
			lines.push(`- ${op.name} (${op.opType} [${op.family}])`);
		}
	}
}

/** Push connection, DAT, and export lines for an example. */
function pushExampleDetails(
	lines: string[],
	example: SnippetExample,
	detailLevel: DetailLevel,
): void {
	if (example.connections.length > 0 && detailLevel === "detailed") {
		lines.push("", "### Connections");
		for (const c of example.connections) {
			lines.push(`- ${c.from}[${c.fromOutput}] → ${c.to}[${c.toInput}]`);
		}
	}
	if (example.datContents.length > 0) {
		lines.push("", "### Embedded Code");
		for (const dat of example.datContents) {
			lines.push("", `#### ${dat.name} (${dat.type})`);
			lines.push(`\`\`\`${dat.language}`, dat.text, "```");
		}
	}
	if (example.exports.length > 0) {
		lines.push("", "### CHOP Exports");
		for (const ex of example.exports) {
			lines.push(`\`\`\`\n${ex.text}\n\`\`\``);
		}
	}
}

/**
 * Format full snippet detail.
 */
export function formatSnippetDetail(
	snippet: Snippet,
	options?: Pick<FormatterOptions, "detailLevel" | "responseFormat">,
): string {
	const opts = mergeFormatterOptions(options);
	const m = snippet.extractionMeta;
	const detailLevel = opts.detailLevel ?? "detailed";

	const lines: string[] = [
		`# ${snippet.opType}`,
		"",
		`- **ID:** ${snippet.id}`,
		`- **Family:** ${snippet.family}`,
		`- **File:** ${snippet.filename}`,
		`- **Examples:** ${m.exampleCount}`,
		`- **Total ops:** ${m.totalOpCount}`,
		`- **Total connections:** ${m.totalConnectionCount}`,
		`- **TD Build:** ${m.tdBuild}`,
	];

	for (const example of snippet.examples) {
		lines.push("", `## ${example.name}`);
		if (example.readMe) lines.push("", example.readMe);
		if (detailLevel !== "minimal") {
			pushOperators(lines, example, detailLevel);
			pushExampleDetails(lines, example, detailLevel);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: {
			exampleCount: m.exampleCount,
			examples: snippet.examples.map((e) => ({
				connectionCount: e.connections.length,
				name: e.name,
				operatorCount: e.operators.length,
				operators: e.operators.map((o) => ({
					family: o.family,
					name: o.name,
					opType: o.opType,
				})),
				readMe: e.readMe?.slice(0, 300),
			})),
			family: snippet.family,
			id: snippet.id,
			opType: snippet.opType,
		},
	});
}
