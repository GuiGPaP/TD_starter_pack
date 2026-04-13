import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;

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

export function formatUndoDeployResult(
	data: UndoDeployData,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);

	if (data.error) {
		return finalizeFormattedText(`❌ ${data.error}`, opts, {
			context: { title: "Undo Deploy" },
			structured: data,
		});
	}

	const lines: string[] = [];

	if (data.dryRun) {
		lines.push(`🔍 DRY RUN — ${data.message}`);
		lines.push(`Snapshot: ${data.snapshotId} | Parent: ${data.parentPath}`);
		if (data.opsToDelete.length > 0) {
			lines.push("");
			lines.push("Operators to delete:");
			for (const op of data.opsToDelete) {
				lines.push(`  - ${op}`);
			}
			lines.push("");
			lines.push("Run with `confirm: true` to execute deletion.");
		}
	} else if (data.confirmed) {
		const icon = data.success ? "✓" : "❌";
		lines.push(`${icon} ${data.message}`);
		if (opts.detailLevel !== "minimal" && data.opsToDelete.length > 0) {
			lines.push("");
			for (const op of data.opsToDelete) {
				lines.push(`  ${data.success ? "🗑️" : "?"} ${op}`);
			}
		}
	} else {
		lines.push(data.message ?? "No changes needed.");
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: {
			parentPath: data.parentPath,
			snapshotId: data.snapshotId,
			title: "Undo Deploy",
		},
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}
