import type { ScanResult } from "../../catalog/loader.js";
import type { ProjectEntry } from "../../catalog/types.js";
import {
	type FormatterOptions,
	finalizeFormattedText,
	mergeFormatterOptions,
} from "./responseFormatter.js";

export type BulkPackageProjectStatus =
	| "failed"
	| "packaged"
	| "planned"
	| "skipped";

export interface BulkPackageProjectResult {
	toePath: string;
	status: BulkPackageProjectStatus;
	warnings: string[];
	error?: string;
	jsonPath?: string;
	mdPath?: string;
	name?: string;
	operatorCount?: number;
	pngPath?: string | null;
	reason?: string;
}

export interface BulkPackageResult {
	aborted: boolean;
	dryRun: boolean;
	failureCount: number;
	originalProjectPath: string | null;
	projects: BulkPackageProjectResult[];
	restoredOriginalProject: boolean;
	rootDir: string;
	scanned: {
		indexed: number;
		notIndexed: number;
		total: number;
	};
	skippedCount: number;
	successCount: number;
	targetCount: number;
	warnings: string[];
}

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

function pushProjectSection(
	lines: string[],
	heading: string,
	projects: BulkPackageProjectResult[],
	detailLevel: FormatterOptions["detailLevel"],
): void {
	if (projects.length === 0) return;

	lines.push("", `${heading} (${projects.length}):`);

	for (const project of projects) {
		lines.push(`  - ${project.toePath}`);

		if (project.reason && detailLevel !== "minimal") {
			lines.push(`    reason: ${project.reason}`);
		}

		if (detailLevel === "detailed") {
			if (project.jsonPath) lines.push(`    json: ${project.jsonPath}`);
			if (project.mdPath) lines.push(`    markdown: ${project.mdPath}`);
			if (project.pngPath) lines.push(`    thumbnail: ${project.pngPath}`);
		}

		if (project.operatorCount !== undefined && detailLevel !== "minimal") {
			lines.push(`    operators: ${project.operatorCount}`);
		}

		if (project.error) {
			lines.push(`    error: ${project.error}`);
		}

		if (project.warnings.length > 0 && detailLevel !== "minimal") {
			for (const warning of project.warnings) {
				lines.push(`    ! ${warning}`);
			}
		}
	}
}

export function formatBulkPackageResult(
	result: BulkPackageResult,
	options?: FormatterOptions,
): string {
	const opts = mergeFormatterOptions(options);
	const lines = [
		`Bulk package projects in ${result.rootDir}`,
		"",
		`Scanned: ${result.scanned.total} total | Indexed: ${result.scanned.indexed} | Not indexed: ${result.scanned.notIndexed}`,
		`Targets: ${result.targetCount}`,
	];

	if (result.dryRun) {
		lines.push("Mode: dry run");
	} else {
		lines.push(
			`Packaged: ${result.successCount} | Failed: ${result.failureCount} | Skipped: ${result.skippedCount}`,
		);
		lines.push(
			`Original project restored: ${result.restoredOriginalProject ? "yes" : "no"}`,
		);
	}

	if (result.aborted) {
		lines.push("Batch aborted after repeated load timeouts.");
	}

	if (result.targetCount === 0) {
		lines.push("", "No projects need packaging.");
	}

	if (result.warnings.length > 0) {
		lines.push("", "Warnings:");
		for (const warning of result.warnings) {
			lines.push(`  ! ${warning}`);
		}
	}

	if (opts.detailLevel !== "minimal") {
		const planned = result.projects.filter((project) => project.status === "planned");
		const packaged = result.projects.filter(
			(project) => project.status === "packaged",
		);
		const failed = result.projects.filter((project) => project.status === "failed");
		const skipped = result.projects.filter((project) => project.status === "skipped");

		if (result.dryRun) {
			pushProjectSection(lines, "Would package", planned, opts.detailLevel);
			pushProjectSection(lines, "Skipped", skipped, opts.detailLevel);
		} else {
			pushProjectSection(lines, "Packaged", packaged, opts.detailLevel);
			pushProjectSection(lines, "Failed", failed, opts.detailLevel);
			pushProjectSection(lines, "Skipped", skipped, opts.detailLevel);
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
