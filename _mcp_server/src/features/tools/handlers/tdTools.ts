import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { REFERENCE_COMMENT, TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import {
	CompleteOpPathsQueryParams,
	ConfigureInstancingBody,
	ConnectNodesBody,
	CopyNodeBody,
	CreateFeedbackLoopBody,
	CreateGeometryCompBody,
	CreateNodeBody,
	DeleteNodeQueryParams,
	DiscoverDatCandidatesQueryParams,
	ExecNodeMethodBody,
	ExecPythonScriptBody,
	FormatDatBody,
	GetChopChannelsQueryParams,
	GetCompExtensionsQueryParams,
	GetDatTableInfoQueryParams,
	GetDatTextQueryParams,
	GetModuleHelpQueryParams,
	GetNodeDetailQueryParams,
	GetNodeErrorsQueryParams,
	GetNodeParameterSchemaQueryParams,
	GetNodesQueryParams,
	GetTdContextQueryParams,
	GetTdPythonClassDetailsParams,
	IndexTdProjectQueryParams,
	LayoutNodesBody,
	LintDatBody,
	LintDatsBody,
	SetDatTextBody,
	TypecheckDatBody,
	UpdateNodeBody,
	ValidateGlslDatBody,
	ValidateJsonDatBody,
} from "../../../gen/mcp/touchDesignerAPI.zod.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";
import type { ToolNames } from "../index.js";
import type { ToolMetadata } from "../metadata/touchDesignerToolMetadata.js";
import { getTouchDesignerToolMetadata } from "../metadata/touchDesignerToolMetadata.js";
import {
	formatCapabilities,
	formatChopChannels,
	formatClassDetails,
	formatClassList,
	formatCompExtensions,
	formatCompleteOpPaths,
	formatConfigureInstancing,
	formatConnectNodesResult,
	formatCopyNodeResult,
	formatCreateFeedbackLoop,
	formatCreateGeometryComp,
	formatCreateNodeResult,
	formatDatTableInfo,
	formatDatText,
	formatDeleteNodeResult,
	formatDiscoverDatCandidates,
	formatExecNodeMethodResult,
	formatFormatDat,
	formatLayoutNodesResult,
	formatLintDat,
	formatLintDats,
	formatModuleHelp,
	formatNodeDetails,
	formatNodeErrors,
	formatNodeList,
	formatParameterSchema,
	formatProjectIndex,
	formatScriptResult,
	formatSetDatText,
	formatTdContext,
	formatTdInfo,
	formatToolMetadata,
	formatTypecheckDat,
	formatUpdateNodeResult,
	formatValidateGlslDat,
	formatValidateJsonDat,
} from "../presenter/index.js";
import type { ExecAuditLog } from "../security/index.js";
import { analyzeScript } from "../security/index.js";
import type { AnalysisResult, ExecMode } from "../security/types.js";
import { withLiveGuard } from "../toolGuards.js";
import {
	detailOnlyFormattingSchema,
	type FormattingOptionsParams,
	formattingOptionsSchema,
} from "../types.js";

const execPythonScriptToolSchema = ExecPythonScriptBody.extend({
	...detailOnlyFormattingSchema.shape,
	mode: z
		.enum(["read-only", "safe-write", "full-exec"])
		.describe(
			"Execution mode: read-only (no writes), safe-write (no deletes/filesystem), full-exec (unrestricted). Default: safe-write",
		)
		.optional(),
	preview: z
		.boolean()
		.describe(
			"If true, analyze the script without executing. Returns mode classification and detected patterns.",
		)
		.optional(),
});
type ExecPythonScriptToolParams = z.input<typeof execPythonScriptToolSchema>;

const tdInfoToolSchema = detailOnlyFormattingSchema;
type TdInfoToolParams = z.input<typeof tdInfoToolSchema>;

const capabilitiesToolSchema = detailOnlyFormattingSchema;
type CapabilitiesToolParams = z.input<typeof capabilitiesToolSchema>;

const getNodesToolSchema = GetNodesQueryParams.extend(
	formattingOptionsSchema.shape,
).extend({
	parentPaths: z
		.array(z.string().min(1))
		.max(10)
		.describe(
			"Batch mode: list nodes under multiple parents in one call (max 10). Overrides parentPath if both provided.",
		)
		.optional(),
});
type GetNodesToolParams = z.input<typeof getNodesToolSchema>;

const getNodeDetailToolSchema = GetNodeDetailQueryParams.extend(
	formattingOptionsSchema.shape,
).extend({
	fields: z
		.array(z.string().min(1))
		.describe("If provided, only return these parameter names")
		.optional(),
	nonDefault: z
		.boolean()
		.describe(
			"If true, only return parameters that differ from their default value",
		)
		.optional(),
});
type GetNodeDetailToolParams = z.input<typeof getNodeDetailToolSchema>;

const getNodeErrorsToolSchema = GetNodeErrorsQueryParams.extend(
	formattingOptionsSchema.shape,
);
type GetNodeErrorsToolParams = z.input<typeof getNodeErrorsToolSchema>;

const createNodeToolSchema = CreateNodeBody.extend({
	...detailOnlyFormattingSchema.shape,
	x: z
		.number()
		.describe(
			"Node X position (auto-positioned to the right of siblings if omitted)",
		)
		.optional(),
	y: z
		.number()
		.describe("Node Y position (aligned with first sibling if omitted)")
		.optional(),
});
type CreateNodeToolParams = z.input<typeof createNodeToolSchema>;

const copyNodeToolSchema = CopyNodeBody.extend(
	detailOnlyFormattingSchema.shape,
);
type CopyNodeToolParams = z.input<typeof copyNodeToolSchema>;

const connectNodesToolSchema = ConnectNodesBody.extend(
	detailOnlyFormattingSchema.shape,
);
type ConnectNodesToolParams = z.input<typeof connectNodesToolSchema>;

const layoutNodesToolSchema = LayoutNodesBody.extend(
	detailOnlyFormattingSchema.shape,
);
type LayoutNodesToolParams = z.input<typeof layoutNodesToolSchema>;

const updateNodeToolSchema = UpdateNodeBody.extend(
	detailOnlyFormattingSchema.shape,
);
type UpdateNodeToolParams = z.input<typeof updateNodeToolSchema>;

const deleteNodeToolSchema = DeleteNodeQueryParams.extend(
	detailOnlyFormattingSchema.shape,
);
type DeleteNodeToolParams = z.input<typeof deleteNodeToolSchema>;

const classListToolSchema = formattingOptionsSchema;
type ClassListToolParams = FormattingOptionsParams;

const classDetailToolSchema = GetTdPythonClassDetailsParams.extend(
	formattingOptionsSchema.shape,
);
type ClassDetailToolParams = z.input<typeof classDetailToolSchema>;

const moduleHelpToolSchema = GetModuleHelpQueryParams.extend(
	detailOnlyFormattingSchema.shape,
);
type ModuleHelpToolParams = z.input<typeof moduleHelpToolSchema>;

const execNodeMethodToolSchema = ExecNodeMethodBody.extend(
	detailOnlyFormattingSchema.shape,
);
type ExecNodeMethodToolParams = z.input<typeof execNodeMethodToolSchema>;

const getDatTextToolSchema = GetDatTextQueryParams.extend(
	detailOnlyFormattingSchema.shape,
);
type GetDatTextToolParams = z.input<typeof getDatTextToolSchema>;

const setDatTextToolSchema = SetDatTextBody.extend(
	detailOnlyFormattingSchema.shape,
);
type SetDatTextToolParams = z.input<typeof setDatTextToolSchema>;

const lintDatToolSchema = LintDatBody.extend(detailOnlyFormattingSchema.shape);
type LintDatToolParams = z.input<typeof lintDatToolSchema>;

const typecheckDatToolSchema = TypecheckDatBody.extend(
	detailOnlyFormattingSchema.shape,
);
type TypecheckDatToolParams = z.input<typeof typecheckDatToolSchema>;

const lintDatsToolSchema = LintDatsBody.extend(
	detailOnlyFormattingSchema.shape,
);
type LintDatsToolParams = z.input<typeof lintDatsToolSchema>;

const formatDatToolSchema = FormatDatBody.extend(
	detailOnlyFormattingSchema.shape,
);
type FormatDatToolParams = z.input<typeof formatDatToolSchema>;

const validateGlslDatToolSchema = ValidateGlslDatBody.extend(
	detailOnlyFormattingSchema.shape,
);
type ValidateGlslDatToolParams = z.input<typeof validateGlslDatToolSchema>;

const validateJsonDatToolSchema = ValidateJsonDatBody.extend(
	detailOnlyFormattingSchema.shape,
);
type ValidateJsonDatToolParams = z.input<typeof validateJsonDatToolSchema>;

const discoverDatCandidatesToolSchema = DiscoverDatCandidatesQueryParams.extend(
	detailOnlyFormattingSchema.shape,
);
type DiscoverDatCandidatesToolParams = z.input<
	typeof discoverDatCandidatesToolSchema
>;

const createGeometryCompToolSchema = CreateGeometryCompBody.extend(
	detailOnlyFormattingSchema.shape,
);
type CreateGeometryCompToolParams = z.input<
	typeof createGeometryCompToolSchema
>;

const createFeedbackLoopToolSchema = CreateFeedbackLoopBody.extend(
	detailOnlyFormattingSchema.shape,
);
type CreateFeedbackLoopToolParams = z.input<
	typeof createFeedbackLoopToolSchema
>;

const configureInstancingToolSchema = ConfigureInstancingBody.extend(
	detailOnlyFormattingSchema.shape,
);
type ConfigureInstancingToolParams = z.input<
	typeof configureInstancingToolSchema
>;

const getNodeParameterSchemaToolSchema =
	GetNodeParameterSchemaQueryParams.extend(detailOnlyFormattingSchema.shape);
type GetNodeParameterSchemaToolParams = z.input<
	typeof getNodeParameterSchemaToolSchema
>;

const completeOpPathsToolSchema = CompleteOpPathsQueryParams.extend(
	detailOnlyFormattingSchema.shape,
);
type CompleteOpPathsToolParams = z.input<typeof completeOpPathsToolSchema>;

const getChopChannelsToolSchema = GetChopChannelsQueryParams.extend(
	detailOnlyFormattingSchema.shape,
);
type GetChopChannelsToolParams = z.input<typeof getChopChannelsToolSchema>;

const getDatTableInfoToolSchema = GetDatTableInfoQueryParams.extend(
	detailOnlyFormattingSchema.shape,
);
type GetDatTableInfoToolParams = z.input<typeof getDatTableInfoToolSchema>;

const getCompExtensionsToolSchema = GetCompExtensionsQueryParams.extend(
	detailOnlyFormattingSchema.shape,
);
type GetCompExtensionsToolParams = z.input<typeof getCompExtensionsToolSchema>;

const describeToolsSchema = detailOnlyFormattingSchema.extend({
	filter: z
		.string()
		.min(1)
		.describe(
			"Optional keyword to filter by tool name, module path, or parameter description",
		)
		.optional(),
});
type DescribeToolsParams = z.input<typeof describeToolsSchema>;

// --- exec_python_script helpers ---

function buildPreviewResponse(
	analysis: AnalysisResult,
	mode: ExecMode,
	script: string,
	startMs: number,
	auditLog?: ExecAuditLog,
) {
	auditLog?.append({
		allowed: analysis.allowed,
		durationMs: Date.now() - startMs,
		mode,
		outcome: "previewed",
		preview: true,
		script,
		violations: analysis.violations,
	});

	const lines = [
		`Script preview (mode: ${mode})`,
		"",
		`Status: ${analysis.allowed ? "ALLOWED" : `BLOCKED (requires ${analysis.requiredMode})`}`,
		`Confidence: ${analysis.confidence}`,
	];
	if (analysis.violations.length > 0) {
		lines.push("", "Detected patterns:");
		for (const v of analysis.violations) {
			lines.push(
				`  L${v.line}: ${v.snippet} [${v.category}] — ${v.description}`,
			);
		}
	}
	if (!analysis.allowed) {
		lines.push(
			"",
			`Use mode="${analysis.requiredMode}" or mode="full-exec" to allow this script.`,
		);
	}
	return { content: [{ text: lines.join("\n"), type: "text" as const }] };
}

function buildBlockedResponse(
	analysis: AnalysisResult,
	mode: ExecMode,
	script: string,
	startMs: number,
	auditLog?: ExecAuditLog,
) {
	auditLog?.append({
		allowed: false,
		durationMs: Date.now() - startMs,
		mode,
		outcome: "blocked",
		preview: false,
		script,
		violations: analysis.violations,
	});

	const lines = [
		`execute_python_script: Script blocked by ${mode} mode.`,
		"",
		`Required mode: ${analysis.requiredMode}`,
		"Violations:",
	];
	for (const v of analysis.violations) {
		lines.push(`  L${v.line}: ${v.snippet} — ${v.description}`);
	}
	lines.push(
		"",
		`Use mode="${analysis.requiredMode}" or mode="full-exec" to allow this script.`,
	);
	return {
		content: [{ text: lines.join("\n"), type: "text" as const }],
		isError: true,
	};
}

export function registerTdTools(
	server: McpServer,
	logger: ILogger,
	tdClient: TouchDesignerClient,
	serverMode: ServerMode,
	auditLog?: ExecAuditLog,
): void {
	const toolMetadataEntries = getTouchDesignerToolMetadata();

	/** Wrap a handler that returns formatted text with try/catch + createToolResult. */
	// biome-ignore lint/suspicious/noExplicitAny: generic default for tool handler wrapper
	const wrap = <T = any>(
		toolName: ToolNames,
		handler: (params: T) => Promise<string>,
		referenceComment?: string,
	) => {
		return async (params: T) => {
			try {
				const text = await handler(params);
				return createToolResult(tdClient, text);
			} catch (error) {
				return handleToolError(
					error,
					logger,
					toolName,
					referenceComment,
					serverMode,
				);
			}
		};
	};

	server.tool(
		TOOL_NAMES.DESCRIBE_TD_TOOLS,
		"Generate a filesystem-oriented manifest of available TouchDesigner tools",
		describeToolsSchema.strict().shape,
		async (params: DescribeToolsParams = {}) => {
			try {
				const { detailLevel, responseFormat, filter } = params;
				const normalizedFilter = filter?.trim().toLowerCase();
				const filteredEntries = normalizedFilter
					? toolMetadataEntries.filter((entry) =>
							matchesMetadataFilter(entry, normalizedFilter),
						)
					: toolMetadataEntries;

				if (filteredEntries.length === 0) {
					const message = filter
						? `No TouchDesigner tools matched filter "${filter}".`
						: "No TouchDesigner tools are registered.";
					return {
						content: [
							{
								text: message,
								type: "text" as const,
							},
						],
					};
				}

				const formattedText = formatToolMetadata(filteredEntries, {
					detailLevel: detailLevel ?? (filter ? "summary" : "minimal"),
					filter: normalizedFilter,
					responseFormat,
				});

				return {
					content: [
						{
							text: formattedText,
							type: "text" as const,
						},
					],
				};
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.DESCRIBE_TD_TOOLS);
			}
		},
	);

	server.tool(
		TOOL_NAMES.GET_TD_INFO,
		"Get server information from TouchDesigner",
		tdInfoToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.GET_TD_INFO,
			serverMode,
			tdClient,
			wrap(TOOL_NAMES.GET_TD_INFO, async (params: TdInfoToolParams = {}) => {
				const { detailLevel, responseFormat } = params;
				const result = await tdClient.getTdInfo();
				if (!result.success) throw result.error;
				return formatTdInfo(result.data, {
					detailLevel: detailLevel ?? "summary",
					responseFormat,
				});
			}),
		),
	);

	server.tool(
		TOOL_NAMES.GET_CAPABILITIES,
		"Get available capabilities and tool versions from the TouchDesigner server",
		capabilitiesToolSchema.strict().shape,
		async (params: CapabilitiesToolParams = {}) => {
			const { detailLevel, responseFormat } = params;

			// Phase 1: probe frais (bypasse le cache d'erreur)
			try {
				await tdClient.invalidateAndProbe();
			} catch (probeError) {
				const modeInfo = serverMode.toJSON();
				if (modeInfo.mode === "docs-only") {
					// Network failed → return offline status via formatter
					const formattedText = formatCapabilities(undefined, {
						detailLevel: detailLevel ?? "summary",
						modeInfo,
						responseFormat,
					});
					return {
						content: [{ text: formattedText, type: "text" as const }],
					};
				}
				// TD reachable but error (incompatibility, etc.) → show real diagnostic
				return handleToolError(
					probeError,
					logger,
					TOOL_NAMES.GET_CAPABILITIES,
					undefined,
					serverMode,
				);
			}

			// Phase 2: TD reachable → fetch full capabilities
			try {
				const result = await tdClient.getCapabilities();
				if (!result.success) {
					throw result.error;
				}
				const formattedText = formatCapabilities(result.data, {
					detailLevel: detailLevel ?? "summary",
					modeInfo: serverMode.toJSON(),
					responseFormat,
				});
				return createToolResult(tdClient, formattedText);
			} catch (error) {
				return handleToolError(
					error,
					logger,
					TOOL_NAMES.GET_CAPABILITIES,
					undefined,
					serverMode,
				);
			}
		},
	);

	server.tool(
		TOOL_NAMES.EXECUTE_PYTHON_SCRIPT,
		"Execute a Python script in TouchDesigner. Supports mode (read-only/safe-write/full-exec) and preview (analyze without executing).",
		execPythonScriptToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.EXECUTE_PYTHON_SCRIPT,
			serverMode,
			tdClient,
			async (params: ExecPythonScriptToolParams) => {
				const {
					detailLevel,
					mode: rawMode,
					preview = false,
					responseFormat,
					...scriptParams
				} = params;
				const mode: ExecMode = rawMode ?? "safe-write";
				const startMs = Date.now();
				const analysis = analyzeScript(scriptParams.script, mode);

				if (preview) {
					return buildPreviewResponse(
						analysis,
						mode,
						scriptParams.script,
						startMs,
						auditLog,
					);
				}

				if (!analysis.allowed) {
					return buildBlockedResponse(
						analysis,
						mode,
						scriptParams.script,
						startMs,
						auditLog,
					);
				}

				try {
					logger.sendLog({
						data: `Executing script (mode=${mode}): ${scriptParams.script}`,
						level: "debug",
					});
					const result = await tdClient.execPythonScript({
						...scriptParams,
						mode,
					});
					if (!result.success) throw result.error;

					auditLog?.append({
						allowed: true,
						durationMs: Date.now() - startMs,
						mode,
						outcome: "executed",
						preview: false,
						script: scriptParams.script,
					});

					const formattedText = formatScriptResult(
						result,
						scriptParams.script,
						{
							detailLevel: detailLevel ?? "summary",
							responseFormat,
						},
					);
					return createToolResult(tdClient, formattedText);
				} catch (error) {
					auditLog?.append({
						allowed: true,
						durationMs: Date.now() - startMs,
						error: error instanceof Error ? error.message : String(error),
						mode,
						outcome: "error",
						preview: false,
						script: scriptParams.script,
					});
					return handleToolError(
						error,
						logger,
						TOOL_NAMES.EXECUTE_PYTHON_SCRIPT,
						undefined,
						serverMode,
					);
				}
			},
		),
	);
	server.tool(
		TOOL_NAMES.CREATE_TD_NODE,
		"Create a new node in TouchDesigner",
		createNodeToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.CREATE_TD_NODE,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.CREATE_TD_NODE,
				async (params: CreateNodeToolParams) => {
					const { detailLevel, responseFormat, ...createParams } = params;
					const result = await tdClient.createNode(createParams);
					if (!result.success) throw result.error;
					return formatCreateNodeResult(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.DELETE_TD_NODE,
		"Delete an existing node in TouchDesigner",
		deleteNodeToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.DELETE_TD_NODE,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.DELETE_TD_NODE,
				async (params: DeleteNodeToolParams) => {
					const { detailLevel, responseFormat, ...deleteParams } = params;
					const result = await tdClient.deleteNode(deleteParams);
					if (!result.success) throw result.error;
					return formatDeleteNodeResult(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.COPY_NODE,
		"Copy a node to a new location in TouchDesigner",
		copyNodeToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.COPY_NODE,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.COPY_NODE,
				async (params: CopyNodeToolParams) => {
					const { detailLevel, responseFormat, ...copyParams } = params;
					const result = await tdClient.copyNode(copyParams);
					if (!result.success) throw result.error;
					return formatCopyNodeResult(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.CONNECT_NODES,
		"Connect two operators in TouchDesigner (same family required)",
		connectNodesToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.CONNECT_NODES,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.CONNECT_NODES,
				async (params: ConnectNodesToolParams) => {
					const { detailLevel, responseFormat, ...connectParams } = params;
					const result = await tdClient.connectNodes(connectParams);
					if (!result.success) throw result.error;
					return formatConnectNodesResult(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.LAYOUT_NODES,
		"Reorganize nodes using a layout algorithm (horizontal, vertical, or grid)",
		layoutNodesToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.LAYOUT_NODES,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.LAYOUT_NODES,
				async (params: LayoutNodesToolParams) => {
					const { detailLevel, responseFormat, ...layoutParams } = params;
					const result = await tdClient.layoutNodes(layoutParams);
					if (!result.success) throw result.error;
					return formatLayoutNodesResult(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.GET_TD_NODES,
		"List nodes under a path with token-optimized output (detailLevel+limit supported). Supports batch via parentPaths.",
		getNodesToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.GET_TD_NODES,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.GET_TD_NODES,
				async (params: GetNodesToolParams) => {
					const {
						detailLevel,
						limit,
						parentPaths,
						responseFormat,
						...queryParams
					} = params;
					const fallbackMode = queryParams.includeProperties
						? "detailed"
						: "summary";
					const fmtOpts = {
						detailLevel: detailLevel ?? fallbackMode,
						limit,
						responseFormat,
					};

					if (parentPaths && parentPaths.length > 0) {
						const sections: string[] = [];
						for (const parentPath of parentPaths) {
							const result = await tdClient.getNodes({
								...queryParams,
								parentPath,
							});
							if (result.success) {
								sections.push(formatNodeList(result.data, fmtOpts));
							} else {
								sections.push(
									`## ${parentPath}\n\nError: ${result.error.message}`,
								);
							}
						}
						return sections.join("\n\n---\n\n");
					}

					const result = await tdClient.getNodes(queryParams);
					if (!result.success) throw result.error;
					return formatNodeList(result.data, fmtOpts);
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.GET_TD_NODE_PARAMETERS,
		"Get node parameters with concise/detailed formatting (detailLevel+limit supported)",
		getNodeDetailToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.GET_TD_NODE_PARAMETERS,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.GET_TD_NODE_PARAMETERS,
				async (params: GetNodeDetailToolParams) => {
					const {
						detailLevel,
						fields,
						limit,
						nonDefault,
						responseFormat,
						...queryParams
					} = params;
					const result = await tdClient.getNodeDetail({
						...queryParams,
						fields: fields?.join(","),
						nonDefault,
					});
					if (!result.success) throw result.error;
					return formatNodeDetails(result.data, {
						detailLevel: detailLevel ?? "summary",
						fields,
						limit,
						nonDefault,
						responseFormat,
					});
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.GET_TD_NODE_ERRORS,
		"Check node and descendant errors reported by TouchDesigner",
		getNodeErrorsToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.GET_TD_NODE_ERRORS,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.GET_TD_NODE_ERRORS,
				async (params: GetNodeErrorsToolParams) => {
					const { detailLevel, limit, responseFormat, ...queryParams } = params;
					const result = await tdClient.getNodeErrors(queryParams);
					if (!result.success) throw result.error;
					return formatNodeErrors(result.data, {
						detailLevel: detailLevel ?? "summary",
						limit,
						responseFormat,
					});
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.UPDATE_TD_NODE_PARAMETERS,
		"Update parameters of a specific node in TouchDesigner",
		updateNodeToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.UPDATE_TD_NODE_PARAMETERS,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.UPDATE_TD_NODE_PARAMETERS,
				async (params: UpdateNodeToolParams) => {
					const { detailLevel, responseFormat, ...updateParams } = params;
					const result = await tdClient.updateNode(updateParams);
					if (!result.success) throw result.error;
					return formatUpdateNodeResult(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.EXECUTE_NODE_METHOD,
		"Execute a method on a specific node in TouchDesigner",
		execNodeMethodToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.EXECUTE_NODE_METHOD,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.EXECUTE_NODE_METHOD,
				async (params: ExecNodeMethodToolParams) => {
					const { detailLevel, responseFormat, ...execParams } = params;
					const { nodePath, method, args, kwargs } = execParams;
					const result = await tdClient.execNodeMethod(execParams);
					if (!result.success) throw result.error;
					return formatExecNodeMethodResult(
						result.data,
						{ args, kwargs, method, nodePath },
						{ detailLevel: detailLevel ?? "summary", responseFormat },
					);
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.GET_TD_CLASSES,
		"List TouchDesigner Python classes/modules (detailLevel+limit supported)",
		classListToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.GET_TD_CLASSES,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.GET_TD_CLASSES,
				async (params: ClassListToolParams = {}) => {
					const result = await tdClient.getClasses();
					if (!result.success) throw result.error;
					return formatClassList(result.data, {
						detailLevel: params.detailLevel ?? "summary",
						limit: params.limit ?? 50,
						responseFormat: params.responseFormat,
					});
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.GET_TD_CLASS_DETAILS,
		"Get information about a TouchDesigner class/module (detailLevel+limit supported)",
		classDetailToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.GET_TD_CLASS_DETAILS,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.GET_TD_CLASS_DETAILS,
				async (params: ClassDetailToolParams) => {
					const { className, detailLevel, limit, responseFormat } = params;
					const result = await tdClient.getClassDetails(className);
					if (!result.success) throw result.error;
					return formatClassDetails(result.data, {
						detailLevel: detailLevel ?? "summary",
						limit: limit ?? 30,
						responseFormat,
					});
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.GET_TD_MODULE_HELP,
		"Retrieve Python help() text for a TouchDesigner module or class",
		moduleHelpToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.GET_TD_MODULE_HELP,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.GET_TD_MODULE_HELP,
				async (params: ModuleHelpToolParams) => {
					const { detailLevel, moduleName, responseFormat } = params;
					const result = await tdClient.getModuleHelp({ moduleName });
					if (!result.success) throw result.error;
					return formatModuleHelp(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
			),
		),
	);

	server.tool(
		TOOL_NAMES.GET_DAT_TEXT,
		"Read the .text content of a DAT operator in TouchDesigner",
		getDatTextToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.GET_DAT_TEXT,
			serverMode,
			tdClient,
			wrap(TOOL_NAMES.GET_DAT_TEXT, async (params: GetDatTextToolParams) => {
				const { detailLevel, responseFormat, ...queryParams } = params;
				const result = await tdClient.getDatText(queryParams);
				if (!result.success) throw result.error;
				return formatDatText(result.data, {
					detailLevel: detailLevel ?? "summary",
					responseFormat,
				});
			}),
		),
	);

	server.tool(
		TOOL_NAMES.SET_DAT_TEXT,
		"Write .text content to a DAT operator in TouchDesigner",
		setDatTextToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.SET_DAT_TEXT,
			serverMode,
			tdClient,
			wrap(TOOL_NAMES.SET_DAT_TEXT, async (params: SetDatTextToolParams) => {
				const { detailLevel, responseFormat, ...bodyParams } = params;
				const result = await tdClient.setDatText(bodyParams);
				if (!result.success) throw result.error;
				return formatSetDatText(result.data, {
					detailLevel: detailLevel ?? "summary",
					responseFormat,
				});
			}),
		),
	);

	server.tool(
		TOOL_NAMES.LINT_DAT,
		"Lint DAT code with ruff and optionally auto-fix issues",
		lintDatToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.LINT_DAT,
			serverMode,
			tdClient,
			wrap(TOOL_NAMES.LINT_DAT, async (params: LintDatToolParams) => {
				const { detailLevel, responseFormat, ...bodyParams } = params;
				const result = await tdClient.lintDat(bodyParams);
				if (!result.success) throw result.error;
				return formatLintDat(result.data, {
					detailLevel: detailLevel ?? "summary",
					responseFormat,
				});
			}),
		),
	);

	server.tool(
		TOOL_NAMES.TYPECHECK_DAT,
		"Typecheck DAT code with pyright using td.pyi stubs",
		typecheckDatToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.TYPECHECK_DAT,
			serverMode,
			tdClient,
			wrap(TOOL_NAMES.TYPECHECK_DAT, async (params: TypecheckDatToolParams) => {
				const { detailLevel, responseFormat, ...bodyParams } = params;
				const result = await tdClient.typecheckDat(bodyParams);
				if (!result.success) throw result.error;
				return formatTypecheckDat(result.data, {
					detailLevel: detailLevel ?? "summary",
					responseFormat,
				});
			}),
		),
	);

	server.tool(
		TOOL_NAMES.LINT_DATS,
		"Batch lint all Python DATs under a parent path with aggregated report",
		lintDatsToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.LINT_DATS,
			serverMode,
			tdClient,
			wrap(TOOL_NAMES.LINT_DATS, async (params: LintDatsToolParams) => {
				const { detailLevel, responseFormat, ...bodyParams } = params;
				const result = await tdClient.lintDats(bodyParams);
				if (!result.success) throw result.error;
				return formatLintDats(result.data, {
					detailLevel: detailLevel ?? "summary",
					responseFormat,
				});
			}),
		),
	);

	server.tool(
		TOOL_NAMES.FORMAT_DAT,
		"Format DAT code with ruff format, with optional dry-run preview",
		formatDatToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.FORMAT_DAT,
			serverMode,
			tdClient,
			wrap(TOOL_NAMES.FORMAT_DAT, async (params: FormatDatToolParams) => {
				const { detailLevel, responseFormat, ...bodyParams } = params;
				const result = await tdClient.formatDat(bodyParams);
				if (!result.success) throw result.error;
				return formatFormatDat(result.data, {
					detailLevel: detailLevel ?? "summary",
					responseFormat,
				});
			}),
		),
	);

	server.tool(
		TOOL_NAMES.VALIDATE_JSON_DAT,
		"Validate JSON or YAML content in a DAT operator with structured diagnostics",
		validateJsonDatToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.VALIDATE_JSON_DAT,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.VALIDATE_JSON_DAT,
				async (params: ValidateJsonDatToolParams) => {
					const { detailLevel, responseFormat, ...bodyParams } = params;
					const result = await tdClient.validateJsonDat(bodyParams);
					if (!result.success) throw result.error;
					return formatValidateJsonDat(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
			),
		),
	);

	server.tool(
		TOOL_NAMES.VALIDATE_GLSL_DAT,
		"Validate GLSL shader code in a DAT operator with structured diagnostics",
		validateGlslDatToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.VALIDATE_GLSL_DAT,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.VALIDATE_GLSL_DAT,
				async (params: ValidateGlslDatToolParams) => {
					const { detailLevel, responseFormat, ...bodyParams } = params;
					const result = await tdClient.validateGlslDat(bodyParams);
					if (!result.success) throw result.error;
					return formatValidateGlslDat(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
			),
		),
	);

	server.tool(
		TOOL_NAMES.DISCOVER_DAT_CANDIDATES,
		"Discover DAT candidates under a parent, classified by kind (python, glsl, text, data)",
		discoverDatCandidatesToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.DISCOVER_DAT_CANDIDATES,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.DISCOVER_DAT_CANDIDATES,
				async (params: DiscoverDatCandidatesToolParams) => {
					const { detailLevel, responseFormat, ...queryParams } = params;
					const result = await tdClient.discoverDatCandidates(queryParams);
					if (!result.success) throw result.error;
					return formatDiscoverDatCandidates(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
			),
		),
	);

	server.tool(
		TOOL_NAMES.CREATE_GEOMETRY_COMP,
		"Create a Geometry COMP with In/Out operators inside it",
		createGeometryCompToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.CREATE_GEOMETRY_COMP,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.CREATE_GEOMETRY_COMP,
				async (params: CreateGeometryCompToolParams) => {
					const { detailLevel, responseFormat, ...bodyParams } = params;
					const result = await tdClient.createGeometryComp(bodyParams);
					if (!result.success) throw result.error;
					return formatCreateGeometryComp(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.CREATE_FEEDBACK_LOOP,
		"Create a Feedback TOP loop with cache, process, and feedback operators",
		createFeedbackLoopToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.CREATE_FEEDBACK_LOOP,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.CREATE_FEEDBACK_LOOP,
				async (params: CreateFeedbackLoopToolParams) => {
					const { detailLevel, responseFormat, ...bodyParams } = params;
					const result = await tdClient.createFeedbackLoop(bodyParams);
					if (!result.success) throw result.error;
					return formatCreateFeedbackLoop(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.CONFIGURE_INSTANCING,
		"Configure GPU instancing on an existing Geometry COMP",
		configureInstancingToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.CONFIGURE_INSTANCING,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.CONFIGURE_INSTANCING,
				async (params: ConfigureInstancingToolParams) => {
					const { detailLevel, responseFormat, ...bodyParams } = params;
					const result = await tdClient.configureInstancing(bodyParams);
					if (!result.success) throw result.error;
					return formatConfigureInstancing(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
				REFERENCE_COMMENT,
			),
		),
	);

	server.tool(
		TOOL_NAMES.GET_NODE_PARAMETER_SCHEMA,
		"Get parameter schema metadata (type, range, menu, default) for a node",
		getNodeParameterSchemaToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.GET_NODE_PARAMETER_SCHEMA,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.GET_NODE_PARAMETER_SCHEMA,
				async (params: GetNodeParameterSchemaToolParams) => {
					const { detailLevel, responseFormat, ...queryParams } = params;
					const result = await tdClient.getNodeParameterSchema(queryParams);
					if (!result.success) throw result.error;
					return formatParameterSchema(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
			),
		),
	);

	server.tool(
		TOOL_NAMES.COMPLETE_OP_PATHS,
		"Complete op() path references from a context node",
		completeOpPathsToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.COMPLETE_OP_PATHS,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.COMPLETE_OP_PATHS,
				async (params: CompleteOpPathsToolParams) => {
					const { detailLevel, responseFormat, ...queryParams } = params;
					const result = await tdClient.completeOpPaths(queryParams);
					if (!result.success) throw result.error;
					return formatCompleteOpPaths(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
			),
		),
	);

	server.tool(
		TOOL_NAMES.GET_CHOP_CHANNELS,
		"Get channel information for a CHOP node",
		getChopChannelsToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.GET_CHOP_CHANNELS,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.GET_CHOP_CHANNELS,
				async (params: GetChopChannelsToolParams) => {
					const { detailLevel, responseFormat, ...queryParams } = params;
					const result = await tdClient.getChopChannels(queryParams);
					if (!result.success) throw result.error;
					return formatChopChannels(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
			),
		),
	);

	server.tool(
		TOOL_NAMES.GET_DAT_TABLE_INFO,
		"Get table DAT dimensions and sample data",
		getDatTableInfoToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.GET_DAT_TABLE_INFO,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.GET_DAT_TABLE_INFO,
				async (params: GetDatTableInfoToolParams) => {
					const { detailLevel, responseFormat, ...queryParams } = params;
					const result = await tdClient.getDatTableInfo(queryParams);
					if (!result.success) throw result.error;
					return formatDatTableInfo(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
			),
		),
	);

	server.tool(
		TOOL_NAMES.GET_COMP_EXTENSIONS,
		"Get COMP extension methods and properties",
		getCompExtensionsToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.GET_COMP_EXTENSIONS,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.GET_COMP_EXTENSIONS,
				async (params: GetCompExtensionsToolParams) => {
					const { detailLevel, responseFormat, ...queryParams } = params;
					const result = await tdClient.getCompExtensions(queryParams);
					if (!result.success) throw result.error;
					return formatCompExtensions(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
			),
		),
	);

	// ── index_td_project ────────────────────────────────────────

	const indexTdProjectToolSchema = IndexTdProjectQueryParams.extend(
		detailOnlyFormattingSchema.shape,
	);
	type IndexTdProjectToolParams = z.input<typeof indexTdProjectToolSchema>;

	server.tool(
		TOOL_NAMES.INDEX_TD_PROJECT,
		"Build project index for code completion (cheap global scan)",
		indexTdProjectToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.INDEX_TD_PROJECT,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.INDEX_TD_PROJECT,
				async (params: IndexTdProjectToolParams) => {
					const { detailLevel, responseFormat, ...queryParams } = params;
					const result = await tdClient.indexTdProject(queryParams);
					if (!result.success) throw result.error;
					return formatProjectIndex(result.data, {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					});
				},
			),
		),
	);

	// ── get_td_context ──────────────────────────────────────────

	const getTdContextToolSchema = GetTdContextQueryParams.extend(
		detailOnlyFormattingSchema.shape,
	).extend({
		nodePaths: z
			.array(z.string().min(1))
			.max(10)
			.describe(
				"Batch mode: get context for multiple nodes in one call (max 10). Overrides nodePath if both provided.",
			)
			.optional(),
	});
	type GetTdContextToolParams = z.input<typeof getTdContextToolSchema>;

	server.tool(
		TOOL_NAMES.GET_TD_CONTEXT,
		"Get contextual info for a node (aggregated facets: parameters, channels, extensions, errors, etc.). Supports batch via nodePaths.",
		getTdContextToolSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.GET_TD_CONTEXT,
			serverMode,
			tdClient,
			wrap(
				TOOL_NAMES.GET_TD_CONTEXT,
				async (params: GetTdContextToolParams) => {
					const { detailLevel, nodePaths, responseFormat, ...queryParams } =
						params;
					const fmtOpts = {
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					};

					if (nodePaths && nodePaths.length > 0) {
						const sections: string[] = [];
						for (const nodePath of nodePaths) {
							const result = await tdClient.getTdContext({
								...queryParams,
								nodePath,
							});
							if (result.success) {
								sections.push(formatTdContext(result.data, fmtOpts));
							} else {
								sections.push(
									`# Context for \`${nodePath}\`\n\nError: ${result.error.message}`,
								);
							}
						}
						return sections.join("\n\n---\n\n");
					}

					const result = await tdClient.getTdContext(queryParams);
					if (!result.success) throw result.error;
					return formatTdContext(result.data, fmtOpts);
				},
			),
		),
	);
}

const createToolResult = (
	tdClient: TouchDesignerClient,
	text: string,
): z.infer<typeof CallToolResultSchema> => {
	const content: z.infer<typeof CallToolResultSchema>["content"] = [
		{
			text,
			type: "text" as const,
		},
	];
	const additionalContents = tdClient.getAdditionalToolResultContents();
	if (additionalContents) {
		content.push(...additionalContents);
	}
	return { content };
};

function matchesMetadataFilter(entry: ToolMetadata, keyword: string): boolean {
	const normalizedKeyword = keyword.toLowerCase();
	const haystacks = [
		entry.functionName,
		entry.modulePath,
		entry.description,
		entry.category,
		entry.tool,
		entry.notes ?? "",
	];

	if (
		haystacks.some((value) => value.toLowerCase().includes(normalizedKeyword))
	) {
		return true;
	}

	return entry.parameters.some((param) =>
		[param.name, param.type, param.description ?? ""].some((value) =>
			value.toLowerCase().includes(normalizedKeyword),
		),
	);
}
