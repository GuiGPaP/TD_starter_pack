import type { GetCapabilities200Data as GetCapabilities200ResponseData } from "../../../gen/endpoints/TouchDesignerAPI.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type ModeInfo = { mode: string; tdBuild: string | null };
type FormatterOpts = Pick<
	FormatterOptions,
	"detailLevel" | "responseFormat"
> & {
	modeInfo?: ModeInfo;
};

export function formatCapabilities(
	data: GetCapabilities200ResponseData | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	const modeInfo = options?.modeInfo;

	// Mode header lines
	const modeLines: string[] = [];
	if (modeInfo) {
		modeLines.push(`Mode: ${modeInfo.mode}`);
		modeLines.push(`Online: ${modeInfo.mode !== "docs-only"}`);
		if (modeInfo.tdBuild) modeLines.push(`TD Build: ${modeInfo.tdBuild}`);
	}
	const modeHeader = modeLines.length ? `${modeLines.join("\n")}\n` : "";

	if (!data) {
		const text = `${modeHeader}TD capabilities not available.`;
		return finalizeFormattedText(text, opts, {
			context: { title: "Capabilities" },
			structured: modeInfo
				? { ...modeInfo, online: modeInfo.mode !== "docs-only" }
				: undefined,
		});
	}

	const lintDat = data.lint_dat ?? false;
	const formatDat = data.format_dat ?? false;
	const typecheckDat = data.typecheck_dat ?? false;
	const ruff = data.tools?.ruff;
	const pyright = data.tools?.pyright;

	if (opts.detailLevel === "minimal") {
		const parts: string[] = [];
		if (modeInfo) parts.push(`mode=${modeInfo.mode}`);
		parts.push(`lint_dat=${lintDat}`);
		if (ruff?.installed && ruff.version) {
			parts.push(`ruff=${ruff.version}`);
		}
		if (pyright?.installed && pyright.version) {
			parts.push(`pyright=${pyright.version}`);
		}
		return finalizeFormattedText(parts.join(", "), opts, {
			context: { title: "Capabilities" },
		});
	}

	const lines: string[] = [];
	if (modeHeader) lines.push(modeHeader);
	lines.push("Features:");
	lines.push(`  lint_dat: ${lintDat}`);
	lines.push(`  format_dat: ${formatDat}`);
	lines.push(`  typecheck_dat: ${typecheckDat}`);
	lines.push("Tools:");
	lines.push(
		`  ruff: ${ruff?.installed ? `installed (${ruff.version ?? "unknown version"})` : "not installed"}`,
	);
	lines.push(
		`  pyright: ${pyright?.installed ? `installed (${pyright.version ?? "unknown version"})` : "not installed"}`,
	);

	return finalizeFormattedText(lines.join("\n"), opts, {
		context: { title: "Capabilities" },
		structured: { ...(modeInfo ?? {}), ...data },
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}
