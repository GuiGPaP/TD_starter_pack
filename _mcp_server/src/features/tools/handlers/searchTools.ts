import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../../../core/constants.js";
import { handleToolError } from "../../../core/errorHandling.js";
import type { ILogger } from "../../../core/logger.js";
import type { ServerMode } from "../../../core/serverMode.js";
import type { TouchDesignerClient } from "../../../tdClient/touchDesignerClient.js";
import type { FusionService } from "../../resources/fusionService.js";
import { indexOfflineHelpOperators } from "../../resources/operatorOfflineHelp.js";
import {
	loadRuntimeOperatorEntries,
	mergeOperatorEntryList,
	operatorEntryIdFromOpType,
	saveRuntimeOperatorEntries,
} from "../../resources/operatorRuntimeCache.js";
import type { KnowledgeRegistry } from "../../resources/registry.js";
import type {
	TDKnowledgeEntry,
	TDOperatorEntry,
} from "../../resources/types.js";
import {
	normalizeTdVersion,
	type VersionManifest,
} from "../../resources/versionManifest.js";
import { scoreOperator } from "../presenter/operatorScorer.js";
import { finalizeFormattedText } from "../presenter/responseFormatter.js";
import {
	formatOperatorComparison,
	formatOperatorSearchResults,
} from "../presenter/searchFormatter.js";
import { withLiveGuard } from "../toolGuards.js";
import { detailOnlyFormattingSchema } from "../types.js";

const searchOperatorsSchema = z.object({
	...detailOnlyFormattingSchema.shape,
	family: z
		.string()
		.toUpperCase()
		.describe("Filter by operator family (TOP, CHOP, SOP, COMP, DAT, MAT)")
		.optional(),
	includeExamples: z
		.boolean()
		.describe("Include code examples in results (default: false)")
		.optional(),
	maxResults: z
		.number()
		.int()
		.min(1)
		.max(50)
		.describe("Max results (default: 10)")
		.optional(),
	query: z.string().describe('Search query, e.g. "noise feedback"'),
	version: z
		.string()
		.describe("Filter by TD version compatibility, e.g. '2023'")
		.optional(),
});
type SearchOperatorsParams = z.input<typeof searchOperatorsSchema>;

const compareOperatorsSchema = z.object({
	...detailOnlyFormattingSchema.shape,
	op1: z.string().describe("First operator ID or opType"),
	op2: z.string().describe("Second operator ID or opType"),
});
type CompareOperatorsParams = z.input<typeof compareOperatorsSchema>;

const refreshOperatorCatalogSchema = z.object({
	...detailOnlyFormattingSchema.shape,
	maxOperators: z
		.number()
		.int()
		.min(1)
		.max(1000)
		.describe("Maximum operator types to probe in TouchDesigner")
		.optional(),
	opTypes: z
		.array(z.string())
		.min(1)
		.max(1000)
		.describe("Optional explicit operator types to probe, e.g. ['noiseTOP']")
		.optional(),
});
type RefreshOperatorCatalogParams = z.input<
	typeof refreshOperatorCatalogSchema
>;

const indexTdOfflineHelpSchema = z.object({
	...detailOnlyFormattingSchema.shape,
	maxFiles: z
		.number()
		.int()
		.min(1)
		.max(5000)
		.describe("Maximum OfflineHelp HTML files to parse")
		.optional(),
	offlineHelpPath: z
		.string()
		.describe(
			"Path to TouchDesigner OfflineHelp/https.docs.derivative.ca. If omitted, common install paths and TD_MCP_OFFLINE_HELP_PATH are tried.",
		)
		.optional(),
});
type IndexTdOfflineHelpParams = z.input<typeof indexTdOfflineHelpSchema>;

interface RuntimeParameterInfo {
	clampMax?: boolean;
	clampMin?: boolean;
	default?: unknown;
	isOP?: boolean;
	label?: string;
	max?: number | null;
	menuLabels?: string[];
	menuNames?: string[];
	min?: number | null;
	name: string;
	page?: string;
	readOnly?: boolean;
	style?: string;
	val?: unknown;
}

interface RuntimeOperatorInfo {
	opFamily: string;
	opType: string;
	parameters: RuntimeParameterInfo[];
	title?: string;
}

interface RuntimeCatalogResult {
	errors: Array<{ opType: string; error: string }>;
	operators: RuntimeOperatorInfo[];
	tdBuild?: string | null;
	tdVersion?: string | null;
}

function lookupOperator(
	registry: KnowledgeRegistry,
	idOrOpType: string,
): TDKnowledgeEntry | undefined {
	return registry.getById(idOrOpType) ?? registry.getByOpType(idOrOpType);
}

function filterCandidates(
	operators: TDKnowledgeEntry[],
	family: string | undefined,
	version: string | undefined,
	versionManifest: VersionManifest,
): TDKnowledgeEntry[] {
	let candidates = family
		? operators.filter(
				(e) =>
					e.kind === "operator" &&
					e.payload.opFamily.toUpperCase() === family.toUpperCase(),
			)
		: operators;

	if (version) {
		candidates = candidates.filter((e) => {
			if (e.kind !== "operator") return true;
			return (
				versionManifest.checkCompatibility(e.payload.versions, version)
					.level !== "unavailable"
			);
		});
	}
	return candidates;
}

function scoreCandidates(
	candidates: TDKnowledgeEntry[],
	query: string,
): Array<{ entry: TDKnowledgeEntry; score: number }> {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	let scored = candidates
		.map((entry) => ({ entry, score: scoreOperator(entry, terms) }))
		.filter((r) => r.score > 0);

	// Soft fallback: if AND produced 0 results, try OR
	if (scored.length === 0 && terms.length > 1) {
		scored = candidates
			.map((entry) => {
				let bestScore = 0;
				for (const term of terms) {
					const s = scoreOperator(entry, [term]);
					if (s > bestScore) bestScore = s;
				}
				return { entry, score: bestScore };
			})
			.filter((r) => r.score > 0);
	}
	return scored;
}

function applyDeprecationPenalty(
	scored: Array<{ entry: TDKnowledgeEntry; score: number }>,
	versionManifest: VersionManifest,
	tdVersion: string,
): void {
	for (const r of scored) {
		if (r.entry.kind !== "operator") continue;
		const compat = versionManifest.checkCompatibility(
			r.entry.payload.versions,
			tdVersion,
		);
		if (compat.level === "deprecated") r.score -= 30;
	}
}

function createMissingOperatorCatalogResult(
	detailLevel: SearchOperatorsParams["detailLevel"],
	responseFormat: SearchOperatorsParams["responseFormat"],
) {
	const text = finalizeFormattedText(
		[
			"No local operator catalogue is available yet.",
			"",
			"Run refresh_operator_catalog with TouchDesigner connected to generate factual parameter metadata.",
			"Run index_td_offline_help with a local TouchDesigner OfflineHelp path to add descriptions from the user's installed documentation.",
			"",
			"The MCP live TouchDesigner tools still work; only offline operator search/compare is unavailable until a local catalogue exists.",
		].join("\n"),
		{ detailLevel: detailLevel ?? "summary", responseFormat },
		{
			structured: {
				actions: ["refresh_operator_catalog", "index_td_offline_help"],
				operatorCatalogueAvailable: false,
			},
		},
	);
	return { content: [{ text, type: "text" as const }] };
}

function runtimeOperatorToEntry(
	operator: RuntimeOperatorInfo,
): TDOperatorEntry {
	const title = operator.title ?? operator.opType;
	const parameters = operator.parameters.map((parameter) => ({
		clampMax: parameter.clampMax,
		clampMin: parameter.clampMin,
		default: parameter.default,
		isOP: parameter.isOP,
		label: parameter.label,
		max: parameter.max,
		menuLabels: parameter.menuLabels,
		menuNames: parameter.menuNames,
		min: parameter.min,
		name: parameter.name,
		page: parameter.page,
		readOnly: parameter.readOnly,
		style: parameter.style,
		val: parameter.val,
	}));
	return {
		content: {
			summary: `${operator.opType} ${operator.opFamily} metadata generated from the user's local TouchDesigner runtime.`,
			warnings: [
				"Runtime catalogue contains factual local metadata only; long documentation text is not redistributed.",
			],
		},
		id: operatorEntryIdFromOpType(operator.opType),
		kind: "operator",
		payload: {
			opFamily: operator.opFamily,
			opType: operator.opType,
			parameters,
		},
		provenance: {
			confidence: "high",
			license: "local-user-cache-not-redistributed",
			source: "runtime-introspection",
		},
		searchKeywords: buildOperatorKeywords(
			title,
			operator.opType,
			operator.opFamily,
			parameters,
		),
		title,
	};
}

function buildOperatorKeywords(
	title: string,
	opType: string,
	family: string,
	parameters: TDOperatorEntry["payload"]["parameters"],
): string[] {
	const words = `${title} ${opType} ${family}`
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length > 1);
	for (const parameter of parameters) {
		words.push(parameter.name.toLowerCase());
		if (parameter.label) words.push(parameter.label.toLowerCase());
		for (const menuName of parameter.menuNames ?? []) {
			words.push(menuName.toLowerCase());
		}
	}
	return [...new Set(words)].slice(0, 160);
}

function persistOperatorEntries(
	registry: KnowledgeRegistry,
	logger: ILogger,
	incoming: TDOperatorEntry[],
	tdBuild?: string | null,
	tdVersion?: string | null,
) {
	const existing = loadRuntimeOperatorEntries(tdBuild, logger);
	const merged = mergeOperatorEntryList(existing, incoming);
	const paths = saveRuntimeOperatorEntries(merged, tdBuild, tdVersion);
	for (const entry of merged) {
		registry.upsertEntry(entry);
	}
	return { ...paths, entries: merged };
}

function formatCatalogWriteResult(
	title: string,
	data: {
		cachePath: string;
		errorCount?: number;
		importedCount: number;
		latestPath: string;
		totalCached: number;
	},
	params: Pick<RefreshOperatorCatalogParams, "detailLevel" | "responseFormat">,
): string {
	const lines = [
		title,
		"",
		`Imported operators: ${data.importedCount}`,
		`Total cached operators: ${data.totalCached}`,
		`Cache: ${data.cachePath}`,
	];
	if (data.errorCount) {
		lines.push(`Probe/parse errors: ${data.errorCount}`);
	}
	return finalizeFormattedText(
		lines.join("\n"),
		{
			detailLevel: params.detailLevel ?? "summary",
			responseFormat: params.responseFormat,
		},
		{ structured: data },
	);
}

function buildRuntimeCatalogScript(
	opTypes: string[] | undefined,
	maxOperators: number,
): string {
	const requested = JSON.stringify(opTypes ?? null);
	return `
import inspect

_REQUESTED_OP_TYPES = ${requested}
_MAX_OPERATORS = ${maxOperators}
_SUFFIXES = ("CHOP", "SOP", "TOP", "DAT", "MAT", "COMP", "POP")

def _jsonable(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    try:
        return str(value)
    except Exception:
        return None

def _safe_attr(obj, name, default=None):
    try:
        return getattr(obj, name)
    except Exception:
        return default

def _family_from_type(op_type):
    for suffix in _SUFFIXES:
        if op_type.upper().endswith(suffix):
            return suffix
    return ""

def _par_info(par):
    page = _safe_attr(par, "page")
    return {
        "name": str(_safe_attr(par, "name", "")),
        "label": _jsonable(_safe_attr(par, "label")),
        "style": _jsonable(_safe_attr(par, "style")),
        "default": _jsonable(_safe_attr(par, "default")),
        "val": _jsonable(_safe_attr(par, "val")),
        "min": _jsonable(_safe_attr(par, "min")),
        "max": _jsonable(_safe_attr(par, "max")),
        "clampMin": _jsonable(_safe_attr(par, "clampMin")),
        "clampMax": _jsonable(_safe_attr(par, "clampMax")),
        "menuNames": _jsonable(_safe_attr(par, "menuNames", [])),
        "menuLabels": _jsonable(_safe_attr(par, "menuLabels", [])),
        "page": _jsonable(_safe_attr(page, "name") if page else None),
        "readOnly": _jsonable(_safe_attr(par, "readOnly")),
        "isOP": _jsonable(_safe_attr(par, "isOP")),
    }

def _discover_op_types():
    if _REQUESTED_OP_TYPES:
        return list(_REQUESTED_OP_TYPES)
    names = []
    for name in dir(td):
        if not name.endswith(_SUFFIXES):
            continue
        obj = _safe_attr(td, name)
        if inspect.isclass(obj):
            names.append(name)
    return sorted(set(names))

_root = op("/project1") or op("/")
_scratch_name = "__mcp_operator_catalog__"
_existing = _root.op(_scratch_name) if hasattr(_root, "op") else op(_root.path + "/" + _scratch_name)
if _existing:
    _existing.destroy()

_operators = []
_errors = []
_scratch = None
try:
    _base_type = _safe_attr(td, "baseCOMP", "baseCOMP")
    _scratch = _root.create(_base_type, _scratch_name)
    for _op_type in _discover_op_types()[:_MAX_OPERATORS]:
        _node = None
        try:
            _type_obj = _safe_attr(td, _op_type, _op_type)
            _node = _scratch.create(_type_obj, "probe")
            _actual_type = str(_safe_attr(_node, "OPType", _op_type))
            _family = str(_safe_attr(_node, "family", _family_from_type(_actual_type)))
            if "." in _family:
                _family = _family.rsplit(".", 1)[-1]
            _operators.append({
                "opType": _actual_type,
                "opFamily": _family or _family_from_type(_actual_type),
                "title": _actual_type,
                "parameters": [_par_info(par) for par in _node.pars()],
            })
        except Exception as probe_error:
            _errors.append({"opType": str(_op_type), "error": str(probe_error)})
        finally:
            if _node:
                try:
                    _node.destroy()
                except Exception:
                    pass
finally:
    if _scratch:
        try:
            _scratch.destroy()
        except Exception:
            pass

result = {
    "tdBuild": str(_safe_attr(td.app, "build", "")),
    "tdVersion": str(_safe_attr(td.app, "version", "")),
    "operators": _operators,
    "errors": _errors,
}
`;
}

export function registerSearchTools(
	server: McpServer,
	logger: ILogger,
	tdClient: TouchDesignerClient,
	registry: KnowledgeRegistry,
	versionManifest: VersionManifest,
	_fusionService: FusionService,
	serverMode: ServerMode,
): void {
	// ── search_operators ─────────────────────────────────────────
	server.tool(
		TOOL_NAMES.SEARCH_OPERATORS,
		"Search the operator knowledge base with scored results. Works offline.",
		searchOperatorsSchema.strict().shape,
		async (params: SearchOperatorsParams) => {
			try {
				const {
					detailLevel,
					family,
					includeExamples,
					maxResults = 10,
					query,
					responseFormat,
					version,
				} = params;

				const operators = registry.getByKind("operator");
				if (operators.length === 0) {
					return createMissingOperatorCatalogResult(
						detailLevel,
						responseFormat,
					);
				}

				const candidates = filterCandidates(
					operators,
					family,
					version,
					versionManifest,
				);
				const scored = scoreCandidates(candidates, query);
				const tdVersion = normalizeTdVersion(serverMode.tdBuild ?? "") ?? "";
				applyDeprecationPenalty(scored, versionManifest, tdVersion);

				scored.sort((a, b) => b.score - a.score);
				const results = scored.slice(0, maxResults);

				const text = formatOperatorSearchResults(
					query,
					results.map((r) => ({
						compatibility: versionManifest.checkCompatibility(
							r.entry.kind === "operator"
								? r.entry.payload.versions
								: undefined,
							tdVersion,
						),
						entry: r.entry,
						score: r.score,
					})),
					{
						detailLevel: detailLevel ?? "summary",
						includeExamples: includeExamples ?? false,
						responseFormat,
					},
				);

				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.SEARCH_OPERATORS);
			}
		},
	);

	// ── refresh_operator_catalog ─────────────────────────────────
	server.tool(
		TOOL_NAMES.REFRESH_OPERATOR_CATALOG,
		"Generate a local operator catalogue from the connected TouchDesigner runtime. Writes only to the user's local cache.",
		refreshOperatorCatalogSchema.strict().shape,
		withLiveGuard(
			TOOL_NAMES.REFRESH_OPERATOR_CATALOG,
			serverMode,
			tdClient,
			async (params: RefreshOperatorCatalogParams) => {
				try {
					const script = buildRuntimeCatalogScript(
						params.opTypes,
						params.maxOperators ?? 1000,
					);
					const result = await tdClient.execPythonScript<{
						result: RuntimeCatalogResult;
					}>({
						mode: "full-exec",
						script,
					});
					if (!result.success) throw result.error;

					const runtimeResult = result.data.result;
					const entries = runtimeResult.operators.map(runtimeOperatorToEntry);
					const persisted = persistOperatorEntries(
						registry,
						logger,
						entries,
						runtimeResult.tdBuild ?? serverMode.tdBuild,
						runtimeResult.tdVersion,
					);

					const text = formatCatalogWriteResult(
						"Runtime operator catalogue refreshed.",
						{
							cachePath: persisted.cachePath,
							errorCount: runtimeResult.errors.length,
							importedCount: entries.length,
							latestPath: persisted.latestPath,
							totalCached: persisted.entries.length,
						},
						params,
					);
					return { content: [{ text, type: "text" as const }] };
				} catch (error) {
					return handleToolError(
						error,
						logger,
						TOOL_NAMES.REFRESH_OPERATOR_CATALOG,
					);
				}
			},
		),
	);

	// ── index_td_offline_help ────────────────────────────────────
	server.tool(
		TOOL_NAMES.INDEX_TD_OFFLINE_HELP,
		"Index the user's local TouchDesigner OfflineHelp HTML into the local operator cache. Does not redistribute Derivative content.",
		indexTdOfflineHelpSchema.strict().shape,
		async (params: IndexTdOfflineHelpParams) => {
			try {
				const result = indexOfflineHelpOperators({
					maxFiles: params.maxFiles,
					offlineHelpPath: params.offlineHelpPath,
				});
				const persisted = persistOperatorEntries(
					registry,
					logger,
					result.entries,
					serverMode.tdBuild,
					null,
				);
				const text = formatCatalogWriteResult(
					"Local TouchDesigner OfflineHelp indexed.",
					{
						cachePath: persisted.cachePath,
						errorCount: result.errors.length,
						importedCount: result.entries.length,
						latestPath: persisted.latestPath,
						totalCached: persisted.entries.length,
					},
					params,
				);
				return { content: [{ text, type: "text" as const }] };
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.INDEX_TD_OFFLINE_HELP);
			}
		},
	);

	// ── compare_operators ────────────────────────────────────────
	server.tool(
		TOOL_NAMES.COMPARE_OPERATORS,
		"Compare two operators side-by-side (parameters, family, version). Works offline, enriched when TD is connected.",
		compareOperatorsSchema.strict().shape,
		async (params: CompareOperatorsParams) => {
			try {
				const { detailLevel, op1, op2, responseFormat } = params;

				if (registry.getByKind("operator").length === 0) {
					return {
						...createMissingOperatorCatalogResult(detailLevel, responseFormat),
						isError: true,
					};
				}

				const entry1 = lookupOperator(registry, op1);
				const entry2 = lookupOperator(registry, op2);

				if (!entry1 || entry1.kind !== "operator") {
					return {
						content: [
							{
								text: `Operator not found: "${op1}". Use search_operators to find available operators.`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}
				if (!entry2 || entry2.kind !== "operator") {
					return {
						content: [
							{
								text: `Operator not found: "${op2}". Use search_operators to find available operators.`,
								type: "text" as const,
							},
						],
						isError: true,
					};
				}

				const tdVersion = normalizeTdVersion(serverMode.tdBuild ?? "");

				const text = formatOperatorComparison(
					entry1,
					entry2,
					{
						compat1: versionManifest.checkCompatibility(
							entry1.payload.versions,
							tdVersion,
						),
						compat2: versionManifest.checkCompatibility(
							entry2.payload.versions,
							tdVersion,
						),
					},
					{
						detailLevel: detailLevel ?? "summary",
						responseFormat,
					},
				);

				return {
					content: [{ text, type: "text" as const }],
				};
			} catch (error) {
				return handleToolError(error, logger, TOOL_NAMES.COMPARE_OPERATORS);
			}
		},
	);
}
