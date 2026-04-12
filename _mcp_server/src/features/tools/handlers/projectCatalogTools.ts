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
import type { ScanResult } from "../../catalog/loader.js";
import {
	type BulkPackageProjectResult,
	formatBulkPackageResult,
	formatPackageResult,
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
		.describe(
			"Scan and report what would be packaged without loading projects",
		),
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
import json, datetime

# Parameters excluded from .md summary (UI/internal state, not semantically useful).
# Still captured in the .json for completeness.
_MD_SKIP_PARAMS = {
    'pageindex', 'opviewer', 'enableexternaltox', 'syncfile',
    'language', 'alignorder', 'reloadtoxinit', 'reloadcustom',
    'reloadbuiltin', 'savebackup', 'savebuild',
}

proj_file = str(project.name)
proj_name = proj_file[:-4] if proj_file.lower().endswith('.toe') else proj_file
proj_file = proj_file if proj_file.lower().endswith('.toe') else (proj_name + '.toe')
proj_folder = project.folder.replace('\\\\', '/')
root = op('/project1')

def _serialize_value(_value):
    try:
        if hasattr(td, 'OP') and isinstance(_value, td.OP):
            return _value.path
    except:
        pass
    if _value is None or isinstance(_value, (bool, int, float, str)):
        return _value
    if isinstance(_value, (list, tuple)):
        return [_serialize_value(_item) for _item in _value]
    if isinstance(_value, dict):
        _out = {}
        for _k, _v in _value.items():
            _out[str(_k)] = _serialize_value(_v)
        return _out
    try:
        return str(_value)
    except:
        return None

def _clean_text(_value):
    if _value is None:
        return ''
    _text = str(_value)
    return '' if _text == 'None' else _text

def _normalized_compare_value(_value):
    _json = _serialize_value(_value)
    if _json is None or _json == '':
        return None
    if isinstance(_json, str):
        _lower = _json.lower()
        if _lower == 'true':
            return True
        if _lower == 'false':
            return False
        try:
            if '.' in _json:
                return float(_json)
            return int(_json)
        except:
            return _json
    return _json

def _parameter_entry(_par):
    _mode = _clean_text(getattr(_par, 'mode', ''))
    _expr = _clean_text(getattr(_par, 'expr', ''))
    _style = _clean_text(getattr(_par, 'style', ''))

    try:
        _value = _par.eval()
    except:
        try:
            _value = getattr(_par, 'val', None)
        except:
            _value = None

    try:
        _default = getattr(_par, 'default', None)
    except:
        _default = None

    _value_json = _serialize_value(_value)
    _value_compare = _normalized_compare_value(_value)
    _default_compare = _normalized_compare_value(_default)

    _changed = False
    if _expr:
        _changed = True
    elif _mode and _mode != 'ParMode.CONSTANT':
        _changed = True
    else:
        try:
            _changed = _value_compare != _default_compare
        except:
            _changed = str(_value_compare) != str(_default_compare)

    if not _changed:
        return None

    _entry = {"value": _value_json}
    if _style:
        _entry["style"] = _style
    if _mode and _mode != 'ParMode.CONSTANT':
        _entry["mode"] = _mode.replace('ParMode.', '')
    if _expr:
        _entry["expr"] = _expr
    return _entry

def _custom_parameter_entry(_page, _par):
    _entry = {
        "name": _par.name,
        "label": _clean_text(getattr(_par, 'label', '')),
        "page": _clean_text(getattr(_page, 'name', '')),
        "style": _clean_text(getattr(_par, 'style', '')),
    }
    try:
        _entry["value"] = _serialize_value(_par.eval())
    except:
        try:
            _entry["value"] = _serialize_value(getattr(_par, 'val', None))
        except:
            pass
    return _entry

def _detect_patterns(_components, _nodes, _connections, _op_counts):
    _patterns = []
    _component_names = [str(_name).lower() for _name in _components]
    _op_types = [str(_node.get("opType", "")).lower() for _node in _nodes]

    if any(('webserver' in _name) or (_name.startswith('mcp')) for _name in _component_names):
        _patterns.append({
            "kind": "api-bridge",
            "summary": "Appears to expose a webserver or MCP-facing control network.",
        })

    if any(_op_type == 'feedbacktop' for _op_type in _op_types):
        _patterns.append({
            "kind": "feedback-loop",
            "summary": "Contains a feedback TOP-based processing loop.",
        })

    if any(
        _node.get("opType") == 'geometryCOMP'
        and any(str(_name).lower().startswith('instance') for _name in (_node.get("parameters", {}) or {}).keys())
        for _node in _nodes
    ):
        _patterns.append({
            "kind": "instancing",
            "summary": "Contains geometry operators with non-default instancing configuration.",
        })

    if _op_counts.get('TOP', 0) > 0 and len(_connections) > 0:
        _patterns.append({
            "kind": "connected-network",
            "summary": "Contains an explicit operator graph with wired connections.",
        })

    return _patterns

def _infer_description(_provided, _components, _op_counts, _patterns):
    if _provided:
        return _provided

    _pattern_kinds = [p.get("kind", "") for p in _patterns]
    if 'api-bridge' in _pattern_kinds:
        _center = _components[0] if _components else 'the project root'
        return f"TouchDesigner project centered on a webserver/API bridge network via {_center}."
    if 'feedback-loop' in _pattern_kinds:
        return "TouchDesigner project built around a TOP feedback loop."
    if 'instancing' in _pattern_kinds:
        return "TouchDesigner project for geometry rendering with instancing-oriented configuration."

    _top = _op_counts.get('TOP', 0)
    _chop = _op_counts.get('CHOP', 0)
    _dat = _op_counts.get('DAT', 0)

    if _top >= max(_chop, _dat) and _top > 0:
        return "TouchDesigner project focused on TOP-based visual or render processing."
    if _chop >= max(_top, _dat) and _chop > 0:
        return "TouchDesigner project focused on CHOP-driven control and signal flow."
    if _dat > 0:
        return "TouchDesigner project focused on DAT scripting, control logic, or API glue."
    if _components:
        return f"TouchDesigner project organized around {_components[0]}."
    return f"TouchDesigner project: {proj_name}"

def _value_preview(_value):
    if isinstance(_value, list):
        return '[' + ', '.join(str(_item) for _item in _value[:4]) + (', ...' if len(_value) > 4 else '') + ']'
    return str(_value)

op_counts = {}
op_type_counts = {}
nodes = []
connections = []
connection_keys = set()
components = []
warnings = []

if root:
    for c in root.children:
        components.append(c.name)
else:
    warnings.append("Could not resolve /project1 while packaging the project.")

if root:
    for c in root.findChildren(maxDepth=10):
        path = c.path
        family = c.family
        op_type = c.OPType

        if family:
            op_counts[family] = op_counts.get(family, 0) + 1
        if op_type:
            op_type_counts[op_type] = op_type_counts.get(op_type, 0) + 1

        node = {
            "path": path,
            "name": c.name,
            "opType": op_type,
            "family": family,
        }

        try:
            parent = c.parent()
            if parent and hasattr(parent, 'path'):
                node["parentPath"] = parent.path
        except:
            pass

        try:
            tags = [str(tag) for tag in c.tags]
            if tags:
                node["tags"] = tags
        except:
            pass

        parameters = {}
        try:
            for par in c.pars('*'):
                entry = _parameter_entry(par)
                if entry is not None:
                    parameters[par.name] = entry
        except:
            pass
        if parameters:
            node["parameters"] = parameters

        try:
            if hasattr(c, 'customPages') and c.family == 'COMP':
                custom_parameters = []
                for page in c.customPages:
                    for par in page.pars:
                        custom_parameters.append(_custom_parameter_entry(page, par))
                if custom_parameters:
                    node["customParameters"] = custom_parameters
        except:
            pass

        try:
            errs = c.errors()
            if errs:
                node["errors"] = str(errs)
        except:
            pass

        nodes.append(node)

        try:
            for input_index, connector in enumerate(c.inputConnectors):
                for con in connector.connections:
                    src = con.owner
                    if src and hasattr(src, 'path'):
                        key = (src.path, 0, path, input_index)
                        if key not in connection_keys:
                            connection_keys.add(key)
                            connections.append({
                                "from": src.path,
                                "fromOutput": 0,
                                "to": path,
                                "toInput": input_index,
                            })
        except:
            pass

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

if not thumbnail_path:
    warnings.append("No suitable TOP found for thumbnail")

patterns = _detect_patterns(components, nodes, connections, op_counts)
description = _infer_description(
    ${JSON.stringify(opts.description)} or "",
    components,
    op_counts,
    patterns,
)

# Build manifest
manifest = {
    "schemaVersion": "1.1",
    "name": proj_name,
    "file": proj_file,
    "tdVersion": str(td.app.version),
    "created": datetime.datetime.now().isoformat()[:10],
    "modified": datetime.datetime.now().isoformat()[:10],
    "author": ${JSON.stringify(opts.author)} or "",
    "tags": ${tagsJson},
    "description": description,
    "operators": op_counts,
    "components": components,
    "nodeCount": len(nodes),
    "connectionCount": len(connections),
    "nodes": nodes,
    "connections": connections,
    "patterns": patterns,
    "warnings": warnings,
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
total_ops = len(nodes)
ops_line = ', '.join(f"{v} {k}" for k, v in sorted(op_counts.items()))
top_types = sorted(op_type_counts.items(), key=lambda item: (-item[1], item[0]))
top_types_line = ', '.join(f"{count} {name}" for name, count in top_types[:8])
md_lines = [
    f"# {proj_name}",
    "",
    "## Purpose",
    "",
    manifest['description'],
    "",
    "## Network Shape",
    "",
    f"- Operators scanned: {total_ops}",
    f"- Connections discovered: {len(connections)}",
    f"- Families: {ops_line if ops_line else 'none'}",
]

if top_types_line:
    md_lines.append(f"- Top operator types: {top_types_line}")

if components:
    md_lines.extend(["", "## Top-Level Structure", ""])
    for component in components:
        md_lines.append(f"- \`{component}\`")

if patterns:
    md_lines.extend(["", "## Notable Patterns", ""])
    for pattern in patterns:
        md_lines.append(f"- {pattern['summary']}")

key_nodes = []
for node in nodes:
    _has_semantic_params = any(k not in _MD_SKIP_PARAMS for k in (node.get("parameters") or {}))
    if node.get("parentPath") == '/project1' or _has_semantic_params or node.get("customParameters"):
        key_nodes.append(node)

if key_nodes:
    md_lines.extend(["", "## Key Operators", ""])
    for node in key_nodes[:12]:
        line = f"- \`{node['path']}\` ({node['opType']})"
        param_summaries = []
        for param_name, param_entry in (node.get("parameters") or {}).items():
            if param_name in _MD_SKIP_PARAMS:
                continue
            param_summaries.append(f"{param_name}={_value_preview(param_entry.get('value'))}")
            if len(param_summaries) >= 6:
                break
        if param_summaries:
            line += " - " + ', '.join(param_summaries)
        elif node.get("customParameters"):
            custom_names = [item.get("name", "?") for item in node.get("customParameters", [])[:6]]
            line += " - custom parameters: " + ', '.join(custom_names)
        md_lines.append(line)

if connections:
    md_lines.extend(["", "## Representative Connections", ""])
    for connection in connections[:12]:
        md_lines.append(f"- \`{connection['from']}\` -> \`{connection['to']}\`")

if warnings:
    md_lines.extend(["", "## Packaging Notes", ""])
    for warning in warnings:
        md_lines.append(f"- {warning}")

md_lines.extend([
    "",
    f"See \`{json_name}\` for the machine-readable graph export (nodes, non-default parameters, and connections).",
])

md = '\\n'.join(md_lines)

with open(md_path, 'w', encoding='utf-8') as f:
    f.write(md)

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
	return (
		normalizeTdPath(left).toLowerCase() === normalizeTdPath(right).toLowerCase()
	);
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function normalizePackageResult(
	result: PackageScriptResult | string,
): PackageScriptResult {
	return typeof result === "string"
		? (JSON.parse(result) as PackageScriptResult)
		: result;
}

async function _waitForTdOnline(
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
		const result = await tdClient.execPythonScript<{
			result: CurrentProjectInfo;
		}>({
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

// ── Bulk-package helpers ─────────────────────────────────────

function buildTargetList(
	scan: ScanResult,
	skipAlreadyPackaged: boolean,
): { skippedProjects: BulkPackageProjectResult[]; targets: string[] } {
	const targets: string[] = [];
	const skippedProjects: BulkPackageProjectResult[] = [];

	if (skipAlreadyPackaged) {
		for (const entry of scan.indexed) {
			skippedProjects.push({
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

	return { skippedProjects, targets };
}

async function reorderTargetsCurrentFirst(
	tdClient: TouchDesignerClient,
	targets: string[],
	warnings: string[],
): Promise<{
	originalProjectModified: boolean;
	originalProjectPath: string | null;
}> {
	if (targets.length === 0) {
		return { originalProjectModified: false, originalProjectPath: null };
	}

	const currentProject = await getCurrentProjectInfo(tdClient);
	const originalProjectPath = currentProject.info?.toePath ?? null;
	const originalProjectModified = currentProject.info?.modified ?? false;

	if (currentProject.warning) {
		warnings.push(currentProject.warning);
	}

	if (originalProjectPath) {
		const currentPath = originalProjectPath;
		const currentTargets = targets.filter((c) => sameTdPath(c, currentPath));
		const otherTargets = targets.filter((c) => !sameTdPath(c, currentPath));
		targets.splice(0, targets.length, ...currentTargets, ...otherTargets);
	}

	return { originalProjectModified, originalProjectPath };
}

interface ProcessTargetsOpts {
	auditLog: ExecAuditLog | undefined;
	author: string;
	loadTimeoutSeconds: number;
	originalProjectModified: boolean;
	originalProjectPath: string | null;
	tags: string[];
	targets: string[];
	tdClient: TouchDesignerClient;
	warnings: string[];
}

async function processTargets(opts: ProcessTargetsOpts): Promise<{
	aborted: boolean;
	projects: BulkPackageProjectResult[];
	switchedAwayFromOriginalProject: boolean;
}> {
	const {
		auditLog,
		author,
		loadTimeoutSeconds,
		originalProjectModified,
		originalProjectPath,
		tags,
		targets,
		tdClient,
		warnings,
	} = opts;

	const projects: BulkPackageProjectResult[] = [];
	let consecutiveLoadTimeouts = 0;
	let aborted = false;
	let switchedAwayFromOriginalProject = false;

	for (let index = 0; index < targets.length; index += 1) {
		const toePath = targets[index];
		const isCurrentProject =
			originalProjectPath !== null && sameTdPath(toePath, originalProjectPath);

		if (!isCurrentProject) {
			if (originalProjectModified && !switchedAwayFromOriginalProject) {
				warnings.push(
					"Cannot load another project because the currently open TouchDesigner project has unsaved changes. Save or revert it, then rerun bulk_package_projects.",
				);
				appendSkippedTail(projects, targets, index, "current-project-modified");
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
					appendSkippedTail(projects, targets, index + 1, "batch-aborted");
					break;
				}

				continue;
			}
		}

		consecutiveLoadTimeouts = 0;

		try {
			const packageResult = await runPackageScript(tdClient, auditLog, {
				author,
				description: "",
				tags,
			});

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

	return { aborted, projects, switchedAwayFromOriginalProject };
}

function appendSkippedTail(
	projects: BulkPackageProjectResult[],
	targets: string[],
	fromIndex: number,
	reason: string,
): void {
	for (const pending of targets.slice(fromIndex)) {
		projects.push({
			reason,
			status: "skipped",
			toePath: pending,
			warnings: [],
		});
	}
}

async function restoreOriginalProject(
	tdClient: TouchDesignerClient,
	originalProjectPath: string | null,
	switchedAwayFromOriginalProject: boolean,
	loadTimeoutSeconds: number,
	warnings: string[],
): Promise<boolean> {
	if (!switchedAwayFromOriginalProject) {
		return true;
	}

	if (originalProjectPath) {
		const restoreResult = await loadProjectAndWait(
			tdClient,
			originalProjectPath,
			Math.max(1, loadTimeoutSeconds),
		);
		if (!restoreResult.success) {
			warnings.push(
				restoreResult.error ??
					"Failed to restore the original TouchDesigner project.",
			);
		}
		return restoreResult.success;
	}

	return false;
}

function buildScannedSummary(scan: ScanResult) {
	return {
		indexed: scan.indexed.length,
		notIndexed: scan.notIndexed.length,
		total: scan.indexed.length + scan.notIndexed.length,
	};
}

function countByStatus(
	projects: BulkPackageProjectResult[],
	status: BulkPackageProjectResult["status"],
): number {
	return projects.filter((p) => p.status === status).length;
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
					const text = formatPackageResult(data, {
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
					const warnings: string[] = [];
					const { skippedProjects, targets } = buildTargetList(
						scan,
						skipAlreadyPackaged,
					);

					if (dryRun) {
						const planned = targets.map<BulkPackageProjectResult>(
							(toePath) => ({
								reason: "dry-run",
								status: "planned",
								toePath,
								warnings: [],
							}),
						);
						const projects = [...skippedProjects, ...planned];
						const text = formatBulkPackageResult(
							{
								aborted: false,
								dryRun: true,
								failureCount: 0,
								originalProjectPath: null,
								projects,
								restoredOriginalProject: true,
								rootDir,
								scanned: buildScannedSummary(scan),
								skippedCount: countByStatus(projects, "skipped"),
								successCount: 0,
								targetCount: targets.length,
								warnings,
							},
							{ detailLevel: detailLevel ?? "summary", responseFormat },
						);
						return { content: [{ text, type: "text" as const }] };
					}

					const { originalProjectModified, originalProjectPath } =
						await reorderTargetsCurrentFirst(tdClient, targets, warnings);

					const processed = await processTargets({
						auditLog,
						author,
						loadTimeoutSeconds,
						originalProjectModified,
						originalProjectPath,
						tags,
						targets,
						tdClient,
						warnings,
					});

					const restoredOriginalProject =
						targets.length === 0
							? true
							: await restoreOriginalProject(
									tdClient,
									originalProjectPath,
									processed.switchedAwayFromOriginalProject,
									loadTimeoutSeconds,
									warnings,
								);

					const projects = [...skippedProjects, ...processed.projects];
					const text = formatBulkPackageResult(
						{
							aborted: processed.aborted,
							dryRun: false,
							failureCount: countByStatus(projects, "failed"),
							originalProjectPath,
							projects,
							restoredOriginalProject,
							rootDir,
							scanned: buildScannedSummary(scan),
							skippedCount: countByStatus(projects, "skipped"),
							successCount: countByStatus(projects, "packaged"),
							targetCount: targets.length,
							warnings,
						},
						{ detailLevel: detailLevel ?? "summary", responseFormat },
					);
					return { content: [{ text, type: "text" as const }] };
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
