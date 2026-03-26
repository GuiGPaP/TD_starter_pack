import type { ScanResult } from "../../catalog/loader.js";
import type { ProjectEntry } from "../../catalog/types.js";
import {
	type FormatterOptions,
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

export function formatPackageResult(
	result: {
		jsonPath: string;
		mdPath: string;
		name: string;
		operatorCount: number;
		pngPath: string | null;
		warnings: string[];
	},
	options?: FormatterOptions,
): string {
	const opts = mergeFormatterOptions(options);

	const lines = [
		`Project packaged: ${result.name}`,
		"",
		"Files generated:",
		`  ${result.jsonPath}`,
		`  ${result.mdPath}`,
	];

	if (result.pngPath) {
		lines.push(`  ${result.pngPath}`);
	}

	lines.push("", `Operators: ${result.operatorCount}`);

	if (result.warnings.length > 0) {
		lines.push("");
		for (const w of result.warnings) {
			lines.push(`  ! ${w}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: result,
	});
}

export function formatScanResult(
	rootDir: string,
	result: ScanResult,
	options?: FormatterOptions,
): string {
	const opts = mergeFormatterOptions(options);
	const total = result.indexed.length + result.notIndexed.length;

	const lines = [`TouchDesigner projects in ${rootDir} (${total} found):`, ""];

	if (result.indexed.length > 0) {
		lines.push(`Indexed (${result.indexed.length}):`);
		for (const e of result.indexed) {
			const tags =
				e.manifest.tags.length > 0 ? ` — ${e.manifest.tags.join(", ")}` : "";
			lines.push(`  + ${e.manifest.name}${tags}`);
			if (opts.detailLevel !== "minimal") {
				lines.push(`    ${e.toePath}`);
			}
		}
	}

	if (result.notIndexed.length > 0) {
		lines.push("", `Not indexed (${result.notIndexed.length}):`);
		for (const p of result.notIndexed) {
			lines.push(`  - ${p}`);
		}
		lines.push(
			"",
			"Open each .toe in TouchDesigner and run package_project to generate manifests.",
		);
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: {
			indexedCount: result.indexed.length,
			notIndexedCount: result.notIndexed.length,
			rootDir,
			total,
		},
	});
}

export function formatSearchResults(
	query: string,
	results: ProjectEntry[],
	options?: FormatterOptions,
): string {
	const opts = mergeFormatterOptions(options);

	if (results.length === 0) {
		return finalizeFormattedText(
			`No projects found matching "${query}".`,
			opts,
		);
	}

	const lines = [
		`Projects matching "${query}" (${results.length} results):`,
		"",
	];

	for (const e of results) {
		const tags =
			e.manifest.tags.length > 0 ? ` — ${e.manifest.tags.join(", ")}` : "";
		lines.push(`${e.manifest.name}${tags}`);
		lines.push(`  ${e.toePath}`);
		if (opts.detailLevel !== "minimal" && e.manifest.operators) {
			const ops = Object.entries(e.manifest.operators)
				.map(([k, v]) => `${v} ${k}`)
				.join(", ");
			lines.push(`  ${ops}`);
		}
		if (opts.detailLevel === "detailed" && e.manifest.description) {
			lines.push(`  ${e.manifest.description}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: results.map((e) => ({
			name: e.manifest.name,
			tags: e.manifest.tags,
			toePath: e.toePath,
		})),
	});
}
