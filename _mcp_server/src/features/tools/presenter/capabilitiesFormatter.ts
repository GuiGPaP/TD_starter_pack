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

// ── Helpers ────────────────────────────────────────────────────

function buildModeHeader(modeInfo?: ModeInfo): string {
	if (!modeInfo) return "";
	const lines: string[] = [
		`Mode: ${modeInfo.mode}`,
		`Online: ${modeInfo.mode !== "docs-only"}`,
	];
	if (modeInfo.tdBuild) lines.push(`TD Build: ${modeInfo.tdBuild}`);
	return `${lines.join("\n")}\n`;
}

function formatMinimal(
	modeInfo: ModeInfo | undefined,
	data: NonNullable<GetCapabilities200ResponseData>,
): string {
	const parts: string[] = [];
	if (modeInfo) parts.push(`mode=${modeInfo.mode}`);
	parts.push(`lint_dat=${data.lint_dat ?? false}`);
	const ruff = data.tools?.ruff;
	const pyright = data.tools?.pyright;
	if (ruff?.installed && ruff.version) parts.push(`ruff=${ruff.version}`);
	if (pyright?.installed && pyright.version)
		parts.push(`pyright=${pyright.version}`);
	return parts.join(", ");
}

function formatFull(
	modeHeader: string,
	data: NonNullable<GetCapabilities200ResponseData>,
): string {
	const ruff = data.tools?.ruff;
	const pyright = data.tools?.pyright;
	const lines: string[] = [];
	if (modeHeader) lines.push(modeHeader);
	lines.push("Features:");
	lines.push(`  lint_dat: ${data.lint_dat ?? false}`);
	lines.push(`  format_dat: ${data.format_dat ?? false}`);
	lines.push(`  typecheck_dat: ${data.typecheck_dat ?? false}`);
	lines.push("Tools:");
	lines.push(
		`  ruff: ${ruff?.installed ? `installed (${ruff.version ?? "unknown version"})` : "not installed"}`,
	);
	lines.push(
		`  pyright: ${pyright?.installed ? `installed (${pyright.version ?? "unknown version"})` : "not installed"}`,
	);
	return lines.join("\n");
}

// ── Export ──────────────────────────────────────────────────────

export function formatCapabilities(
	data: GetCapabilities200ResponseData | undefined,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);
	const modeInfo = options?.modeInfo;
	const modeHeader = buildModeHeader(modeInfo);

	if (!data) {
		return finalizeFormattedText(
			`${modeHeader}TD capabilities not available.`,
			opts,
			{
				context: { title: "Capabilities" },
				structured: modeInfo
					? { ...modeInfo, online: modeInfo.mode !== "docs-only" }
					: undefined,
			},
		);
	}

	if (opts.detailLevel === "minimal") {
		return finalizeFormattedText(formatMinimal(modeInfo, data), opts, {
			context: { title: "Capabilities" },
		});
	}

	return finalizeFormattedText(formatFull(modeHeader, data), opts, {
		context: { title: "Capabilities" },
		structured: { ...(modeInfo ?? {}), ...data },
		template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
	});
}
