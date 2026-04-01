import type { TDVersionInfo } from "../../resources/versionManifest.js";
import type { FormatterOptions } from "./responseFormatter.js";
import {
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat">;

/**
 * Format a list of TD versions for the list_versions tool.
 */
export function formatVersionList(
	versions: TDVersionInfo[],
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);

	if (versions.length === 0) {
		return finalizeFormattedText("No versions found.", opts);
	}

	const lines: string[] = [`TouchDesigner Versions (${versions.length}):`, ""];

	for (const v of versions) {
		if (opts.detailLevel === "minimal") {
			lines.push(`${v.id} — Python ${v.pythonVersion} [${v.supportStatus}]`);
		} else {
			lines.push(
				`**${v.label ?? v.id}** — Python ${v.pythonVersion} [${v.supportStatus}]`,
			);
			if (opts.detailLevel === "detailed") {
				if (v.highlights?.length) {
					lines.push(`  Highlights: ${v.highlights.join(", ")}`);
				}
				if (v.newOperators?.length) {
					lines.push(`  New operators: ${v.newOperators.join(", ")}`);
				}
				if (v.breakingChanges?.length) {
					lines.push(`  Breaking changes: ${v.breakingChanges.join("; ")}`);
				}
			}
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: versions.map((v) => ({
			breakingChanges: v.breakingChanges,
			highlights: v.highlights,
			id: v.id,
			label: v.label,
			newOperators: v.newOperators,
			pythonVersion: v.pythonVersion,
			supportStatus: v.supportStatus,
		})),
	});
}

/**
 * Format detailed info for a single TD version.
 */
export function formatVersionDetail(
	version: TDVersionInfo,
	options?: FormatterOpts,
): string {
	const opts = mergeFormatterOptions(options);

	const lines: string[] = [
		`# ${version.label ?? version.id}`,
		"",
		`- **ID:** ${version.id}`,
		`- **Python:** ${version.pythonVersion}`,
		`- **Status:** ${version.supportStatus}`,
	];

	if (version.releaseYear) {
		lines.push(`- **Release year:** ${version.releaseYear}`);
	}

	if (version.highlights?.length) {
		lines.push("");
		lines.push("## Highlights");
		for (const h of version.highlights) {
			lines.push(`- ${h}`);
		}
	}

	if (version.newOperators?.length) {
		lines.push("");
		lines.push("## New Operators");
		lines.push(version.newOperators.join(", "));
	}

	if (version.breakingChanges?.length) {
		lines.push("");
		lines.push("## Breaking Changes");
		for (const bc of version.breakingChanges) {
			lines.push(`- ${bc}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: {
			breakingChanges: version.breakingChanges,
			highlights: version.highlights,
			id: version.id,
			label: version.label,
			newOperators: version.newOperators,
			pythonVersion: version.pythonVersion,
			releaseYear: version.releaseYear,
			supportStatus: version.supportStatus,
		},
	});
}
