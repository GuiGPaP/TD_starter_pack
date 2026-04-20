import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;
type ResolvedFormatterOpts = ReturnType<typeof mergeFormatterOptions>;

export interface UndoDeployData {
	confirmed?: boolean;
	dryRun?: boolean;
	error?: string;
	message?: string;
	opsToDelete: string[];
	parentPath: string;
	snapshotId: string;
	success?: boolean;
}

function formatErrorResult(
	data: UndoDeployData,
	opts: ResolvedFormatterOpts,
): string {
	return finalizeFormattedText(`❌ ${data.error}`, opts, {
		context: { title: "Undo Deploy" },
		structured: data,
	});
}

function appendDryRunLines(lines: string[], data: UndoDeployData): void {
	if (data.dryRun) {
		lines.push(`🔍 DRY RUN — ${data.message}`);
		lines.push(`Snapshot: ${data.snapshotId} | Parent: ${data.parentPath}`);
	}

	if (!data.dryRun || data.opsToDelete.length === 0) return;

	lines.push("");
	lines.push("Operators to delete:");
	for (const op of data.opsToDelete) {
		lines.push(`  - ${op}`);
	}
	lines.push("");
	lines.push("Run with `confirm: true` to execute deletion.");
}

function appendConfirmedLines(
	lines: string[],
	data: UndoDeployData,
	opts: ResolvedFormatterOpts,
): void {
	if (!data.confirmed) return;

	const icon = data.success ? "✓" : "❌";
	lines.push(`${icon} ${data.message}`);

	if (opts.detailLevel === "minimal" || data.opsToDelete.length === 0) return;

	lines.push("");
	for (const op of data.opsToDelete) {
		lines.push(`  ${data.success ? "🗑️" : "?"} ${op}`);
	}
}

function formatUndoBody(
	data: UndoDeployData,
	opts: ResolvedFormatterOpts,
): string {
	const lines: string[] = [];

	if (data.dryRun) appendDryRunLines(lines, data);
	else if (data.confirmed) appendConfirmedLines(lines, data, opts);
	else lines.push(data.message ?? "No changes needed.");

	return lines.join("\n");
}

export function formatUndoDeployResult(
	data: UndoDeployData,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);

	if (data.error) return formatErrorResult(data, opts);

	return finalizeFormattedText(formatUndoBody(data, opts), opts, {
		context: {
			parentPath: data.parentPath,
			snapshotId: data.snapshotId,
			title: "Undo Deploy",
		},
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}
