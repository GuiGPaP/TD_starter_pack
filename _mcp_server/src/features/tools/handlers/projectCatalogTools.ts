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
	formatPackageResult,
	formatScanResult,
	formatSearchResults,
} from "../presenter/projectCatalogFormatter.js";
import type { ExecAuditLog } from "../security/index.js";
import { withLiveGuard } from "../toolGuards.js";
import { detailOnlyFormattingSchema } from "../types.js";

// ── Schemas ──────────────────────────────────────────────────

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

function buildPackageScript(opts: {
	author: string;
	description: string;
	tags: string[];
}): string {
	const tagsJson = JSON.stringify(opts.tags);
	return `
import json, os, datetime

proj_name = project.name
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
        for c in root.findChildren(type=TOP, depth=3):
            if hasattr(c, 'width') and c.width > 0:
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
    "file": proj_name + ".toe",
    "tdVersion": str(app.version),
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
					const script = buildPackageScript({
						author,
						description,
						tags,
					});

					const startMs = Date.now();

					const scriptResult = await tdClient.execPythonScript<{
						result: {
							jsonPath: string;
							mdPath: string;
							name: string;
							operatorCount: number;
							pngPath: string | null;
							warnings: string[];
						};
					}>({ script });

					auditLog?.append({
						allowed: true,
						durationMs: Date.now() - startMs,
						mode: "full-exec",
						outcome: scriptResult.success ? "executed" : "error",
						preview: false,
						script: "package_project()",
					});

					if (!scriptResult.success) {
						throw scriptResult.error;
					}

					const data = scriptResult.data.result;
					const text = formatPackageResult(
						typeof data === "string" ? JSON.parse(data) : data,
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
