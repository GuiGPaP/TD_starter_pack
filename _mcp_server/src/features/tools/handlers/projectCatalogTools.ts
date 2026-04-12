import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";
import {
	ProjectCatalogRegistry,
	scanForProjects,
} from "../../catalog/index.js";
import {
	type BulkPackageProjectResult,
	formatPackageResult,
	formatBulkPackageResult,
	formatScanResult,
	formatSearchResults,
} from "../presenter/projectCatalogFormatter.js";
import type { ExecAuditLog } from "../security/index.js";
import { withLiveGuard } from "../toolGuards.js";
import { detailOnlyFormattingSchema } from "../types.js";

// ── Schemas ──────────────────────────────────────────────────

const HEALTH_PROBE_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_LOAD_TIMEOUTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const packageProjectSchema = z.object({
	...detailOnlyFormattingSchema.shape,
	author: z.string().optional().describe("Project author"),
	description: z
		.string()
		.optional()
		.describe("Project description (auto-generated if omitted)"),
	tags: z
		.array(z.string())
		.optional()
		.describe("Tags for discovery (e.g., ['feedback', 'glsl'])"),
});
type PackageProjectParams = z.input<typeof packageProjectSchema>;

const bulkPackageSchema = z.object({
	...detailOnlyFormattingSchema.shape,
	author: z.string().optional().describe("Project author"),
	dryRun: z
		.boolean()
		.optional()
		.describe("Scan and report what would be packaged without loading projects"),
	loadTimeoutSeconds: z
		.number()
		.int()
		.min(5)
		.max(120)
		.optional()
		.describe("Seconds to wait for each project to come back online"),
	maxDepth: z
		.number()
		.int()
		.min(1)
		.max(20)
		.optional()
		.describe("Max directory depth to scan (default: 5)"),
	rootDir: z.string().describe("Root directory to scan for .toe files"),
	skipAlreadyPackaged: z
		.boolean()
		.optional()
		.describe("Skip projects that already have .td-catalog sidecars"),
	tags: z
		.array(z.string())
		.optional()
		.describe("Tags to apply to every packaged project"),
});
type BulkPackageParams = z.input<typeof bulkPackageSchema>;

const scanProjectsSchema = z.object({
	...detailOnlyFormattingSchema.shape,
	maxDepth: z
		.number()
		.int()
		.min(1)
		.max(20)
		.optional()
		.describe("Max directory depth to scan (default: 5)"),
	rootDir: z.string().describe("Root directory to scan for .toe files"),
});
type ScanProjectsParams = z.input<typeof scanProjectsSchema>;

const searchProjectsSchema = z.object({
	...detailOnlyFormattingSchema.shape,
	maxResults: z
		.number()
		.int()
		.min(1)
		.max(50)
		.optional()
		.describe("Max results (default: 20)"),
	query: z.string().describe("Search query"),
	rootDir: z.string().describe("Root directory containing catalogued projects"),
	tags: z.array(z.string()).optional().describe("Filter by tags (AND logic)"),
});
type SearchProjectsParams = z.input<typeof searchProjectsSchema>;

// ── Python script for project introspection ──────────────────

type PackageScriptResult = {
	jsonPath: string;
	mdPath: string;
	name: string;
	operatorCount: number;
	pngPath: string | null;
	warnings: string[];
};

type CurrentProjectInfo = {
	modified: boolean;
	toePath: string | null;
};

function buildPackageScript(opts: {
	author: string;
	description: string;
	tags: string[];
}): string {
	const tagsJson = JSON.stringify(opts.tags);
	return `
import json, os, datetime

proj_file = str(project.name)
proj_name = proj_file[:-4] if proj_file.lower().endswith('.toe') else proj_file
proj_file = proj_file if proj_file.lower().endswith('.toe') else (proj_name + '.toe')
proj_folder = project.folder.replace('\\\\', '/')

# Count operators by family
op_counts = {}
def count_ops(parent, depth=0):
    if depth > 10: return
    for c in parent.children:
        family = c.family
        if family:
            op_counts[family] = op_counts.get(family, 0) + 1
        if hasattr(c, 'children'):
            count_ops(c, depth + 1)

root = op('/project1')
if root:
    count_ops(root)

# List top-level components
components = []
if root:
    for c in root.children:
        components.append(c.name)

# Find a TOP for screenshot (best-effort)
thumbnail_path = None
thumbnail_name = None
if root:
    for c in root.children:
        if hasattr(c, 'saveByteArray') and c.family == 'TOP':
            try:
                png_name = proj_name + '.td-catalog.png'
                png_path = proj_folder + '/' + png_name
                c.save(png_path)
                thumbnail_path = png_path
                thumbnail_name = png_name
                break
            except:
                pass
    if not thumbnail_path:
        # Try deeper
        for c in root.findChildren(depth=3):
            if hasattr(c, 'width') and c.family == 'TOP' and c.width > 0:
                try:
                    png_name = proj_name + '.td-catalog.png'
                    png_path = proj_folder + '/' + png_name
                    c.save(png_path)
                    thumbnail_path = png_path
                    thumbnail_name = png_name
                    break
                except:
                    pass

# Build manifest
manifest = {
    "schemaVersion": "1.0",
    "name": proj_name,
    "file": proj_file,
    "tdVersion": str(td.app.version),
    "created": datetime.datetime.now().isoformat()[:10],
    "modified": datetime.datetime.now().isoformat()[:10],
    "author": ${JSON.stringify(opts.author)} or "",
    "tags": ${tagsJson},
    "description": ${JSON.stringify(opts.description)} or f"TouchDesigner project: {proj_name}",
    "operators": op_counts,
    "components": components,
    "thumbnail": thumbnail_name,
}

# Write manifest JSON
json_name = proj_name + '.td-catalog.json'
json_path = proj_folder + '/' + json_name
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, indent='\\t', ensure_ascii=False)

# Write markdown
md_name = proj_name + '.td-catalog.md'
md_path = proj_folder + '/' + md_name
total_ops = sum(op_counts.values())
ops_line = ', '.join(f"{v} {k}" for k, v in sorted(op_counts.items()))
tags_line = ', '.join(manifest['tags']) if manifest['tags'] else 'none'

md = f"""# {proj_name}

{manifest['description']}

## Operators ({total_ops} total)

{ops_line}

## Components

{chr(10).join('- ' + c for c in components)}

## Tags

{tags_line}

## Info

- TD Version: {manifest['tdVersion']}
- Created: {manifest['created']}
"""

with open(md_path, 'w', encoding='utf-8') as f:
    f.write(md)

warnings = []
if not thumbnail_path:
    warnings.append("No suitable TOP found for thumbnail")

result = {
    "name": proj_name,
    "jsonPath": json_path,
    "mdPath": md_path,
    "pngPath": thumbnail_path,
    "operatorCount": total_ops,
    "warnings": warnings,
}
`.trim();
}

function buildCurrentProjectInfoScript(): string {
	return `
folder = project.folder.replace('\\\\', '/') if getattr(project, 'folder', None) else ''
name = str(project.name) if getattr(project, 'name', None) else ''
file_name = name if name.lower().endswith('.toe') else (name + '.toe' if name else '')
toe_path = f"{folder}/{file_name}" if folder and file_name else None
result = {
    "modified": bool(getattr(project, 'modified', False)),
    "toePath": toe_path,
}
`.trim();
}

function buildProjectLoadScript(toePath: string): string {
	return `project.load(${JSON.stringify(normalizeTdPath(toePath))})`;
}

function normalizeTdPath(filePath: string): string {
	return filePath.replace(/\\/g, "/");
}

function sameTdPath(left: string, right: string): boolean {
	return normalizeTdPath(left).toLowerCase() === normalizeTdPath(right).toLowerCase();
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function normalizePackageResult(result: PackageScriptResult | string): PackageScriptResult {
	return typeof result === "string"
		? (JSON.parse(result) as PackageScriptResult)
		: result;
}

async function waitForTdOnline(
	tdClient: TouchDesignerClient,
	timeoutSeconds: number,
): Promise<boolean> {
	const deadline = Date.now() + timeoutSeconds * 1000;

	while (Date.now() < deadline) {
		const health = await tdClient.healthProbe(HEALTH_PROBE_TIMEOUT_MS);
		if (health.online) {
			try {
				await tdClient.invalidateAndProbe();
				return true;
			} catch {
				// TD responded but compat refresh failed; keep polling until timeout.
			}
		}

		const remaining = deadline - Date.now();
		if (remaining <= 0) break;
		await sleep(Math.min(POLL_INTERVAL_MS, remaining));
	}

	return false;
}

async function waitForProjectLoaded(
	tdClient: TouchDesignerClient,
	expectedToePath: string,
	timeoutSeconds: number,
): Promise<boolean> {
	const deadline = Date.now() + timeoutSeconds * 1000;

	while (Date.now() < deadline) {
		const health = await tdClient.healthProbe(HEALTH_PROBE_TIMEOUT_MS);
		if (health.online) {
			try {
				await tdClient.invalidateAndProbe();
				const currentProject = await getCurrentProjectInfo(tdClient);
				if (
					currentProject.info?.toePath &&
					sameTdPath(currentProject.info.toePath, expectedToePath)
				) {
					return true;
				}
			} catch {
				// TouchDesigner responded but the loaded project is not ready yet.
			}
		}

		const remaining = deadline - Date.now();
		if (remaining <= 0) break;
		await sleep(Math.min(POLL_INTERVAL_MS, remaining));
	}

	return false;
}

async function getCurrentProjectInfo(
	tdClient: TouchDesignerClient,
): Promise<{ info: CurrentProjectInfo | null; warning: string | null }> {
	try {
		const result = await tdClient.execPythonScript<{ result: CurrentProjectInfo }>({
			mode: "read-only",
			script: buildCurrentProjectInfoScript(),
		});

		if (!result.success) {
			return {
				info: null,
				warning: `Could not determine the current project path: ${result.error.message}`,
			};
		}

		return {
			info: result.data.result,
			warning: result.data.result.toePath
				? null
				: "Could not determine the current project path for restoration.",
		};
	} catch (error) {
		return {
			info: null,
			warning: `Could not determine the current project path: ${toErrorMessage(error)}`,
		};
	}
}

async function requestProjectLoad(
	tdClient: TouchDesignerClient,
	toePath: string,
): Promise<{ error: string | null; shouldPoll: boolean }> {
	try {
		const result = await tdClient.execPythonScript({
			mode: "full-exec",
			script: buildProjectLoadScript(toePath),
		});

		if (!result.success) {
			return {
				error: result.error.message,
				shouldPoll: false,
			};
		}

		return { error: null, shouldPoll: true };
	} catch (error) {
		return {
			error: toErrorMessage(error),
			shouldPoll: true,
		};
	}
}

async function loadProjectAndWait(
	tdClient: TouchDesignerClient,
	toePath: string,
	timeoutSeconds: number,
): Promise<{ error: string | null; success: boolean }> {
	const loadRequest = await requestProjectLoad(tdClient, toePath);

	if (!loadRequest.shouldPoll) {
		return { error: loadRequest.error, success: false };
	}

	const loaded = await waitForProjectLoaded(tdClient, toePath, timeoutSeconds);
	if (loaded) {
		return { error: null, success: true };
	}

	const timeoutMessage = loadRequest.error
		? `Timed out waiting for TouchDesigner to load the requested project. Initial load error: ${loadRequest.error}`
		: "Timed out waiting for TouchDesigner to load the requested project.";

	return {
		error: timeoutMessage,
		success: false,
	};
}

async function runPackageScript(
	tdClient: TouchDesignerClient,
	auditLog: ExecAuditLog | undefined,
	opts: {
		author: string;
		description: string;
		tags: string[];
	},
): Promise<PackageScriptResult> {
	const script = buildPackageScript(opts);
	const startMs = Date.now();
	let outcome: "error" | "executed" = "error";

	try {
		const scriptResult = await tdClient.execPythonScript<{
			result: PackageScriptResult | string;
		}>({
			mode: "full-exec",
			script,
		});

		if (!scriptResult.success) {
			throw scriptResult.error;
		}

		outcome = "executed";
		return normalizePackageResult(scriptResult.data.result);
	} finally {
		auditLog?.append({
			allowed: true,
			durationMs: Date.now() - startMs,
			mode: "full-exec",
			outcome,
			preview: false,
			script: "package_project()",
		});
	}
}

// ── Registration ─────────────────────────────────────────────

export function registerProjectCatalogTools(
	server: McpServer,
	logger: ILogger,
	tdClient: TouchDesignerClient,
	serverMode: ServerMode,
	auditLog?: ExecAuditLog,
): void {
	// ── package_project (live) ────────────────────────────────
	server.tool(
		TOOL_NAMES.PACKAGE_PROJECT,
		"Package the open TouchDesigner project: generates .td-catalog.json manifest, .td-catalog.md README, and .td-catalog.png thumbnail (best-effort) as sidecars next to the .toe file.",
		packageProjectSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.PACKAGE_PROJECT,
			serverMode,
			tdClient,
			async (params: PackageProjectParams) => {
				const {
					author = "",
					description = "",
					detailLevel,
					responseFormat,
					tags = [],
				} = params;

				try {
					const data = await runPackageScript(tdClient, auditLog, {
						author,
						description,
						tags,
					});
					const text = formatPackageResult(
						data,
						{ detailLevel: detailLevel ?? "summary", responseFormat },
					);

					return {
						content: [{ text, type: "text" as const }],
					};
				} catch (error) {
					return handleToolError(
						error,
						logger,
						TOOL_NAMES.PACKAGE_PROJECT,
						undefined,
						serverMode,
					);
				}
			},
		),
	);

	// ── bulk_package_projects (live) ──────────────────────────
	server.tool(
		TOOL_NAMES.BULK_PACKAGE_PROJECTS,
		"Package multiple TouchDesigner .toe projects in a directory tree by loading them one by one and generating .td-catalog sidecars.",
		bulkPackageSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.BULK_PACKAGE_PROJECTS,
			serverMode,
			tdClient,
			async (params: BulkPackageParams) => {
				const {
					author = "",
					detailLevel,
					dryRun = false,
					loadTimeoutSeconds = 30,
					maxDepth = 5,
					responseFormat,
					rootDir,
					skipAlreadyPackaged = true,
					tags = [],
				} = params;

				try {
					const scan = scanForProjects(rootDir, maxDepth);
					const projects: BulkPackageProjectResult[] = [];
					const targets: string[] = [];
					const warnings: string[] = [];

					if (skipAlreadyPackaged) {
						for (const entry of scan.indexed) {
							projects.push({
								reason: "already-packaged",
								status: "skipped",
								toePath: entry.toePath,
								warnings: [],
							});
						}
					} else {
						for (const entry of scan.indexed) {
							targets.push(entry.toePath);
						}
					}

					for (const toePath of scan.notIndexed) {
						targets.push(toePath);
					}

					if (dryRun) {
						for (const toePath of targets) {
							projects.push({
								reason: "dry-run",
								status: "planned",
								toePath,
								warnings: [],
							});
						}

						const dryRunResult = {
							aborted: false,
							dryRun: true,
							failureCount: 0,
							originalProjectPath: null,
							projects,
							restoredOriginalProject: true,
							rootDir,
							scanned: {
								indexed: scan.indexed.length,
								notIndexed: scan.notIndexed.length,
								total: scan.indexed.length + scan.notIndexed.length,
							},
							skippedCount: projects.filter((project) => project.status === "skipped")
								.length,
							successCount: 0,
							targetCount: targets.length,
							warnings,
						};

						const text = formatBulkPackageResult(dryRunResult, {
							detailLevel: detailLevel ?? "summary",
							responseFormat,
						});

						return {
							content: [{ text, type: "text" as const }],
						};
					}

					let originalProjectPath: string | null = null;
					let originalProjectModified = false;
					let restoredOriginalProject = targets.length === 0;
					let consecutiveLoadTimeouts = 0;
					let aborted = false;
					let switchedAwayFromOriginalProject = false;

					if (targets.length > 0) {
						const currentProject = await getCurrentProjectInfo(tdClient);
						originalProjectPath = currentProject.info?.toePath ?? null;
						originalProjectModified = currentProject.info?.modified ?? false;
						if (currentProject.warning) {
							warnings.push(currentProject.warning);
						}

						if (originalProjectPath) {
							const currentPath = originalProjectPath;
							const currentTargets = targets.filter((candidate) =>
								sameTdPath(candidate, currentPath),
							);
							const otherTargets = targets.filter(
								(candidate) => !sameTdPath(candidate, currentPath),
							);
							targets.splice(0, targets.length, ...currentTargets, ...otherTargets);
						}
					}

					for (let index = 0; index < targets.length; index += 1) {
						const toePath = targets[index];
						const isCurrentProject =
							originalProjectPath !== null && sameTdPath(toePath, originalProjectPath);

						if (!isCurrentProject) {
							if (originalProjectModified && !switchedAwayFromOriginalProject) {
								warnings.push(
									"Cannot load another project because the currently open TouchDesigner project has unsaved changes. Save or revert it, then rerun bulk_package_projects.",
								);
								for (const pending of targets.slice(index)) {
									projects.push({
										reason: "current-project-modified",
										status: "skipped",
										toePath: pending,
										warnings: [],
									});
								}
								break;
							}

							switchedAwayFromOriginalProject = true;
							const loadResult = await loadProjectAndWait(
								tdClient,
								toePath,
								Math.max(1, loadTimeoutSeconds),
							);

							if (!loadResult.success) {
								consecutiveLoadTimeouts += 1;
								projects.push({
									error: loadResult.error ?? "Failed to load project.",
									status: "failed",
									toePath,
									warnings: [],
								});

								if (consecutiveLoadTimeouts >= MAX_CONSECUTIVE_LOAD_TIMEOUTS) {
									aborted = true;
									warnings.push(
										`Aborted after ${MAX_CONSECUTIVE_LOAD_TIMEOUTS} consecutive project load timeouts.`,
									);

									for (const pending of targets.slice(index + 1)) {
										projects.push({
											reason: "batch-aborted",
											status: "skipped",
											toePath: pending,
											warnings: [],
										});
									}
									break;
								}

								continue;
							}
						}

						consecutiveLoadTimeouts = 0;

						try {
							const packageResult = await runPackageScript(
								tdClient,
								auditLog,
								{
									author,
									description: "",
									tags,
								},
							);

							projects.push({
								...packageResult,
								status: "packaged",
								toePath,
								warnings: packageResult.warnings,
							});
						} catch (error) {
							projects.push({
								error: toErrorMessage(error),
								status: "failed",
								toePath,
								warnings: [],
							});
						}
					}

					if (targets.length > 0) {
						if (!switchedAwayFromOriginalProject) {
							restoredOriginalProject = true;
						} else if (originalProjectPath) {
							const restoreResult = await loadProjectAndWait(
								tdClient,
								originalProjectPath,
								Math.max(1, loadTimeoutSeconds),
							);
							restoredOriginalProject = restoreResult.success;
							if (!restoreResult.success) {
								warnings.push(
									restoreResult.error ??
										"Failed to restore the original TouchDesigner project.",
								);
							}
						} else {
							restoredOriginalProject = false;
						}
					}

					const result = {
						aborted,
						dryRun: false,
						failureCount: projects.filter((project) => project.status === "failed")
							.length,
						originalProjectPath,
						projects,
						restoredOriginalProject,
						rootDir,
						scanned: {
							indexed: scan.indexed.length,
							notIndexed: scan.notIndexed.length,
							total: scan.indexed.length + scan.notIndexed.length,
						},
						skippedCount: projects.filter((project) => project.status === "skipped")
							.length,
						successCount: projects.filter(
							(project) => project.status === "packaged",
						).length,
						targetCount: targets.length,
						warnings,
					};

					const text = formatBulkPackageResult(result, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});

					return {
						content: [{ text, type: "text" as const }],
					};
				} catch (error) {
					return handleToolError(
						error,
						logger,
						TOOL_NAMES.BULK_PACKAGE_PROJECTS,
						undefined,
						serverMode,
					);
				}
			},
		),
	);

	// ── scan_projects (offline) ──────────────────────────────
	server.tool(
		TOOL_NAMES.SCAN_PROJECTS,
		"Scan a directory for TouchDesigner .toe projects and list which ones have catalogue manifests. Works offline.",
		scanProjectsSchema.strict().shape,
		async (params: ScanProjectsParams) => {
			try {
				const { detailLevel, maxDepth = 5, responseFormat, rootDir } = params;

				const result = scanForProjects(rootDir, maxDepth);
				const text = formatScanResult(rootDir, result, {
					detailLevel: detailLevel ?? "summary",
					responseFormat,
				});

				return {
					content: [{ text, type: "text" as const }],
				};
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.SCAN_PROJECTS);
			}
		},
	);

	// ── search_projects (offline) ────────────────────────────
	server.tool(
		TOOL_NAMES.SEARCH_PROJECTS,
		"Search catalogued TouchDesigner projects by name, tags, or description. Works offline.",
		searchProjectsSchema.strict().shape,
		async (params: SearchProjectsParams) => {
			try {
				const {
					detailLevel,
					maxResults,
					query,
					responseFormat,
					rootDir,
					tags,
				} = params;

				const registry = new ProjectCatalogRegistry();
				registry.loadFromDir(rootDir);

				const results = registry.search(query, { maxResults, tags });
				const text = formatSearchResults(query, results, {
					detailLevel: detailLevel ?? "summary",
					responseFormat,
				});

				return {
					content: [{ text, type: "text" as const }],
				};
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.SEARCH_PROJECTS);
			}
		},
	);
}
