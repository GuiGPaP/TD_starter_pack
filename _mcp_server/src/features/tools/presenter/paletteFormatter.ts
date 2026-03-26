import type { PaletteEntry, PaletteIndex } from "../../palette/types.js";
import {
	type FormatterOptions,
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

export function formatIndexResult(
	index: PaletteIndex,
	options?: FormatterOptions,
): string {
	const opts = mergeFormatterOptions(options);

	const categories = new Map<string, number>();
	for (const e of index.entries) {
		categories.set(e.category, (categories.get(e.category) ?? 0) + 1);
	}

	const builtinCount = index.entries.filter((e) => e.source !== "user").length;
	const userCount = index.entries.filter((e) => e.source === "user").length;
	const sourceSummary =
		userCount > 0
			? ` (${builtinCount} builtin, ${userCount} user)`
			: "";

	const lines = [
		`Palette indexed: ${index.entryCount} components from ${categories.size} categories${sourceSummary}`,
		`TD version: ${index.tdVersion}`,
		`Indexed at: ${index.indexedAt}`,
	];

	if (opts.detailLevel !== "minimal") {
		lines.push("");
		for (const [cat, count] of [...categories.entries()].sort()) {
			lines.push(`  ${cat}: ${count}`);
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: {
			categories: Object.fromEntries(categories),
			entryCount: index.entryCount,
			paletteRoot: index.paletteRoot,
			tdVersion: index.tdVersion,
		},
	});
}

export function formatPaletteSearchResults(
	query: string,
	results: PaletteEntry[],
	options?: FormatterOptions,
): string {
	const opts = mergeFormatterOptions(options);

	if (results.length === 0) {
		return finalizeFormattedText(
			`No palette components found matching "${query}".`,
			opts,
		);
	}

	const lines = [
		`Palette components matching "${query}" (${results.length} results):`,
		"",
	];

	for (const e of results) {
		const tags = e.tags.length > 0 ? ` [${e.tags.join(", ")}]` : "";
		lines.push(`${e.name} (${e.category})${tags}`);
		if (opts.detailLevel !== "minimal" && e.description) {
			lines.push(`  ${e.description}`);
		}
		if (opts.detailLevel === "detailed") {
			lines.push(`  ${e.toxPath}`);
			if (e.operators) {
				const ops = Object.entries(e.operators)
					.map(([k, v]) => `${v} ${k}`)
					.join(", ");
				lines.push(`  operators: ${ops}`);
			}
		}
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: results.map((e) => ({
			category: e.category,
			name: e.name,
			tags: e.tags,
			toxPath: e.toxPath,
		})),
	});
}

export function formatLoadResult(
	result: { message?: string; name?: string; path?: string; status: string },
	options?: FormatterOptions,
): string {
	const opts = mergeFormatterOptions(options);

	const lines: string[] = [];
	if (result.status === "loaded") {
		lines.push(`Loaded palette component: ${result.name ?? "unknown"}`);
		if (result.path) lines.push(`  Path: ${result.path}`);
	} else if (result.status === "exists") {
		lines.push(`Component already exists at ${result.path ?? "unknown"}`);
	} else {
		lines.push(`Error: ${result.message ?? "unknown error"}`);
	}

	return finalizeFormattedText(lines.join("\n"), opts, {
		structured: result,
	});
}
