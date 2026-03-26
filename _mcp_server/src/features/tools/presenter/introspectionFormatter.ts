import type {
	CompleteOpPaths200Data,
	GetChopChannels200Data,
	GetCompExtensions200Data,
	GetDatTableInfo200Data,
	GetNodeParameterSchema200Data,
} from "../../../gen/endpoints/TouchDesignerAPI.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;

export function formatParameterSchema(
	data: GetNodeParameterSchema200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("No parameter schema data.", opts, {
			context: { title: "Parameter Schema" },
		});
	}

	const path = data.nodePath ?? "(unknown)";
	const count = data.count ?? 0;

	if (count === 0) {
		return finalizeFormattedText(`${path}: no parameters match`, opts, {
			context: { title: "Parameter Schema" },
		});
	}

	const lines = [`${path} (${data.opType ?? "?"}) — ${count} parameter(s)`];
	if (data.parameters && opts.detailLevel !== "minimal") {
		for (const p of data.parameters) {
			const range =
				p.min != null || p.max != null
					? ` [${p.min ?? ""}..${p.max ?? ""}]`
					: "";
			const menu =
				p.menuNames && p.menuNames.length > 0
					? ` menu=[${p.menuNames.join(",")}]`
					: "";
			lines.push(
				`  ${p.name} (${p.style ?? "?"})${range}${menu} = ${JSON.stringify(p.val)}`,
			);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { path, title: "Parameter Schema" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

export function formatCompleteOpPaths(
	data: CompleteOpPaths200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("No path completion data.", opts, {
			context: { title: "Complete Paths" },
		});
	}

	const count = data.count ?? 0;
	if (count === 0) {
		return finalizeFormattedText(
			`No matches for prefix "${data.prefix ?? "*"}"`,
			opts,
			{ context: { title: "Complete Paths" } },
		);
	}

	const lines = [`${count} match(es) for "${data.prefix ?? "*"}"`];
	if (data.matches && opts.detailLevel !== "minimal") {
		for (const m of data.matches) {
			lines.push(
				`  ${m.relativeRef ?? m.path ?? m.name ?? "?"} (${m.opType ?? "?"})`,
			);
		}
	}
	if (data.truncated) {
		lines.push("  (truncated)");
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { title: "Complete Paths" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

export function formatChopChannels(
	data: GetChopChannels200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("No CHOP channel data.", opts, {
			context: { title: "CHOP Channels" },
		});
	}

	const path = data.nodePath ?? "(unknown)";
	const numCh = data.numChannels ?? 0;
	const sr = data.sampleRate ?? 0;
	const lines = [
		`${path} — ${numCh} channel(s), ${data.numSamples ?? 0} samples @ ${sr} Hz`,
	];

	if (data.channels && opts.detailLevel !== "minimal") {
		for (const ch of data.channels) {
			if (ch.minVal != null) {
				lines.push(
					`  ${ch.name}: min=${ch.minVal} max=${ch.maxVal} avg=${ch.avgVal?.toFixed(3)}`,
				);
			} else {
				lines.push(`  ${ch.name}`);
			}
		}
	}
	if (data.truncated) {
		lines.push("  (truncated)");
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { path, title: "CHOP Channels" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

export function formatDatTableInfo(
	data: GetDatTableInfo200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("No table info data.", opts, {
			context: { title: "DAT Table Info" },
		});
	}

	const path = data.nodePath ?? "(unknown)";
	const lines = [
		`${path} — ${data.numRows ?? 0} rows × ${data.numCols ?? 0} cols`,
	];

	if (data.sampleData && opts.detailLevel !== "minimal") {
		for (const row of data.sampleData) {
			lines.push(`  | ${row.join(" | ")} |`);
		}
	}
	const flags: string[] = [];
	if (data.truncatedRows) flags.push("rows truncated");
	if (data.truncatedCols) flags.push("cols truncated");
	if (data.truncatedCells) flags.push("cells truncated");
	if (flags.length > 0) {
		lines.push(`  (${flags.join(", ")})`);
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { path, title: "DAT Table Info" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}

export function formatCompExtensions(
	data: GetCompExtensions200Data | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	if (!data) {
		return finalizeFormattedText("No extension data.", opts, {
			context: { title: "COMP Extensions" },
		});
	}

	const path = data.compPath ?? "(unknown)";
	const exts = data.extensions ?? [];

	if (exts.length === 0) {
		return finalizeFormattedText(`${path}: no extensions`, opts, {
			context: { title: "COMP Extensions" },
		});
	}

	const lines = [`${path} — ${exts.length} extension(s)`];
	if (opts.detailLevel !== "minimal") {
		for (const ext of exts) {
			lines.push(
				`  ${ext.name}: ${ext.methodCount ?? 0} methods, ${ext.propertyCount ?? 0} properties`,
			);
			if (ext.methods && opts.detailLevel === "detailed") {
				for (const m of ext.methods) {
					lines.push(`    ${m.name}${m.signature ?? "()"}`);
				}
			}
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { path, title: "COMP Extensions" },
		structured: data,
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}
