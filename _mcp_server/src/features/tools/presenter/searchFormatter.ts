import type { TDKnowledgeEntry } from "../../resources/types.js";
import type { CompatibilityInfo } from "../../resources/versionManifest.js";
import {
	type FormatterOptions,
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

export interface ScoredResult {
	compatibility: CompatibilityInfo;
	entry: TDKnowledgeEntry;
	score: number;
}

export interface OperatorSearchOptions extends FormatterOptions {
	includeExamples?: boolean;
}

// ── Search result helpers ──────────────────────────────────────

function pushSearchHit(
	lines: string[],
	result: ScoredResult,
	opts: ReturnType<typeof mergeFormatterOptions>,
	showExamples: boolean,
): void {
	const { compatibility, entry, score } = result;
	const family =
		entry.kind === "operator" ? ` [${entry.payload.opFamily}]` : "";
	const compatTag =
		compatibility.level === "deprecated"
			? " (DEPRECATED)"
			: compatibility.level === "unavailable"
				? " (UNAVAILABLE)"
				: "";

	lines.push(`${entry.title}${family} — score ${score}${compatTag}`);

	if (opts.detailLevel === "minimal") return;

	lines.push(`  ID: ${entry.id}`);
	if (opts.detailLevel === "detailed") {
		lines.push(`  ${entry.content.summary}`);
		if (compatibility.reason) {
			lines.push(`  ⚠ ${compatibility.reason}`);
		}
		if (compatibility.suggestedReplacement) {
			lines.push(`  → Suggested: ${compatibility.suggestedReplacement}`);
		}
	}
	pushExamples(lines, entry, showExamples);
}

function pushExamples(
	lines: string[],
	entry: TDKnowledgeEntry,
	showExamples: boolean,
): void {
	if (
		!showExamples ||
		entry.kind !== "operator" ||
		!entry.payload.examples?.length
	)
		return;
	lines.push("  Examples:");
	for (const ex of entry.payload.examples) {
		lines.push(`    - ${ex.label} (${ex.language})`);
		if (ex.description) lines.push(`      ${ex.description}`);
		lines.push(`      \`\`\`${ex.language}`);
		for (const codeLine of ex.code.split("\n")) {
			lines.push(`      ${codeLine}`);
		}
		lines.push("      ```");
	}
}

function buildSearchStructured(
	results: ScoredResult[],
	showExamples: boolean,
): unknown[] {
	return results.map((r) => ({
		compatibility: r.compatibility,
		id: r.entry.id,
		score: r.score,
		title: r.entry.title,
		...(r.entry.kind === "operator"
			? {
					opFamily: r.entry.payload.opFamily,
					opType: r.entry.payload.opType,
					...(showExamples && r.entry.payload.examples?.length
						? { examples: r.entry.payload.examples }
						: {}),
				}
			: {}),
	}));
}

// ── Exported formatters ────────────────────────────────────────

export function formatOperatorSearchResults(
	query: string,
	results: ScoredResult[],
	options?: OperatorSearchOptions,
): string {
	const opts = mergeFormatterOptions(options);
	const showExamples = options?.includeExamples ?? false;

	if (results.length === 0) {
		return finalizeFormattedText(
			`No operators found matching "${query}".`,
			opts,
		);
	}

	const lines: string[] = [
		`Operators matching "${query}" (${results.length} results):`,
		"",
	];

	for (const result of results) {
		pushSearchHit(lines, result, opts, showExamples);
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { query, resultCount: results.length },
		structured: buildSearchStructured(results, showExamples),
	});
}

export function formatOperatorComparison(
	op1: TDKnowledgeEntry & { kind: "operator" },
	op2: TDKnowledgeEntry & { kind: "operator" },
	compat: { compat1: CompatibilityInfo; compat2: CompatibilityInfo },
	options?: FormatterOptions,
): string {
	const opts = mergeFormatterOptions(options);

	const params1 = new Set(op1.payload.parameters.map((p) => p.name));
	const params2 = new Set(op2.payload.parameters.map((p) => p.name));

	const common = [...params1].filter((p) => params2.has(p));
	const uniqueTo1 = [...params1].filter((p) => !params2.has(p));
	const uniqueTo2 = [...params2].filter((p) => !params1.has(p));

	const lines: string[] = [
		`Comparison: ${op1.title} vs ${op2.title}`,
		"",
		`${op1.title} [${op1.payload.opFamily}] — ${op1.payload.parameters.length} params`,
		`${op2.title} [${op2.payload.opFamily}] — ${op2.payload.parameters.length} params`,
	];

	if (compat.compat1.level !== "compatible") {
		lines.push(`  ⚠ ${op1.title}: ${compat.compat1.reason}`);
	}
	if (compat.compat2.level !== "compatible") {
		lines.push(`  ⚠ ${op2.title}: ${compat.compat2.reason}`);
	}

	if (opts.detailLevel !== "minimal") {
		lines.push("");
		lines.push(
			`Common parameters (${common.length}): ${common.join(", ") || "none"}`,
		);
		lines.push(
			`Unique to ${op1.title} (${uniqueTo1.length}): ${uniqueTo1.join(", ") || "none"}`,
		);
		lines.push(
			`Unique to ${op2.title} (${uniqueTo2.length}): ${uniqueTo2.join(", ") || "none"}`,
		);
	}

	if (opts.detailLevel === "detailed") {
		lines.push("");
		lines.push(`${op1.title}: ${op1.content.summary}`);
		lines.push(`${op2.title}: ${op2.content.summary}`);

		const v1 = op1.payload.versions;
		const v2 = op2.payload.versions;
		if (v1?.addedIn || v2?.addedIn) {
			lines.push("");
			lines.push("Version history:");
			if (v1?.addedIn) lines.push(`  ${op1.title}: added in TD ${v1.addedIn}`);
			if (v2?.addedIn) lines.push(`  ${op2.title}: added in TD ${v2.addedIn}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { op1: op1.id, op2: op2.id },
		structured: {
			commonParams: common,
			op1: {
				compatibility: compat.compat1,
				family: op1.payload.opFamily,
				id: op1.id,
				paramCount: op1.payload.parameters.length,
				title: op1.title,
			},
			op2: {
				compatibility: compat.compat2,
				family: op2.payload.opFamily,
				id: op2.id,
				paramCount: op2.payload.parameters.length,
				title: op2.title,
			},
			uniqueToOp1: uniqueTo1,
			uniqueToOp2: uniqueTo2,
		},
	});
}
