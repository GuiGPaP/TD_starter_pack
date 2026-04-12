import { TOOL_NAMES } from "../../../core/constants.js";
import type { ToolNames } from "../index.js";

export type ToolCategory =
	| "system"
	| "python"
	| "nodes"
	| "classes"
	| "state"
	| "dat"
	| "helpers";

export interface ToolParameterMetadata {
	name: string;
	type: string;
	required: boolean;
	description?: string;
}

export interface ToolMetadata {
	tool: ToolNames;
	modulePath: string;
	functionName: string;
	description: string;
	category: ToolCategory;
	parameters: ToolParameterMetadata[];
	returns: string;
	example: string;
	notes?: string;
}

const MODULE_ROOT = "servers/touchdesigner";

export const TOUCH_DESIGNER_TOOL_METADATA: ToolMetadata[] = [
	{
		category: "system",
		description: "Get server information from TouchDesigner",
		example: `import { getTdInfo } from './servers/touchdesigner/getTdInfo';

const info = await getTdInfo();
console.log(\`\${info.server} \${info.version}\`);`,
		functionName: "getTdInfo",
		modulePath: `${MODULE_ROOT}/getTdInfo.ts`,
		parameters: [
			{
				description: "Optional presenter granularity for formatted output.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Overrides the formatter output format for automation.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"TouchDesigner build metadata (server, version, operating system).",
		tool: TOOL_NAMES.GET_TD_INFO,
	},
	{
		category: "system",
		description:
			"Get available capabilities and tool versions from the TD server",
		example: `const caps = await getCapabilities();
console.log(caps.lint_dat, caps.tools.ruff.version);`,
		functionName: "getCapabilities",
		modulePath: `${MODULE_ROOT}/getCapabilities.ts`,
		parameters: [
			{
				description: "Formatter verbosity.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Output format.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns: "Capabilities report with feature flags and tool versions.",
		tool: TOOL_NAMES.GET_CAPABILITIES,
	},
	{
		category: "system",
		description:
			"Check TouchDesigner connection health. Returns online status, build, latency, and compatibility. Works without a live TD connection.",
		example: `const health = await getHealth();
console.log(health.online, health.latencyMs);`,
		functionName: "getHealth",
		modulePath: `${MODULE_ROOT}/healthTools.ts`,
		parameters: [],
		returns:
			"Health status object: { online, build, lastSeen, latencyMs, compatible, error }.",
		tool: TOOL_NAMES.GET_HEALTH,
	},
	{
		category: "system",
		description:
			"Wait for TouchDesigner to become available. Polls periodically until TD responds or timeout is reached.",
		example: `const result = await waitForTd({ timeoutSeconds: 30 });
console.log(result.online, result.ready, result.timedOut);`,
		functionName: "waitForTd",
		modulePath: `${MODULE_ROOT}/healthTools.ts`,
		parameters: [
			{
				description:
					"Maximum seconds to wait for TD connection (1–120, default 30).",
				name: "timeoutSeconds",
				required: false,
				type: "number",
			},
		],
		returns:
			"Health status with { online, ready, timedOut, build, compatible, error }.",
		tool: TOOL_NAMES.WAIT_FOR_TD,
	},
	{
		category: "python",
		description: "Execute arbitrary Python against the TouchDesigner session",
		example: `import { executePythonScript } from './servers/touchdesigner/executePythonScript';

await executePythonScript({
  script: "op('/text1').par.text = 'Hello MCP'",
});`,
		functionName: "executePythonScript",
		modulePath: `${MODULE_ROOT}/executePythonScript.ts`,
		notes:
			"Wrap long-running scripts with logging so the agent can stream intermediate checkpoints.",
		parameters: [
			{
				description:
					"Python source that TouchDesigner will eval. Multiline scripts supported.",
				name: "script",
				required: true,
				type: "string",
			},
			{
				description:
					"Choose how much of the execution metadata to surface back to the agent.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Structured response encoding for downstream tooling.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"Result payload that mirrors `result` from the executed script (if set).",
		tool: TOOL_NAMES.EXECUTE_PYTHON_SCRIPT,
	},
	{
		category: "nodes",
		description: "List nodes below a parent path",
		example: `import { getTdNodes } from './servers/touchdesigner/getTdNodes';

const nodes = await getTdNodes({
  parentPath: '/project1',
  pattern: 'geo*',
});
console.log(nodes.nodes?.map(node => node.path));`,
		functionName: "getTdNodes",
		modulePath: `${MODULE_ROOT}/getTdNodes.ts`,
		parameters: [
			{
				description: "Root operator path (e.g. /project1).",
				name: "parentPath",
				required: true,
				type: "string",
			},
			{
				description: "Glob pattern to filter node names (default '*').",
				name: "pattern",
				required: false,
				type: "string",
			},
			{
				description:
					"Include expensive property blobs when you truly need them.",
				name: "includeProperties",
				required: false,
				type: "boolean",
			},
			{
				description: "Formatter verbosity for the returned list.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Optional cap on how many nodes to return.",
				name: "limit",
				required: false,
				type: "number",
			},
			{
				description: "Structured export for writing to disk.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"Set of nodes (id, opType, name, path, optional properties) under parentPath.",
		tool: TOOL_NAMES.GET_TD_NODES,
	},
	{
		category: "nodes",
		description: "Inspect an individual node with formatter-aware output",
		example: `import { getTdNodeParameters } from './servers/touchdesigner/getTdNodeParameters';

const node = await getTdNodeParameters({ nodePath: '/text1' });
console.log(node.properties?.Text);`,
		functionName: "getTdNodeParameters",
		modulePath: `${MODULE_ROOT}/getTdNodeParameters.ts`,
		parameters: [
			{
				description: "Absolute path to the operator (e.g. /text1).",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Controls how many parameters and properties are shown.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description:
					"Only include parameters whose current value differs from the default.",
				name: "nonDefault",
				required: false,
				type: "boolean",
			},
			{
				description: "Only include the named parameters, such as tx, ty, tz.",
				name: "fields",
				required: false,
				type: "string[]",
			},
			{
				description: "Trim parameter listings to the first N entries.",
				name: "limit",
				required: false,
				type: "number",
			},
			{
				description: "Switch between machine vs human friendly layouts.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns: "Full node record with parameters, paths, and metadata.",
		tool: TOOL_NAMES.GET_TD_NODE_PARAMETERS,
	},
	{
		category: "nodes",
		description: "Collect errors emitted by a node and its children",
		example: `import { getTdNodeErrors } from './servers/touchdesigner/getTdNodeErrors';

const report = await getTdNodeErrors({
  nodePath: '/text1',
});
if (report.hasErrors) {
  console.log(report.errors?.map(err => err.message));
}`,
		functionName: "getTdNodeErrors",
		modulePath: `${MODULE_ROOT}/getTdNodeErrors.ts`,
		parameters: [
			{
				description: "Absolute path to inspect (e.g. /text1).",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Formatter verbosity for the returned error list.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Optional limit on how many errors are displayed.",
				name: "limit",
				required: false,
				type: "number",
			},
			{
				description: "Structured output encoding (json/yaml/markdown).",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns: "Error report outlining offending nodes, messages, and counts.",
		tool: TOOL_NAMES.GET_TD_NODE_ERRORS,
	},
	{
		category: "nodes",
		description: "Create an operator under a parent path",
		example: `import { createTdNode } from './servers/touchdesigner/createTdNode';

const created = await createTdNode({
  parentPath: '/project1',
  nodeType: 'textTOP',
  nodeName: 'title',
});
console.log(created.result?.path);`,
		functionName: "createTdNode",
		modulePath: `${MODULE_ROOT}/createTdNode.ts`,
		parameters: [
			{
				description: "Where the new node should be created.",
				name: "parentPath",
				required: true,
				type: "string",
			},
			{
				description: "OP type (e.g. textTOP, constantCHOP).",
				name: "nodeType",
				required: true,
				type: "string",
			},
			{
				description:
					"Optional custom name. When omitted TouchDesigner assigns one.",
				name: "nodeName",
				required: false,
				type: "string",
			},
			{
				description: "Formatter verbosity for the creation result.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Switch result serialization to JSON for scripts.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns: "Created node metadata including resolved path and properties.",
		tool: TOOL_NAMES.CREATE_TD_NODE,
	},
	{
		category: "nodes",
		description: "Patch node properties in bulk",
		example: `import { updateTdNodeParameters } from './servers/touchdesigner/updateTdNodeParameters';

await updateTdNodeParameters({
  nodePath: '/text1',
  properties: { text: 'Hello TouchDesigner' },
});`,
		functionName: "updateTdNodeParameters",
		modulePath: `${MODULE_ROOT}/updateTdNodeParameters.ts`,
		parameters: [
			{
				description: "Target operator path.",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Key/value pairs to update on the node.",
				name: "properties",
				required: true,
				type: "Record<string, unknown>",
			},
			{
				description: "Controls how many updated keys are echoed back.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Choose JSON when writing audit logs to disk.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"Lists of updated vs failed parameters so the agent can retry selectively.",
		tool: TOOL_NAMES.UPDATE_TD_NODE_PARAMETERS,
	},
	{
		category: "nodes",
		description: "Remove an operator safely",
		example: `import { deleteTdNode } from './servers/touchdesigner/deleteTdNode';

const result = await deleteTdNode({ nodePath: '/tmp1' });
console.log(result.deleted);`,
		functionName: "deleteTdNode",
		modulePath: `${MODULE_ROOT}/deleteTdNode.ts`,
		parameters: [
			{
				description: "Absolute path of the operator to delete.",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Sends only boolean flags when set to minimal.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Structured payload when you need audit logs.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns: "Deletion status plus previous node metadata when available.",
		tool: TOOL_NAMES.DELETE_TD_NODE,
	},
	{
		category: "nodes",
		description: "Call TouchDesigner node methods directly",
		example: `import { execNodeMethod } from './servers/touchdesigner/execNodeMethod';

const renderStatus = await execNodeMethod({
  nodePath: '/render1',
  method: 'par',
  kwargs: { enable: true },
});
console.log(renderStatus.result);`,
		functionName: "execNodeMethod",
		modulePath: `${MODULE_ROOT}/execNodeMethod.ts`,
		parameters: [
			{
				description: "OP to target.",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Name of the method to call on that operator.",
				name: "method",
				required: true,
				type: "string",
			},
			{
				description: "Positional arguments forwarded to the TouchDesigner API.",
				name: "args",
				required: false,
				type: "Array<string | number | boolean>",
			},
			{
				description: "Keyword arguments for the method call.",
				name: "kwargs",
				required: false,
				type: "Record<string, unknown>",
			},
			{
				description: "How much of the result payload to echo back.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Switch to JSON when storing method responses.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns: "Raw method return payload including any serializable values.",
		tool: TOOL_NAMES.EXECUTE_NODE_METHOD,
	},
	{
		category: "classes",
		description: "List TouchDesigner Python classes/modules",
		example: `import { getTdClasses } from './servers/touchdesigner/getTdClasses';

const classes = await getTdClasses({ limit: 20 });
console.log(classes.classes?.map(cls => cls.name));`,
		functionName: "getTdClasses",
		modulePath: `${MODULE_ROOT}/getTdClasses.ts`,
		parameters: [
			{
				description:
					"Minimal returns only names, summary adds short descriptions.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Restrict the number of classes returned to save tokens.",
				name: "limit",
				required: false,
				type: "number",
			},
			{
				description: "Return the catalog as JSON when writing caches.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"Python class catalogue with names, types, and optional summaries.",
		tool: TOOL_NAMES.GET_TD_CLASSES,
	},
	{
		category: "classes",
		description: "Fetch detailed docs for a TouchDesigner class or module",
		example: `import { getTdClassDetails } from './servers/touchdesigner/getTdClassDetails';

const textTop = await getTdClassDetails({ className: 'textTOP' });
console.log(textTop.methods?.length);`,
		functionName: "getTdClassDetails",
		modulePath: `${MODULE_ROOT}/getTdClassDetails.ts`,
		parameters: [
			{
				description: "Class/module name like textTOP or CHOP.",
				name: "className",
				required: true,
				type: "string",
			},
			{
				description: "Switch to detailed when generating docs.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Cap how many methods/properties are surfaced.",
				name: "limit",
				required: false,
				type: "number",
			},
			{
				description: "Emit YAML or JSON for caching results to disk.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"Deep description of a Python class including methods and properties.",
		tool: TOOL_NAMES.GET_TD_CLASS_DETAILS,
	},
	{
		category: "classes",
		description:
			"Run Python help() to inspect documentation for TouchDesigner modules or classes",
		example: `import { getTdModuleHelp } from './servers/touchdesigner/getTdModuleHelp';

const docs = await getTdModuleHelp({ moduleName: 'noiseCHOP' });
console.log(docs.helpText?.slice(0, 200));`,
		functionName: "getTdModuleHelp",
		modulePath: `${MODULE_ROOT}/getTdModuleHelp.ts`,
		parameters: [
			{
				description:
					"Module or class name (e.g., 'noiseCHOP', 'td.noiseCHOP', 'tdu').",
				name: "moduleName",
				required: true,
				type: "string",
			},
			{
				description: "Controls how much of the help text is shown.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Select markdown/json/yaml output for automation.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns: "Captured Python help() output with formatter context.",
		tool: TOOL_NAMES.GET_TD_MODULE_HELP,
	},
	{
		category: "dat",
		description: "Read the .text content of a DAT operator",
		example: `const text = await getDatText({ nodePath: '/text1' });
console.log(text.data?.text);`,
		functionName: "getDatText",
		modulePath: `${MODULE_ROOT}/getDatText.ts`,
		parameters: [
			{
				description: "Absolute path to the DAT (e.g., /text1).",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Formatter verbosity.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Output format for automation.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns: "DAT path, name, and full text content.",
		tool: TOOL_NAMES.GET_DAT_TEXT,
	},
	{
		category: "dat",
		description: "Write .text content to a DAT operator",
		example: `await setDatText({
  nodePath: '/text1',
  text: 'print("hello")',
});`,
		functionName: "setDatText",
		modulePath: `${MODULE_ROOT}/setDatText.ts`,
		parameters: [
			{
				description: "Absolute path to the DAT.",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Text content to write.",
				name: "text",
				required: true,
				type: "string",
			},
			{
				description: "Formatter verbosity.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Output format for automation.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns: "Confirmation with path and character count.",
		tool: TOOL_NAMES.SET_DAT_TEXT,
	},
	{
		category: "dat",
		description:
			"Lint DAT code with ruff and optionally auto-fix. Supports dry-run mode and reports remaining diagnostics after fix.",
		example: `// Dry-run: preview fix without applying
const preview = await lintDat({
  nodePath: '/script1',
  fix: true,
  dryRun: true,
});
console.log(preview.data?.diff);
console.log(preview.data?.remainingDiagnostics);`,
		functionName: "lintDat",
		modulePath: `${MODULE_ROOT}/lintDat.ts`,
		parameters: [
			{
				description: "Absolute path to the DAT node (e.g., /script1).",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "If true, apply auto-fixable corrections to the DAT.",
				name: "fix",
				required: false,
				type: "boolean",
			},
			{
				description:
					"Preview fix without applying (returns diff). Only meaningful with fix=true.",
				name: "dryRun",
				required: false,
				type: "boolean",
			},
			{
				description: "Formatter verbosity.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Output format for automation.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"Lint diagnostics with code, message, line, column, fixable flag. When fix=true: applied, diff (dry-run), remainingDiagnostics, remainingDiagnosticCount.",
		tool: TOOL_NAMES.LINT_DAT,
	},
	{
		category: "dat",
		description: "Typecheck DAT code with pyright using td.pyi stubs",
		example: `const result = await typecheckDat({ nodePath: '/script1' });\nconsole.log(result.data?.diagnostics);`,
		functionName: "typecheckDat",
		modulePath: `${MODULE_ROOT}/typecheckDat.ts`,
		parameters: [
			{
				description: "Absolute path to the DAT node.",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Formatter verbosity.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Output format.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"Typecheck diagnostics with severity, message, line, column, and rule.",
		tool: TOOL_NAMES.TYPECHECK_DAT,
	},
	{
		category: "dat",
		description:
			"Format DAT code with ruff format. Supports dry-run mode to preview changes without applying.",
		example: `// Dry-run: preview formatting without applying
const preview = await formatDat({
  nodePath: '/script1',
  dryRun: true,
});
console.log(preview.data?.diff);`,
		functionName: "formatDat",
		modulePath: `${MODULE_ROOT}/formatDat.ts`,
		parameters: [
			{
				description: "Absolute path to the DAT node (e.g., /script1).",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Preview formatting without applying (returns diff).",
				name: "dryRun",
				required: false,
				type: "boolean",
			},
			{
				description: "Formatter verbosity.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Output format for automation.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"Original and formatted text, changed flag, unified diff, and applied status.",
		tool: TOOL_NAMES.FORMAT_DAT,
	},
	{
		category: "dat",
		description:
			"Validate JSON or YAML content in a DAT operator. Auto-detects format and returns structured diagnostics with line/column positions.",
		example: `const result = await validateJsonDat({
  nodePath: '/data1',
});
console.log(result.data?.valid, result.data?.format);`,
		functionName: "validateJsonDat",
		modulePath: `${MODULE_ROOT}/validateJsonDat.ts`,
		parameters: [
			{
				description: "Absolute path to the DAT node (e.g., /data1).",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Formatter verbosity.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Output format for automation.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"Validation result with path, name, detected format (json/yaml/unknown), valid flag, and diagnostics array with line/column/message.",
		tool: TOOL_NAMES.VALIDATE_JSON_DAT,
	},
	{
		category: "dat",
		description:
			"Validate GLSL shader code in a DAT operator. Checks connected GLSL TOP/MAT errors or falls back to glslangValidator.",
		example: `const result = await validateGlslDat({
  nodePath: '/shader_pixel',
});
console.log(result.data?.valid, result.data?.shaderType);`,
		functionName: "validateGlslDat",
		modulePath: `${MODULE_ROOT}/validateGlslDat.ts`,
		parameters: [
			{
				description:
					"Absolute path to the GLSL DAT node (e.g., /shader_pixel).",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Formatter verbosity.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Output format for automation.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"Validation result with path, name, shaderType (pixel/vertex/compute/unknown), valid flag, diagnostics array with line/column/message/severity, and validationMethod (td_errors/glslangValidator/none).",
		tool: TOOL_NAMES.VALIDATE_GLSL_DAT,
	},
	{
		category: "dat",
		description:
			"Batch lint all Python DATs under a parent path. Returns per-DAT diagnostics and aggregated summary with severity breakdown and worst offenders.",
		example: `const report = await lintDats({
  parentPath: '/project1',
  recursive: true,
  purpose: 'python',
});
console.log(report.data?.summary);`,
		functionName: "lintDats",
		modulePath: `${MODULE_ROOT}/lintDats.ts`,
		notes:
			"Combines discover_dat_candidates + lint_dat in a single call. Read-only (no fix/dry-run).",
		parameters: [
			{
				description: "Absolute path to the parent (e.g., /project1).",
				name: "parentPath",
				required: true,
				type: "string",
			},
			{
				description: "Glob pattern to filter DAT names (default '*').",
				name: "pattern",
				required: false,
				type: "string",
			},
			{
				description: "Filter by DAT kind: python, glsl, text, data, or any.",
				name: "purpose",
				required: false,
				type: "'python' | 'glsl' | 'text' | 'data' | 'any'",
			},
			{
				description: "Search recursively into descendants.",
				name: "recursive",
				required: false,
				type: "boolean",
			},
			{
				description: "Formatter verbosity.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Output format for automation.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"Aggregated report with totalDatsScanned, datsWithErrors, datsClean, totalIssues, fixableCount, manualCount, bySeverity, worstOffenders, and per-DAT results.",
		tool: TOOL_NAMES.LINT_DATS,
	},
	{
		category: "dat",
		description: "Discover DAT candidates under a parent, classified by kind",
		example: `const candidates = await discoverDatCandidates({
  parentPath: '/project1',
  purpose: 'python',
});
console.log(candidates.data?.candidates);`,
		functionName: "discoverDatCandidates",
		modulePath: `${MODULE_ROOT}/discoverDatCandidates.ts`,
		notes:
			"Agent-friendly endpoint that eliminates N+1 round-trips when searching for DATs.",
		parameters: [
			{
				description: "Absolute path to the parent (e.g., /project1).",
				name: "parentPath",
				required: true,
				type: "string",
			},
			{
				description: "Search recursively into descendants.",
				name: "recursive",
				required: false,
				type: "boolean",
			},
			{
				description: "Filter by DAT kind: python, glsl, text, data, or any.",
				name: "purpose",
				required: false,
				type: "'python' | 'glsl' | 'text' | 'data' | 'any'",
			},
			{
				description: "Formatter verbosity.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Output format for automation.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"List of DAT candidates with kind guess, confidence, line count, and parent COMP.",
		tool: TOOL_NAMES.DISCOVER_DAT_CANDIDATES,
	},
	{
		category: "helpers",
		description: "Create a Geometry COMP with In/Out operators inside it",
		example: `await createGeometryComp({
  parentPath: '/project1',
  name: 'geo1',
  pop: false,
});`,
		functionName: "createGeometryComp",
		modulePath: `${MODULE_ROOT}/createGeometryComp.ts`,
		parameters: [
			{
				description: "Path to the parent node (e.g., /project1).",
				name: "parentPath",
				required: true,
				type: "string",
			},
			{
				description: "Name for the geometry COMP.",
				name: "name",
				required: false,
				type: "string",
			},
			{
				description: "X position in the network.",
				name: "x",
				required: false,
				type: "number",
			},
			{
				description: "Y position in the network.",
				name: "y",
				required: false,
				type: "number",
			},
			{
				description: "Whether to use POP (point) topology instead of SOP.",
				name: "pop",
				required: false,
				type: "boolean",
			},
			{
				description: "Formatter verbosity.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Output format for automation.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"Created geometry COMP details including path and child operators.",
		tool: TOOL_NAMES.CREATE_GEOMETRY_COMP,
	},
	{
		category: "helpers",
		description:
			"Create a Feedback TOP loop with cache, process, and feedback operators",
		example: `await createFeedbackLoop({
  parentPath: '/project1',
  name: 'sim',
  processType: 'glslTOP',
});`,
		functionName: "createFeedbackLoop",
		modulePath: `${MODULE_ROOT}/createFeedbackLoop.ts`,
		parameters: [
			{
				description: "Path to the parent node (e.g., /project1).",
				name: "parentPath",
				required: true,
				type: "string",
			},
			{
				description: "Base name for the feedback loop operators.",
				name: "name",
				required: false,
				type: "string",
			},
			{
				description: "X position in the network.",
				name: "x",
				required: false,
				type: "number",
			},
			{
				description: "Y position in the network.",
				name: "y",
				required: false,
				type: "number",
			},
			{
				description:
					"Operator type for the process step (e.g., glslTOP, compositeTOP).",
				name: "processType",
				required: false,
				type: "string",
			},
			{
				description: "Formatter verbosity.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Output format for automation.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns:
			"Created feedback loop details including cache, process, and feedback operator paths.",
		tool: TOOL_NAMES.CREATE_FEEDBACK_LOOP,
	},
	{
		category: "helpers",
		description: "Configure GPU instancing on an existing Geometry COMP",
		example: `await configureInstancing({
  geoPath: '/geo1',
  instanceOpName: 'noise1',
  tx: 'tx', ty: 'ty', tz: 'tz',
});`,
		functionName: "configureInstancing",
		modulePath: `${MODULE_ROOT}/configureInstancing.ts`,
		parameters: [
			{
				description: "Path to the Geometry COMP (e.g., /geo1).",
				name: "geoPath",
				required: true,
				type: "string",
			},
			{
				description: "Name of the operator providing instance data.",
				name: "instanceOpName",
				required: true,
				type: "string",
			},
			{
				description: "Column name for translate X.",
				name: "tx",
				required: false,
				type: "string",
			},
			{
				description: "Column name for translate Y.",
				name: "ty",
				required: false,
				type: "string",
			},
			{
				description: "Column name for translate Z.",
				name: "tz",
				required: false,
				type: "string",
			},
			{
				description: "Formatter verbosity.",
				name: "detailLevel",
				required: false,
				type: "'minimal' | 'summary' | 'detailed'",
			},
			{
				description: "Output format for automation.",
				name: "responseFormat",
				required: false,
				type: "'json' | 'yaml' | 'markdown'",
			},
		],
		returns: "Instancing configuration details.",
		tool: TOOL_NAMES.CONFIGURE_INSTANCING,
	},
	{
		category: "state",
		description:
			"Get parameter schema metadata (type, range, menu, default) for a node. Eliminates guessing parameter names.",
		example: `await getNodeParameterSchema({ nodePath: "/noise1", pattern: "instance*" });`,
		functionName: "getNodeParameterSchema",
		modulePath: `${MODULE_ROOT}/getNodeParameterSchema.ts`,
		parameters: [
			{
				description: "Absolute path to the node.",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Glob pattern to filter parameter names.",
				name: "pattern",
				required: false,
				type: "string",
			},
		],
		returns: "Parameter schema list with types, ranges, menus, and defaults.",
		tool: TOOL_NAMES.GET_NODE_PARAMETER_SCHEMA,
	},
	{
		category: "nodes",
		description:
			"Complete op() path references from a context node. Supports relative and absolute forms.",
		example: `await completeOpPaths({ contextNodePath: "/base1/script1", prefix: "noise" });`,
		functionName: "completeOpPaths",
		modulePath: `${MODULE_ROOT}/completeOpPaths.ts`,
		parameters: [
			{
				description: "Absolute path to the context node.",
				name: "contextNodePath",
				required: true,
				type: "string",
			},
			{
				description: "Prefix to complete.",
				name: "prefix",
				required: false,
				type: "string",
			},
			{
				description: "Maximum results.",
				name: "limit",
				required: false,
				type: "number",
			},
		],
		returns: "Matching operator paths with relative references.",
		tool: TOOL_NAMES.COMPLETE_OP_PATHS,
	},
	{
		category: "state",
		description:
			"Get channel info for a CHOP node. Optionally includes per-channel statistics.",
		example: `await getChopChannels({ nodePath: "/noise1", includeStats: true });`,
		functionName: "getChopChannels",
		modulePath: `${MODULE_ROOT}/getChopChannels.ts`,
		parameters: [
			{
				description: "Absolute path to the CHOP.",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Glob pattern to filter channel names.",
				name: "pattern",
				required: false,
				type: "string",
			},
			{
				description: "Include min/max/avg statistics.",
				name: "includeStats",
				required: false,
				type: "boolean",
			},
			{
				description: "Maximum channels to return.",
				name: "limit",
				required: false,
				type: "number",
			},
		],
		returns: "Channel names and optional statistics.",
		tool: TOOL_NAMES.GET_CHOP_CHANNELS,
	},
	{
		category: "state",
		description:
			"Get dimensions and a content sample of a table DAT. Raw cell values only.",
		example: `await getDatTableInfo({ nodePath: "/table1" });`,
		functionName: "getDatTableInfo",
		modulePath: `${MODULE_ROOT}/getDatTableInfo.ts`,
		parameters: [
			{
				description: "Absolute path to the table DAT.",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Maximum preview rows.",
				name: "maxPreviewRows",
				required: false,
				type: "number",
			},
			{
				description: "Truncate cells longer than this.",
				name: "maxCellChars",
				required: false,
				type: "number",
			},
		],
		returns: "Table dimensions and sample data.",
		tool: TOOL_NAMES.GET_DAT_TABLE_INFO,
	},
	{
		category: "state",
		description: "Get extension classes, methods, and properties for a COMP.",
		example: `await getCompExtensions({ compPath: "/base1", includeDocs: true });`,
		functionName: "getCompExtensions",
		modulePath: `${MODULE_ROOT}/getCompExtensions.ts`,
		parameters: [
			{
				description: "Absolute path to the COMP.",
				name: "compPath",
				required: true,
				type: "string",
			},
			{
				description: "Include method docstrings.",
				name: "includeDocs",
				required: false,
				type: "boolean",
			},
			{
				description: "Maximum methods per extension.",
				name: "maxMethods",
				required: false,
				type: "number",
			},
		],
		returns: "Extension method and property listings.",
		tool: TOOL_NAMES.GET_COMP_EXTENSIONS,
	},
	{
		category: "state",
		description:
			"Build a Markdown project index for code completion. Cheap global scan of the operator tree.",
		example: `await indexTdProject({ rootPath: "/project1", mode: "compact" });`,
		functionName: "indexTdProject",
		modulePath: `${MODULE_ROOT}/indexTdProject.ts`,
		parameters: [
			{
				description: "Root operator path.",
				name: "rootPath",
				required: false,
				type: "string",
			},
			{
				description: "Maximum depth for findChildren.",
				name: "maxDepth",
				required: false,
				type: "number",
			},
			{
				description: "Hard cap on operators scanned.",
				name: "opLimit",
				required: false,
				type: "number",
			},
			{
				description: "Index detail level: compact or full.",
				name: "mode",
				required: false,
				type: "string",
			},
		],
		returns: "Markdown index with stats, warnings, and truncation status.",
		tool: TOOL_NAMES.INDEX_TD_PROJECT,
	},
	{
		category: "state",
		description:
			"Aggregate contextual info for a single node: parameters, channels, extensions, errors, and more.",
		example: `await getTdContext({ nodePath: "/geo1", include: ["parameters", "errors"] });`,
		functionName: "getTdContext",
		modulePath: `${MODULE_ROOT}/getTdContext.ts`,
		parameters: [
			{
				description: "Absolute path to the target node.",
				name: "nodePath",
				required: true,
				type: "string",
			},
			{
				description: "Facets to include (omit for all).",
				name: "include",
				required: false,
				type: "string[]",
			},
		],
		returns: "Aggregated facets with per-facet warnings.",
		tool: TOOL_NAMES.GET_TD_CONTEXT,
	},
	{
		category: "helpers",
		description:
			"Search the catalogue of reusable TouchDesigner assets. Works offline — no TD connection needed.",
		example: `const results = await searchTdAssets({ query: "debug", tags: ["top"] });
console.log(results);`,
		functionName: "searchTdAssets",
		modulePath: `${MODULE_ROOT}/searchTdAssets.ts`,
		parameters: [
			{
				description:
					"Search query — matches title, description, tags, aliases.",
				name: "query",
				required: false,
				type: "string",
			},
			{
				description: "Filter by tags (OR logic).",
				name: "tags",
				required: false,
				type: "string[]",
			},
			{
				description: "Max results to return.",
				name: "maxResults",
				required: false,
				type: "number",
			},
			{
				description: "Filter assets compatible with this TD version.",
				name: "minTdVersion",
				required: false,
				type: "string",
			},
		],
		returns:
			"List of matching assets with ID, title, description, tags, kind, and source.",
		tool: TOOL_NAMES.SEARCH_TD_ASSETS,
	},
	{
		category: "helpers",
		description:
			"Get detailed info about a specific TouchDesigner asset by ID. Works offline.",
		example: `const asset = await getTdAsset({ id: "null-debug", includeReadme: true });
console.log(asset);`,
		functionName: "getTdAsset",
		modulePath: `${MODULE_ROOT}/getTdAsset.ts`,
		parameters: [
			{
				description: "Asset ID to retrieve.",
				name: "id",
				required: true,
				type: "string",
			},
			{
				description: "Include README in response.",
				name: "includeReadme",
				required: false,
				type: "boolean",
			},
		],
		returns:
			"Full asset manifest with deploy config, provenance, version, and optional README.",
		tool: TOOL_NAMES.GET_TD_ASSET,
	},
	{
		category: "helpers",
		description:
			"Deploy a reusable .tox asset into the running TouchDesigner project.",
		example: `const result = await deployTdAsset({ id: "null-debug", parentPath: "/project1" });
console.log(result.path, result.status);`,
		functionName: "deployTdAsset",
		modulePath: `${MODULE_ROOT}/deployTdAsset.ts`,
		parameters: [
			{
				description: "Asset ID to deploy.",
				name: "id",
				required: true,
				type: "string",
			},
			{
				description: "Parent path where the asset will be created.",
				name: "parentPath",
				required: true,
				type: "string",
			},
			{
				description: "Custom name for the container (overrides default).",
				name: "containerName",
				required: false,
				type: "string",
			},
			{
				description: "Dry run — show plan without deploying.",
				name: "dryRun",
				required: false,
				type: "boolean",
			},
			{
				description: "Force redeploy even if same version exists.",
				name: "force",
				required: false,
				type: "boolean",
			},
		],
		returns:
			"Deploy result with status (deployed, already_exists, update_available, conflict, dry_run) and target path.",
		tool: TOOL_NAMES.DEPLOY_TD_ASSET,
	},
	{
		category: "helpers",
		description:
			"Search the catalogue of GLSL shader patterns by type, difficulty, tags, or text query. Works offline.",
		example: `const results = await searchGlslPatterns({ type: "pixel", difficulty: "beginner" });`,
		functionName: "searchGlslPatterns",
		modulePath: `${MODULE_ROOT}/searchGlslPatterns.ts`,
		parameters: [
			{
				description: "Text query matching title, summary, tags, etc.",
				name: "query",
				required: false,
				type: "string",
			},
			{
				description: "Filter by shader type: pixel, vertex, compute, utility.",
				name: "type",
				required: false,
				type: "string",
			},
			{
				description: "Filter by difficulty: beginner, intermediate, advanced.",
				name: "difficulty",
				required: false,
				type: "string",
			},
			{
				description: "Filter by tags (OR logic).",
				name: "tags",
				required: false,
				type: "string[]",
			},
			{
				description: "Maximum number of results (default: 10).",
				name: "maxResults",
				required: false,
				type: "number",
			},
		],
		returns:
			"List of matching GLSL patterns with id, title, type, difficulty, and summary.",
		tool: TOOL_NAMES.SEARCH_GLSL_PATTERNS,
	},
	{
		category: "helpers",
		description:
			"Get detailed information about a specific GLSL shader pattern by ID, including source code and TD setup instructions. Works offline.",
		example: `const pattern = await getGlslPattern({ id: "raymarching-basic" });
console.log(pattern.code.glsl);`,
		functionName: "getGlslPattern",
		modulePath: `${MODULE_ROOT}/getGlslPattern.ts`,
		parameters: [
			{
				description: "Pattern ID to retrieve.",
				name: "id",
				required: true,
				type: "string",
			},
			{
				description: "Include GLSL source code (default: true).",
				name: "includeCode",
				required: false,
				type: "boolean",
			},
			{
				description:
					"Include TD setup instructions — operators, uniforms, connections (default: true).",
				name: "includeSetup",
				required: false,
				type: "boolean",
			},
		],
		returns:
			"Full GLSL pattern with source code, TD setup instructions, warnings, and metadata.",
		tool: TOOL_NAMES.GET_GLSL_PATTERN,
	},
	{
		category: "helpers",
		description:
			"Deploy a GLSL shader pattern into the running TouchDesigner project. Creates operators, injects code, wires connections. Supports dry-run.",
		example: `const result = await deployGlslPattern({ id: "feedback-decay", parentPath: "/project1" });
console.log(result.status, result.createdNodes);`,
		functionName: "deployGlslPattern",
		modulePath: `${MODULE_ROOT}/deployGlslPattern.ts`,
		parameters: [
			{
				description: "Pattern ID to deploy.",
				name: "id",
				required: true,
				type: "string",
			},
			{
				description:
					"Parent path in TD where the pattern container will be created.",
				name: "parentPath",
				required: true,
				type: "string",
			},
			{
				description: "Custom container name (defaults to pattern ID).",
				name: "name",
				required: false,
				type: "string",
			},
			{
				description: "Preview deploy plan without executing.",
				name: "dryRun",
				required: false,
				type: "boolean",
			},
		],
		returns:
			"Deploy result with status (deployed, dry_run, rolled_back, error), created node paths, and any warnings.",
		tool: TOOL_NAMES.DEPLOY_GLSL_PATTERN,
	},
	{
		category: "state",
		description:
			"Capture a screenshot of a TOP operator's visual output and return it as an inline image",
		example: `const screenshot = await screenshotOperator({ path: "/render1" });\n// Returns inline base64 image visible in conversation`,
		functionName: "screenshotOperator",
		modulePath: `${MODULE_ROOT}/screenshotOperator.ts`,
		parameters: [
			{
				description: "Absolute path to the TOP operator (e.g., /render1).",
				name: "path",
				required: true,
				type: "string",
			},
			{
				description: "Image format: png or jpg (default: png).",
				name: "format",
				required: false,
				type: "'png' | 'jpg'",
			},
		],
		returns:
			"Inline image content block with base64-encoded screenshot and resolution info.",
		tool: TOOL_NAMES.SCREENSHOT_OPERATOR,
	},
];

export function getTouchDesignerToolMetadata(): ToolMetadata[] {
	return TOUCH_DESIGNER_TOOL_METADATA;
}
