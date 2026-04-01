import type {
	DiscoverDatCandidates200Data,
	FormatDat200Data,
	GetDatText200Data,
	LintDat200Data,
	LintDats200Data,
	SetDatText200Data,
	TypecheckDat200Data,
	ValidateGlslDat200Data,
	ValidateJsonDat200Data,
} from "../../../gen/endpoints/TouchDesignerAPI.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;

// ── Lint helpers ───────────────────────────────────────────────

interface Diagnostic {
	line?: number;
	column?: number;
	code?: string;
	message?: string;
	fixable?: boolean;
	severity?: string;
}

function formatDiagnosticLine(d: Diagnostic): string {
	const loc = `L${d.line ?? "?"}:${d.column ?? "?"}`;
	const fixable = d.fixable ? " (fixable)" : "";
	return `  ${loc} ${d.code ?? ""} ${d.message ?? ""}${fixable}`;
}

function pushDiagnostics(lines: string[], diagnostics: Diagnostic[]): void {
	for (const d of diagnostics) {
		lines.push(formatDiagnosticLine(d));
	}
}

function pushLintFixOutcome(lines: string[], data: LintDat200Data): void {
	if (data.applied === false && data.diff) {
		lines.push("[DRY RUN] Fix preview:");
		lines.push(data.diff);
	} else if (data.applied === true || data.fixed) {
		lines.push("Auto-fix applied.");
	}
}

function pushRemainingDiagnostics(
	lines: string[],
	data: LintDat200Data,
	isMinimal: boolean,
): void {
	if (data.remainingDiagnosticCount === undefined) return;

	if (data.remainingDiagnosticCount > 0) {
		lines.push(
			`Remaining after fix: ${data.remainingDiagnosticCount} issue(s)`,
		);
		if (data.remainingDiagnostics && !isMinimal) {
			pushDiagnostics(lines, data.remainingDiagnostics as Diagnostic[]);
		}
	} else if (data.remainingDiagnosticCount === 0 && data.fixed) {
		lines.push("0 remaining issues after fix.");
	}
}

// ── Batch lint helpers ─────────────────────────────────────────

function pushBatchSummary(
	lines: string[],
	parentPath: string,
	summary: NonNullable<LintDats200Data["summary"]>,
): void {
	lines.push(
		`Batch lint: ${parentPath} — ${summary.totalDatsScanned ?? 0} DAT(s) scanned`,
	);
	lines.push(
		`  Issues: ${summary.totalIssues ?? 0} (fixable: ${summary.fixableCount ?? 0}, manual: ${summary.manualCount ?? 0})`,
	);
	lines.push(
		`  DATs with errors: ${summary.datsWithErrors ?? 0}, clean: ${summary.datsClean ?? 0}`,
	);
	if (summary.bySeverity) {
		const sev = summary.bySeverity;
		lines.push(
			`  Severity: errors=${sev.error ?? 0}, warnings=${sev.warning ?? 0}, info=${sev.info ?? 0}`,
		);
	}
}

function pushWorstOffenders(
	lines: string[],
	offenders: NonNullable<
		NonNullable<LintDats200Data["summary"]>["worstOffenders"]
	>,
): void {
	lines.push("  Worst offenders:");
	for (const [i, w] of offenders.entries()) {
		lines.push(
			`    ${i + 1}. ${w.path ?? w.name ?? "?"} (${w.diagnosticCount ?? 0} issues)`,
		);
	}
}

function pushBatchDetailedResults(
	lines: string[],
	results: NonNullable<LintDats200Data["results"]>,
): void {
	lines.push("");
	for (const r of results) {
		const count = r.diagnosticCount ?? 0;
		if (count === 0 && !r.error) {
			lines.push(`  \u2713 ${r.path ?? r.name ?? "?"}: clean`);
			continue;
		}
		if (r.error) {
			lines.push(`  \u2717 ${r.path ?? r.name ?? "?"}: ${r.error}`);
			continue;
		}
		lines.push(`  ${r.path ?? r.name ?? "?"}: ${count} issue(s)`);
		if (r.diagnostics) {
			pushDiagnostics(lines, r.diagnostics as Diagnostic[]);
		}
	}
}

// ── Exported formatters ────────────────────────────────────────

export function formatDatText(
	data: GetDatText200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("DAT text not available.", opts, {
			context: { title: "DAT Text" },
		});
	}

	const path = data.path ?? "(unknown)";
	const text = data.text ?? "";
	const lineCount = text.split("\n").length;
	const base = `DAT ${path} (${lineCount} lines)`;

	if (opts.detailLevel === "minimal") {
		return finalizeFormattedText(base, opts, {
			context: { title: "DAT Text" },
		});
	}

	const full = `${base}\n---\n${text}`;
	return finalizeFormattedText(full, opts, {
		context: { path, title: "DAT Text" },
		structured: data,
		template: "detailedPayload",
	});
}

export function formatSetDatText(
	data: SetDatText200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("DAT text update returned no data.", opts, {
			context: { title: "Set DAT Text" },
		});
	}

	const path = data.path ?? "(unknown)";
	const length = data.length ?? 0;
	const text = `✓ Updated DAT ${path} (${length} characters written)`;

	return finalizeFormattedText(text, opts, {
		context: { path, title: "Set DAT Text" },
		structured: data,
	});
}

export function formatLintDat(
	data: LintDat200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("Lint returned no data.", opts, {
			context: { title: "DAT Lint" },
		});
	}

	const path = data.path ?? "(unknown)";
	const count = data.diagnosticCount ?? 0;

	if (count === 0) {
		const text = `✓ ${path}: no lint issues`;
		return finalizeFormattedText(text, opts, {
			context: { path, title: "DAT Lint" },
			structured: data,
		});
	}

	const isMinimal = opts.detailLevel === "minimal";
	const lines = [`${path}: ${count} issue(s)`];

	if (data.diagnostics && !isMinimal) {
		pushDiagnostics(lines, data.diagnostics as Diagnostic[]);
	}
	pushLintFixOutcome(lines, data);
	pushRemainingDiagnostics(lines, data, isMinimal);

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { path, title: "DAT Lint" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

export function formatTypecheckDat(
	data: TypecheckDat200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("Typecheck returned no data.", opts, {
			context: { title: "DAT Typecheck" },
		});
	}
	const path = data.path ?? "(unknown)";
	const count = data.diagnosticCount ?? 0;

	if (count === 0) {
		return finalizeFormattedText(`OK ${path}: no type errors`, opts, {
			context: { path, title: "DAT Typecheck" },
			structured: data,
		});
	}

	const lines = [`${path}: ${count} type issue(s)`];
	if (data.diagnostics && opts.detailLevel !== "minimal") {
		for (const d of data.diagnostics) {
			const loc = `L${d.line ?? "?"}:${d.column ?? "?"}`;
			const sev = d.severity ?? "error";
			lines.push(`  ${loc} [${sev}] ${d.message ?? ""}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { path, title: "DAT Typecheck" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

export function formatFormatDat(
	data: FormatDat200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("Format returned no data.", opts, {
			context: { title: "DAT Format" },
		});
	}

	const path = data.path ?? "(unknown)";

	if (!data.changed) {
		const text = `\u2713 ${path}: no formatting changes needed`;
		return finalizeFormattedText(text, opts, {
			context: { path, title: "DAT Format" },
			structured: data,
		});
	}

	const lines: string[] = [];

	if (data.applied) {
		lines.push(`\u2713 Formatted ${path}`);
	} else {
		lines.push(`${path}: formatting changes available`);
	}

	if (!data.applied && data.diff) {
		lines.push("[DRY RUN] Format preview:");
		lines.push(data.diff);
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { path, title: "DAT Format" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

export function formatLintDats(
	data: LintDats200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("Batch lint returned no data.", opts, {
			context: { title: "DAT Batch Lint" },
		});
	}

	const parentPath = data.parentPath ?? "(unknown)";
	const summary = data.summary;

	if (!summary) {
		return finalizeFormattedText(
			`Batch lint completed for ${parentPath} (no summary available)`,
			opts,
			{ context: { title: "DAT Batch Lint" } },
		);
	}

	const lines: string[] = [];
	pushBatchSummary(lines, parentPath, summary);

	if (
		summary.worstOffenders &&
		summary.worstOffenders.length > 0 &&
		opts.detailLevel !== "minimal"
	) {
		pushWorstOffenders(lines, summary.worstOffenders);
	}

	if (data.results && opts.detailLevel === "detailed") {
		pushBatchDetailedResults(lines, data.results);
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { parentPath, title: "DAT Batch Lint" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

export function formatValidateJsonDat(
	data: ValidateJsonDat200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("Validation returned no data.", opts, {
			context: { title: "DAT JSON/YAML Validate" },
		});
	}

	const path = data.path ?? "(unknown)";
	const format = data.format ?? "unknown";

	if (data.valid) {
		const text = `\u2713 ${path}: valid ${format}`;
		return finalizeFormattedText(text, opts, {
			context: { path, title: "DAT JSON/YAML Validate" },
			structured: data,
		});
	}

	const lines: string[] = [`${path}: invalid ${format}`];
	if (data.diagnostics && opts.detailLevel !== "minimal") {
		for (const d of data.diagnostics) {
			const loc = `L${d.line ?? "?"}:${d.column ?? "?"}`;
			lines.push(`  ${loc} ${d.message ?? ""}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { path, title: "DAT JSON/YAML Validate" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

export function formatValidateGlslDat(
	data: ValidateGlslDat200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("GLSL validation returned no data.", opts, {
			context: { title: "DAT GLSL Validate" },
		});
	}

	const path = data.path ?? "(unknown)";
	const shaderType = data.shaderType ?? "unknown";
	const method = data.validationMethod ?? "none";

	if (data.valid) {
		const text = `\u2713 ${path}: valid GLSL (${shaderType}, via ${method})`;
		return finalizeFormattedText(text, opts, {
			context: { path, title: "DAT GLSL Validate" },
			structured: data,
		});
	}

	const lines: string[] = [
		`${path}: invalid GLSL (${shaderType}, via ${method})`,
	];
	if (data.diagnostics && opts.detailLevel !== "minimal") {
		for (const d of data.diagnostics) {
			const loc = `L${d.line ?? "?"}:${d.column ?? "?"}`;
			const sev = d.severity ? `[${d.severity}]` : "";
			lines.push(`  ${loc} ${sev} ${d.message ?? ""}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { path, title: "DAT GLSL Validate" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

export function formatDiscoverDatCandidates(
	data: DiscoverDatCandidates200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("No discovery data returned.", opts, {
			context: { title: "DAT Discover" },
		});
	}

	const parentPath = data.parentPath ?? "(unknown)";
	const count = data.count ?? 0;
	const purpose = data.purpose ?? "any";

	if (count === 0) {
		return finalizeFormattedText(
			`No DAT candidates found under ${parentPath} (purpose=${purpose})`,
			opts,
			{ context: { title: "DAT Discover" } },
		);
	}

	const lines = [`${count} DAT candidate(s) under ${parentPath} [${purpose}]`];
	if (data.candidates && opts.detailLevel !== "minimal") {
		for (const c of data.candidates) {
			const kind = c.kindGuess ?? "?";
			const conf = c.confidence ? ` (${c.confidence})` : "";
			lines.push(`  ${c.path ?? c.name ?? "?"} — ${kind}${conf}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { parentPath, title: "DAT Discover" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}
