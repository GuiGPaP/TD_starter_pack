import type { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import type { z } from "zod";
import {
	getCompatibilityPolicy,
	getCompatibilityPolicyType,
} from "../core/compatibility.js";
import type { ILogger } from "../core/logger.js";
import { createErrorResult, createSuccessResult } from "../core/result.js";
import type { ServerMode } from "../core/serverMode.js";
import {
	MCP_SERVER_VERSION,
	MIN_COMPATIBLE_API_VERSION,
} from "../core/version.js";
import {
	completeOpPaths as apiCompleteOpPaths,
	configureInstancing as apiConfigureInstancing,
	connectNodes as apiConnectNodes,
	copyNode as apiCopyNode,
	createFeedbackLoop as apiCreateFeedbackLoop,
	createGeometryComp as apiCreateGeometryComp,
	createNode as apiCreateNode,
	deleteNode as apiDeleteNode,
	discoverDatCandidates as apiDiscoverDatCandidates,
	execNodeMethod as apiExecNodeMethod,
	execPythonScript as apiExecPythonScript,
	formatDat as apiFormatDat,
	getCapabilities as apiGetCapabilities,
	getChopChannels as apiGetChopChannels,
	getCompExtensions as apiGetCompExtensions,
	getDatTableInfo as apiGetDatTableInfo,
	getDatText as apiGetDatText,
	getModuleHelp as apiGetModuleHelp,
	getNodeDetail as apiGetNodeDetail,
	getNodeErrors as apiGetNodeErrors,
	getNodeParameterSchema as apiGetNodeParameterSchema,
	getNodes as apiGetNodes,
	getTdContext as apiGetTdContext,
	getTdInfo as apiGetTdInfo,
	getTdPythonClassDetails as apiGetTdPythonClassDetails,
	getTdPythonClasses as apiGetTdPythonClasses,
	indexTdProject as apiIndexTdProject,
	layoutNodes as apiLayoutNodes,
	lintDat as apiLintDat,
	lintDats as apiLintDats,
	setDatText as apiSetDatText,
	typecheckDat as apiTypecheckDat,
	updateNode as apiUpdateNode,
	validateGlslDat as apiValidateGlslDat,
	validateJsonDat as apiValidateJsonDat,
	type CompleteOpPaths200Data,
	type CompleteOpPathsParams,
	type ConfigureInstancingRequest,
	type ConnectNodesRequest,
	type CopyNodeRequest,
	type CreateFeedbackLoopRequest,
	type CreateGeometryCompRequest,
	type CreateNodeRequest,
	type DeleteNodeParams,
	type DiscoverDatCandidates200Data,
	type DiscoverDatCandidatesParams,
	type ExecNodeMethodRequest,
	type ExecPythonScriptRequest,
	type FormatDat200Data,
	type FormatDatBody,
	type GetCapabilities200ResponseData,
	type GetChopChannels200Data,
	type GetChopChannelsParams,
	type GetCompExtensions200Data,
	type GetCompExtensionsParams,
	type GetDatTableInfo200Data,
	type GetDatTableInfoParams,
	type GetDatText200Data,
	type GetDatTextParams,
	type GetModuleHelpParams,
	type GetNodeDetailParams,
	type GetNodeErrorsParams,
	type GetNodeParameterSchema200Data,
	type GetNodeParameterSchemaParams,
	type GetNodesParams,
	type GetTdContext200Data,
	type GetTdContextParams,
	type IndexTdProject200Data,
	type IndexTdProjectParams,
	type LayoutNodesRequest,
	type LintDat200Data,
	type LintDatBody,
	type LintDats200Data,
	type LintDatsBody,
	type SetDatText200Data,
	type SetDatTextBody,
	type TypecheckDat200Data,
	type TypecheckDatBody,
	type UpdateNodeRequest,
	type ValidateGlslDat200Data,
	type ValidateGlslDatBody,
	type ValidateJsonDat200Data,
	type ValidateJsonDatBody,
} from "../gen/endpoints/TouchDesignerAPI.js";

/**
 * Interface for TouchDesignerClient HTTP operations
 */
export interface ITouchDesignerApi {
	completeOpPaths: typeof apiCompleteOpPaths;
	configureInstancing: typeof apiConfigureInstancing;
	connectNodes: typeof apiConnectNodes;
	copyNode: typeof apiCopyNode;
	layoutNodes: typeof apiLayoutNodes;
	getCapabilities: typeof apiGetCapabilities;
	createFeedbackLoop: typeof apiCreateFeedbackLoop;
	createGeometryComp: typeof apiCreateGeometryComp;
	createNode: typeof apiCreateNode;
	deleteNode: typeof apiDeleteNode;
	discoverDatCandidates: typeof apiDiscoverDatCandidates;
	execNodeMethod: typeof apiExecNodeMethod;
	execPythonScript: typeof apiExecPythonScript;
	getChopChannels: typeof apiGetChopChannels;
	getCompExtensions: typeof apiGetCompExtensions;
	getDatTableInfo: typeof apiGetDatTableInfo;
	getDatText: typeof apiGetDatText;
	getModuleHelp: typeof apiGetModuleHelp;
	getNodeDetail: typeof apiGetNodeDetail;
	getNodeErrors: typeof apiGetNodeErrors;
	getNodeParameterSchema: typeof apiGetNodeParameterSchema;
	getNodes: typeof apiGetNodes;
	getTdInfo: typeof apiGetTdInfo;
	getTdPythonClassDetails: typeof apiGetTdPythonClassDetails;
	getTdPythonClasses: typeof apiGetTdPythonClasses;
	formatDat: typeof apiFormatDat;
	lintDat: typeof apiLintDat;
	lintDats: typeof apiLintDats;
	validateGlslDat: typeof apiValidateGlslDat;
	validateJsonDat: typeof apiValidateJsonDat;
	setDatText: typeof apiSetDatText;
	typecheckDat: typeof apiTypecheckDat;
	updateNode: typeof apiUpdateNode;
	indexTdProject: typeof apiIndexTdProject;
	getTdContext: typeof apiGetTdContext;
}

/**
 * Default implementation of ITouchDesignerApi using generated API clients
 */
const defaultApiClient: ITouchDesignerApi = {
	completeOpPaths: apiCompleteOpPaths,
	configureInstancing: apiConfigureInstancing,
	connectNodes: apiConnectNodes,
	copyNode: apiCopyNode,
	createFeedbackLoop: apiCreateFeedbackLoop,
	createGeometryComp: apiCreateGeometryComp,
	createNode: apiCreateNode,
	deleteNode: apiDeleteNode,
	discoverDatCandidates: apiDiscoverDatCandidates,
	execNodeMethod: apiExecNodeMethod,
	execPythonScript: apiExecPythonScript,
	formatDat: apiFormatDat,
	getCapabilities: apiGetCapabilities,
	getChopChannels: apiGetChopChannels,
	getCompExtensions: apiGetCompExtensions,
	getDatTableInfo: apiGetDatTableInfo,
	getDatText: apiGetDatText,
	getModuleHelp: apiGetModuleHelp,
	getNodeDetail: apiGetNodeDetail,
	getNodeErrors: apiGetNodeErrors,
	getNodeParameterSchema: apiGetNodeParameterSchema,
	getNodes: apiGetNodes,
	getTdContext: apiGetTdContext,
	getTdInfo: apiGetTdInfo,
	getTdPythonClassDetails: apiGetTdPythonClassDetails,
	getTdPythonClasses: apiGetTdPythonClasses,
	indexTdProject: apiIndexTdProject,
	layoutNodes: apiLayoutNodes,
	lintDat: apiLintDat,
	lintDats: apiLintDats,
	setDatText: apiSetDatText,
	typecheckDat: apiTypecheckDat,
	updateNode: apiUpdateNode,
	validateGlslDat: apiValidateGlslDat,
	validateJsonDat: apiValidateJsonDat,
};

export type TdResponse<T> = {
	success: boolean;
	data: T | null;
	error: string | null;
};

export type ErrorResult<E = Error> = { success: false; error: E };
export type SuccessResult<T> = { success: true; data: NonNullable<T> };

export type Result<T, E = Error> = SuccessResult<T> | ErrorResult<E>;

export const ERROR_CACHE_TTL_MS = 10 * 1000; // 10 seconds (fast reconnection)
export const SUCCESS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Null logger implementation that discards all logs
 */
const nullLogger: ILogger = {
	sendLog: () => {},
};

/**
 * Handle API error response
 * @param response - API response object
 * @returns ErrorResult object indicating failure
 */
function handleError<T>(response: TdResponse<T>): ErrorResult {
	if (response.error) {
		const errorMessage = response.error;
		return { error: new Error(errorMessage), success: false };
	}
	return { error: new Error("Unknown error occurred"), success: false };
}
/**
 * Handle API response and return a structured result
 * @param response - API response object
 * @returns Result object indicating success or failure
 */
function handleApiResponse<T>(response: TdResponse<T>): Result<T> {
	const { success, data } = response;
	if (!success) {
		return handleError(response);
	}
	if (data === null) {
		return { error: new Error("No data received"), success: false };
	}
	if (data === undefined) {
		return { error: new Error("No data received"), success: false };
	}
	return { data, success: true };
}

/**
 * TouchDesigner client implementation with dependency injection
 * for better testability and separation of concerns
 */
type CompatibilityNotice = {
	level: "warning" | "info";
	message: string;
};

export class TouchDesignerClient {
	private readonly logger: ILogger;
	private readonly api: ITouchDesignerApi;
	private readonly serverMode?: ServerMode;
	private verifiedCompatibilityError: Error | null;
	private cachedCompatibilityCheck: boolean;
	private errorCacheTimestamp: number | null;
	private successCacheTimestamp: number | null;
	private compatibilityNotice: CompatibilityNotice | null;
	private _lastSeen: string | null;
	private _lastBuild: string | null;

	/**
	 * Initialize TouchDesigner client with optional dependencies
	 */
	constructor(
		params: {
			logger?: ILogger;
			httpClient?: ITouchDesignerApi;
			serverMode?: ServerMode;
		} = {},
	) {
		this.logger = params.logger || nullLogger;
		this.api = params.httpClient || defaultApiClient;
		this.serverMode = params.serverMode;
		this.verifiedCompatibilityError = null;
		this.cachedCompatibilityCheck = false;
		this.errorCacheTimestamp = null;
		this.successCacheTimestamp = null;
		this.compatibilityNotice = null;
		this._lastSeen = null;
		this._lastBuild = null;
	}

	get lastSeen(): string | null {
		return this._lastSeen;
	}

	get lastBuild(): string | null {
		return this._lastBuild;
	}

	/**
	 * Log debug message
	 */
	private logDebug(message: string, context?: Record<string, unknown>) {
		const data = context ? { message, ...context } : { message };
		this.logger.sendLog({
			data,
			level: "debug",
			logger: "TouchDesignerClient",
		});
	}

	/**
	 * Check if the cached error should be cleared (TTL expired)
	 */
	private shouldClearErrorCache(): boolean {
		if (!this.errorCacheTimestamp) {
			return false;
		}
		const now = Date.now();
		return now - this.errorCacheTimestamp >= ERROR_CACHE_TTL_MS;
	}

	/**
	 * Check whether the cached successful compatibility check is still valid
	 */
	private hasValidSuccessCache(): boolean {
		if (!this.cachedCompatibilityCheck || !this.successCacheTimestamp) {
			return false;
		}
		const now = Date.now();
		return now - this.successCacheTimestamp < SUCCESS_CACHE_TTL_MS;
	}

	/**
	 * Force the next API call to re-run compatibility verification.
	 * Useful when the user explicitly requests version information.
	 */
	private invalidateCompatibilityCache(reason?: string) {
		if (this.cachedCompatibilityCheck) {
			this.logDebug("Invalidating cached compatibility check", { reason });
		}
		this.cachedCompatibilityCheck = false;
		this.successCacheTimestamp = null;
		this.verifiedCompatibilityError = null;
		this.errorCacheTimestamp = null;
		this.compatibilityNotice = null;
	}

	getAdditionalToolResultContents():
		| z.infer<typeof CallToolResultSchema>["content"]
		| null {
		if (!this.compatibilityNotice) {
			return null;
		}
		return [
			{
				annotations: {
					audience: ["user", "assistant"],
					priority: this.compatibilityNotice.level === "warning" ? 0.2 : 0.1,
				},
				text: this.compatibilityNotice.message,
				type: "text" as const,
			},
		];
	}

	/**
	 * Verify compatibility with the TouchDesigner server
	 */
	private async verifyCompatibility() {
		// If we've already verified compatibility successfully, skip re-verification
		if (this.cachedCompatibilityCheck && !this.verifiedCompatibilityError) {
			if (this.hasValidSuccessCache()) {
				return;
			}
			this.logDebug("Compatibility cache expired, re-verifying...");
			this.invalidateCompatibilityCache("success cache expired");
		}

		// Clear cached error if TTL has expired
		if (this.verifiedCompatibilityError && this.shouldClearErrorCache()) {
			this.logDebug(
				"Clearing cached connection error (TTL expired), retrying...",
			);
			this.verifiedCompatibilityError = null;
			this.errorCacheTimestamp = null;
			this.cachedCompatibilityCheck = false;
		}

		if (this.verifiedCompatibilityError) {
			// Re-log the cached error so users know it's still failing
			const ttlRemaining = this.errorCacheTimestamp
				? Math.max(
						0,
						Math.ceil(
							(ERROR_CACHE_TTL_MS - (Date.now() - this.errorCacheTimestamp)) /
								1000,
						),
					)
				: 0;
			this.logDebug(
				`Using cached connection error (retry in ${ttlRemaining} seconds)`,
				{
					cacheAge: this.errorCacheTimestamp
						? Date.now() - this.errorCacheTimestamp
						: 0,
					cachedError: this.verifiedCompatibilityError.message,
				},
			);
			throw this.verifiedCompatibilityError;
		}

		const result = await this.verifyVersionCompatibility();
		if (result.success) {
			const compatibilityInfo = result.data;
			this.verifiedCompatibilityError = null;
			this.errorCacheTimestamp = null;
			this.cachedCompatibilityCheck = true;
			this.successCacheTimestamp = Date.now();
			if (compatibilityInfo.level === "warning" && compatibilityInfo.message) {
				this.compatibilityNotice = {
					level: compatibilityInfo.level,
					message: compatibilityInfo.message,
				};
			} else {
				this.compatibilityNotice = null;
			}
			this.logDebug("Compatibility verified successfully");
			return;
		}

		// Log when we're caching a NEW error
		this.logDebug(
			`Caching connection error for ${ERROR_CACHE_TTL_MS / 1000} seconds`,
			{
				error: result.error.message,
			},
		);
		this.verifiedCompatibilityError = result.error;
		this.errorCacheTimestamp = Date.now();
		this.cachedCompatibilityCheck = false;
		this.successCacheTimestamp = null;
		this.compatibilityNotice = null;
		throw result.error;
	}

	/**
	 * Wrapper for API calls that require compatibility verification
	 * @private
	 */
	private async apiCall<T>(
		message: string,
		call: () => Promise<TdResponse<T>>,
		context?: Record<string, unknown>,
	): Promise<Result<T>> {
		this.logDebug(message, context);
		await this.verifyCompatibility();
		const result = await call();
		return handleApiResponse<T>(result);
	}

	/**
	 * Execute a node method
	 */
	async execNodeMethod<
		DATA extends NonNullable<{
			result: unknown;
		}>,
	>(params: ExecNodeMethodRequest) {
		return this.apiCall(
			"Executing node method",
			() => this.api.execNodeMethod(params),
			{
				method: params.method,
				nodePath: params.nodePath,
			},
		) as Promise<Result<DATA>>;
	}

	/**
	 * Execute a script in TouchDesigner
	 */
	async execPythonScript<
		DATA extends {
			result: unknown;
		},
	>(params: ExecPythonScriptRequest) {
		return this.apiCall(
			"Executing Python script",
			() => this.api.execPythonScript(params),
			{ params },
		) as Promise<Result<DATA>>;
	}

	/**
	 * Get TouchDesigner server information
	 */
	async getTdInfo() {
		this.invalidateCompatibilityCache("tdInfo request");
		return this.apiCall("Getting server info", () => this.api.getTdInfo());
	}

	/**
	 * Get server capabilities and tool versions
	 */
	async getCapabilities() {
		return this.apiCall(
			"Getting capabilities",
			() =>
				this.api.getCapabilities() as Promise<
					TdResponse<GetCapabilities200ResponseData | undefined>
				>,
		);
	}

	/**
	 * Get list of nodes
	 */
	async getNodes(params: GetNodesParams) {
		return this.apiCall(
			"Getting nodes for parent",
			() => this.api.getNodes(params),
			{ parentPath: params.parentPath },
		);
	}

	/**
	 * Get node properties
	 */
	async getNodeDetail(params: GetNodeDetailParams) {
		return this.apiCall(
			"Getting properties for node",
			() => this.api.getNodeDetail(params),
			{ nodePath: params.nodePath },
		);
	}

	/**
	 * Get node error information
	 */
	async getNodeErrors(params: GetNodeErrorsParams) {
		return this.apiCall(
			"Checking node errors",
			() => this.api.getNodeErrors(params),
			{ nodePath: params.nodePath },
		);
	}

	/**
	 * Create a new node
	 */
	async createNode(params: CreateNodeRequest) {
		return this.apiCall("Creating node", () => this.api.createNode(params), {
			nodeName: params.nodeName,
			nodeType: params.nodeType,
			parentPath: params.parentPath,
		});
	}

	/**
	 * Update node properties
	 */
	async updateNode(params: UpdateNodeRequest) {
		return this.apiCall("Updating node", () => this.api.updateNode(params), {
			nodePath: params.nodePath,
		});
	}

	/**
	 * Delete a node
	 */
	async deleteNode(params: DeleteNodeParams) {
		return this.apiCall("Deleting node", () => this.api.deleteNode(params), {
			nodePath: params.nodePath,
		});
	}

	/**
	 * Copy a node to a new location
	 */
	async copyNode(params: CopyNodeRequest) {
		return this.apiCall("Copying node", () => this.api.copyNode(params), {
			sourcePath: params.sourcePath,
			targetParentPath: params.targetParentPath,
		});
	}

	/**
	 * Connect two nodes
	 */
	async connectNodes(params: ConnectNodesRequest) {
		return this.apiCall(
			"Connecting nodes",
			() => this.api.connectNodes(params),
			{
				fromPath: params.fromPath,
				toPath: params.toPath,
			},
		);
	}

	/**
	 * Reorganize nodes using a layout algorithm
	 */
	async layoutNodes(params: LayoutNodesRequest) {
		return this.apiCall(
			"Laying out nodes",
			() => this.api.layoutNodes(params),
			{
				mode: params.mode,
				paths: params.paths,
			},
		);
	}

	/**
	 * Get list of available Python classes/modules in TouchDesigner
	 */
	async getClasses() {
		return this.apiCall("Getting Python classes", () =>
			this.api.getTdPythonClasses(),
		);
	}

	/**
	 * Get details of a specific class/module
	 */
	async getClassDetails(className: string) {
		return this.apiCall(
			"Getting class details",
			() => this.api.getTdPythonClassDetails(className),
			{ className },
		);
	}

	/**
	 * Retrieve Python help() documentation for modules/classes
	 */
	async getModuleHelp(params: GetModuleHelpParams) {
		return this.apiCall(
			"Getting module help",
			() => this.api.getModuleHelp(params),
			{ moduleName: params.moduleName },
		);
	}

	/**
	 * Get DAT text content
	 */
	async getDatText(params: GetDatTextParams) {
		return this.apiCall(
			"Getting DAT text",
			() =>
				this.api.getDatText(params) as Promise<
					TdResponse<GetDatText200Data | undefined>
				>,
			{ nodePath: params.nodePath },
		);
	}

	/**
	 * Set DAT text content
	 */
	async setDatText(params: SetDatTextBody) {
		return this.apiCall(
			"Setting DAT text",
			() =>
				this.api.setDatText(params) as Promise<
					TdResponse<SetDatText200Data | undefined>
				>,
			{ nodePath: params.nodePath },
		);
	}

	/**
	 * Lint DAT code with ruff
	 */
	async lintDat(params: LintDatBody) {
		return this.apiCall(
			"Linting DAT",
			() =>
				this.api.lintDat(params) as Promise<
					TdResponse<LintDat200Data | undefined>
				>,
			{ nodePath: params.nodePath },
		);
	}

	/**
	 * Batch lint DATs under a parent path
	 */
	async lintDats(params: LintDatsBody) {
		return this.apiCall(
			"Batch linting DATs",
			() =>
				this.api.lintDats(params) as Promise<
					TdResponse<LintDats200Data | undefined>
				>,
			{ parentPath: params.parentPath },
		);
	}

	/**
	 * Format DAT code with ruff
	 */
	async formatDat(params: FormatDatBody) {
		return this.apiCall(
			"Formatting DAT",
			() =>
				this.api.formatDat(params) as Promise<
					TdResponse<FormatDat200Data | undefined>
				>,
			{ nodePath: params.nodePath },
		);
	}

	/**
	 * Validate JSON/YAML content in a DAT
	 */
	async validateJsonDat(params: ValidateJsonDatBody) {
		return this.apiCall(
			"Validating JSON/YAML DAT",
			() =>
				this.api.validateJsonDat(params) as Promise<
					TdResponse<ValidateJsonDat200Data | undefined>
				>,
			{ nodePath: params.nodePath },
		);
	}

	/**
	 * Validate GLSL shader code in a DAT
	 */
	async validateGlslDat(params: ValidateGlslDatBody) {
		return this.apiCall(
			"Validating GLSL DAT",
			() =>
				this.api.validateGlslDat(params) as Promise<
					TdResponse<ValidateGlslDat200Data | undefined>
				>,
			{ nodePath: params.nodePath },
		);
	}

	/**
	 * Discover DAT candidates under a parent
	 */
	async discoverDatCandidates(params: DiscoverDatCandidatesParams) {
		return this.apiCall(
			"Discovering DAT candidates",
			() =>
				this.api.discoverDatCandidates(params) as Promise<
					TdResponse<DiscoverDatCandidates200Data | undefined>
				>,
			{ parentPath: params.parentPath },
		);
	}

	/**
	 * Typecheck DAT code with pyright
	 */
	async typecheckDat(params: TypecheckDatBody) {
		return this.apiCall(
			"Typechecking DAT",
			() =>
				this.api.typecheckDat(params) as Promise<
					TdResponse<TypecheckDat200Data | undefined>
				>,
			{ nodePath: params.nodePath },
		);
	}

	/**
	 * Create a Geometry COMP with In/Out operators
	 */
	async createGeometryComp(params: CreateGeometryCompRequest) {
		return this.apiCall(
			"Creating geometry COMP",
			() => this.api.createGeometryComp(params),
			{ parentPath: params.parentPath },
		);
	}

	/**
	 * Create a Feedback TOP loop
	 */
	async createFeedbackLoop(params: CreateFeedbackLoopRequest) {
		return this.apiCall(
			"Creating feedback loop",
			() => this.api.createFeedbackLoop(params),
			{ parentPath: params.parentPath },
		);
	}

	/**
	 * Configure instancing on a Geometry COMP
	 */
	async configureInstancing(params: ConfigureInstancingRequest) {
		return this.apiCall(
			"Configuring instancing",
			() => this.api.configureInstancing(params),
			{ geoPath: params.geoPath },
		);
	}

	/**
	 * Get parameter schema for a node
	 */
	async getNodeParameterSchema(params: GetNodeParameterSchemaParams) {
		return this.apiCall(
			"Getting parameter schema",
			() =>
				this.api.getNodeParameterSchema(params) as Promise<
					TdResponse<GetNodeParameterSchema200Data | undefined>
				>,
			{ nodePath: params.nodePath },
		);
	}

	/**
	 * Complete op() path references
	 */
	async completeOpPaths(params: CompleteOpPathsParams) {
		return this.apiCall(
			"Completing op paths",
			() =>
				this.api.completeOpPaths(params) as Promise<
					TdResponse<CompleteOpPaths200Data | undefined>
				>,
			{ contextNodePath: params.contextNodePath },
		);
	}

	/**
	 * Get CHOP channel info
	 */
	async getChopChannels(params: GetChopChannelsParams) {
		return this.apiCall(
			"Getting CHOP channels",
			() =>
				this.api.getChopChannels(params) as Promise<
					TdResponse<GetChopChannels200Data | undefined>
				>,
			{ nodePath: params.nodePath },
		);
	}

	/**
	 * Get table DAT info
	 */
	async getDatTableInfo(params: GetDatTableInfoParams) {
		return this.apiCall(
			"Getting DAT table info",
			() =>
				this.api.getDatTableInfo(params) as Promise<
					TdResponse<GetDatTableInfo200Data | undefined>
				>,
			{ nodePath: params.nodePath },
		);
	}

	/**
	 * Get COMP extension info
	 */
	async getCompExtensions(params: GetCompExtensionsParams) {
		return this.apiCall(
			"Getting COMP extensions",
			() =>
				this.api.getCompExtensions(params) as Promise<
					TdResponse<GetCompExtensions200Data | undefined>
				>,
			{ compPath: params.compPath },
		);
	}

	/**
	 * Build project index for code completion
	 */
	async indexTdProject(params?: IndexTdProjectParams) {
		return this.apiCall(
			"Building project index",
			() =>
				this.api.indexTdProject(params) as Promise<
					TdResponse<IndexTdProject200Data | undefined>
				>,
			{ rootPath: params?.rootPath },
		);
	}

	/**
	 * Get contextual info for a node (aggregated facets)
	 */
	async getTdContext(params: GetTdContextParams) {
		return this.apiCall(
			"Getting node context",
			() =>
				this.api.getTdContext(params) as Promise<
					TdResponse<GetTdContext200Data | undefined>
				>,
			{ nodePath: params.nodePath },
		);
	}

	/**
	 * Force a fresh compatibility probe, bypassing the error cache.
	 * Used by get_capabilities for immediate recovery detection.
	 */
	async invalidateAndProbe(): Promise<void> {
		this.invalidateCompatibilityCache("manual probe");
		this.verifiedCompatibilityError = null;
		this.errorCacheTimestamp = null;
		await this.verifyCompatibility();
	}

	/**
	 * Lightweight health probe — calls getTdInfo directly with a short timeout.
	 * Bypasses the compatibility cache. Updates lastSeen/lastBuild and serverMode.
	 * Only catches AxiosError (network failures); programming errors propagate.
	 */
	async healthProbe(timeoutMs = 2000): Promise<{
		online: boolean;
		build: string | null;
		lastSeen: string | null;
		latencyMs: number;
		compatible: boolean | null;
		error: string | null;
	}> {
		const start = Date.now();
		try {
			const result = await this.api.getTdInfo({ timeout: timeoutMs });
			const latencyMs = Date.now() - start;
			// Any HTTP response = TD is reachable = online
			const build = result.data?.version ?? null;
			this._lastSeen = new Date().toISOString();
			this._lastBuild = build;
			this.serverMode?.transitionOnline(build ?? undefined);

			if (!result.success) {
				return {
					build,
					compatible: null,
					error: result.error ?? null,
					lastSeen: this._lastSeen,
					latencyMs,
					online: true,
				};
			}

			// Check version compatibility
			const apiVersion = result.data?.mcpApiVersion?.trim() || "";
			const compat = this.checkVersionCompatibility(
				MCP_SERVER_VERSION,
				apiVersion,
			);
			const compatible = compat.level !== "error";

			return {
				build,
				compatible,
				error: compatible ? null : compat.message,
				lastSeen: this._lastSeen,
				latencyMs,
				online: true,
			};
		} catch (error) {
			// Only catch AxiosError (network/HTTP). Propagate programming errors.
			if (!axios.isAxiosError(error)) {
				throw error;
			}
			const latencyMs = Date.now() - start;
			this.serverMode?.transitionOffline();
			return {
				build: this._lastBuild,
				compatible: null,
				error: this.formatConnectionError(error.message),
				lastSeen: this._lastSeen,
				latencyMs,
				online: false,
			};
		}
	}

	async verifyVersionCompatibility() {
		let tdInfoResult: Awaited<ReturnType<ITouchDesignerApi["getTdInfo"]>>;
		try {
			tdInfoResult = await this.api.getTdInfo({ timeout: 5000 });
		} catch (error) {
			// Use axios.isAxiosError() for robust network/HTTP error detection
			// AxiosError includes connection refused, timeout, network errors, etc.
			// All other errors (TypeError, etc.) are programming errors and should propagate
			if (!axios.isAxiosError(error)) {
				// This is a programming error (e.g., TypeError, ReferenceError), not a connection error
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				const errorStack = error instanceof Error ? error.stack : undefined;
				this.logger.sendLog({
					data: {
						error: errorMessage,
						errorType: "programming_error",
						stack: errorStack,
					},
					level: "error",
					logger: "TouchDesignerClient",
				});
				throw error;
			}

			// Network error → OFFLINE
			this.serverMode?.transitionOffline();

			// Handle AxiosError (network/HTTP errors)
			const rawMessage = error.message || "Unknown network error";
			const errorMessage = this.formatConnectionError(rawMessage);
			this.logger.sendLog({
				data: { error: rawMessage, errorType: "connection" },
				level: "error",
				logger: "TouchDesignerClient",
			});
			return createErrorResult(new Error(errorMessage));
		}

		// HTTP responded (even if success:false) → TD is REACHABLE → ONLINE
		const tdBuild = tdInfoResult.data?.version ?? null;
		this._lastSeen = new Date().toISOString();
		this._lastBuild = tdBuild;
		this.serverMode?.transitionOnline(tdBuild ?? undefined);

		if (!tdInfoResult.success) {
			const errorMessage = this.formatConnectionError(tdInfoResult.error);
			this.logger.sendLog({
				data: { error: tdInfoResult.error, errorType: "api_response" },
				level: "error",
				logger: "TouchDesignerClient",
			});
			return createErrorResult(new Error(errorMessage));
		}

		const apiVersionRaw = tdInfoResult.data?.mcpApiVersion?.trim() || "";

		const result = this.checkVersionCompatibility(
			MCP_SERVER_VERSION,
			apiVersionRaw,
		);

		this.logger.sendLog({
			data: {
				apiVersion: result.details.apiVersion,
				mcpVersion: result.details.mcpVersion,
				message: result.message,
				minRequired: result.details.minRequired,
			},
			level: result.level,
			logger: "TouchDesignerClient",
		});

		if (result.level === "error") {
			return createErrorResult(new Error(result.message));
		}

		return createSuccessResult({
			level: result.level,
			message: result.message,
		});
	}

	/**
	 * Format connection errors with helpful messages
	 */
	private formatConnectionError(error: string | null): string {
		if (!error) {
			return "Failed to connect to TouchDesigner API server (unknown error)";
		}

		// Check for common connection errors
		if (
			error.includes("ECONNREFUSED") ||
			error.toLowerCase().includes("connect refused")
		) {
			return `🔌 TouchDesigner Connection Failed

Cannot connect to TouchDesigner API server at the configured address.

Possible causes:
  1. TouchDesigner is not running
     → Please start TouchDesigner

  2. WebServer DAT is not active
     → Import 'mcp_webserver_base.tox' and ensure it's active

  3. Wrong port configuration
     → Default port is 9981, check your configuration

For setup instructions, visit:
https://github.com/8beeeaaat/touchdesigner-mcp/releases/latest

Original error: ${error}`;
		}

		if (error.includes("ETIMEDOUT") || error.includes("timeout")) {
			return `⏱️  TouchDesigner Connection Timeout

The connection to TouchDesigner timed out.

Possible causes:
  1. TouchDesigner is slow to respond
  2. Network issues
  3. WebServer DAT is overloaded

Try restarting TouchDesigner or check the network connection.

Original error: ${error}`;
		}

		if (error.includes("ENOTFOUND") || error.includes("getaddrinfo")) {
			return `🌐 Invalid Host Configuration

Cannot resolve the TouchDesigner API server hostname.

Please check your host configuration (default: 127.0.0.1)

Original error: ${error}`;
		}

		// Generic error message
		return `Failed to connect to TouchDesigner API server: ${error}`;
	}

	private checkVersionCompatibility(mcpVersion: string, apiVersion: string) {
		const policyType = getCompatibilityPolicyType({ apiVersion, mcpVersion });
		const policy = getCompatibilityPolicy(policyType);
		const details = {
			apiVersion,
			mcpVersion,
			minRequired: MIN_COMPATIBLE_API_VERSION,
		};
		const message = policy.message(details);

		return {
			compatible: policy.compatible,
			details,
			level: policy.level,
			message,
		};
	}
}
