import type { ILogger } from "../../core/logger.js";
import type { ServerMode } from "../../core/serverMode.js";
import type { ParameterSchema } from "../../gen/endpoints/TouchDesignerAPI.js";
import type { TouchDesignerClient } from "../../tdClient/touchDesignerClient.js";
import { EnrichmentCache, PARAM_SCHEMA_TTL_MS } from "./enrichmentCache.js";
import type { KnowledgeRegistry } from "./registry.js";
import type {
	EnrichedOperatorEntry,
	EnrichedStaticOperatorParam,
	EnrichmentMeta,
	LiveParameter,
	TDOperatorEntry,
} from "./types.js";

/** Maximum depth for operator instance discovery in the TD project tree. */
export const DISCOVERY_MAX_DEPTH = 10;

interface FusionResult {
	entry: EnrichedOperatorEntry;
	_meta: EnrichmentMeta;
}

/**
 * Enriches static operator entries with live TD introspection data.
 *
 * - Offline (docs-only): returns static entry with _meta.source = "static"
 * - Online (live): discovers an instance of the operator in the project,
 *   fetches its parameter schema, merges with static data
 * - Caches enriched results with TTL, invalidates on mode/build change
 */
export class FusionService {
	private readonly cache = new EnrichmentCache<FusionResult>();
	private lastKnownBuild: string | null = null;

	constructor(
		private readonly registry: KnowledgeRegistry,
		private readonly tdClient: TouchDesignerClient,
		private readonly serverMode: ServerMode,
		private readonly logger: ILogger,
	) {
		this.serverMode.on("modeChanged", () => {
			this.cache.invalidateAll();
			this.logger.sendLog({
				data: "Enrichment cache invalidated (mode changed)",
				level: "debug",
				logger: "FusionService",
			});
		});
	}

	async getEntry(id: string): Promise<FusionResult | undefined> {
		const staticEntry = this.registry.getById(id);
		if (!staticEntry || staticEntry.kind !== "operator") {
			return undefined;
		}

		// Offline → static only
		if (this.serverMode.mode === "docs-only") {
			return toStaticResult(staticEntry);
		}

		// Build change → invalidate cache
		const currentBuild = this.serverMode.tdBuild;
		if (currentBuild !== this.lastKnownBuild) {
			this.cache.invalidateAll();
			this.lastKnownBuild = currentBuild;
		}

		// Cache hit
		const cached = this.cache.get(id);
		if (cached) {
			return cached;
		}

		// Live enrichment
		const result = await this.enrichFromLive(staticEntry);
		this.cache.set(id, result, PARAM_SCHEMA_TTL_MS);
		return result;
	}

	private async enrichFromLive(
		staticEntry: TDOperatorEntry,
	): Promise<FusionResult> {
		// Step 1: Discover an instance of this operator type
		const nodePath = await this.discoverInstance(staticEntry.payload.opType);
		if (!nodePath) {
			return toStaticResult(staticEntry);
		}

		// Step 2: Fetch live parameter schema
		let liveParams: ParameterSchema[];
		try {
			const result = await this.tdClient.getNodeParameterSchema({
				nodePath,
			});
			if (!result.success || !result.data?.parameters) {
				this.logger.sendLog({
					data: `Live param fetch failed for ${staticEntry.payload.opType} at ${nodePath}`,
					level: "warning",
					logger: "FusionService",
				});
				return toStaticResult(staticEntry);
			}
			liveParams = result.data.parameters;
		} catch {
			this.logger.sendLog({
				data: `Live param fetch threw for ${staticEntry.payload.opType}`,
				level: "warning",
				logger: "FusionService",
			});
			return toStaticResult(staticEntry);
		}

		// Step 3: Merge
		const enrichedEntry = mergeOperatorEntry(staticEntry, liveParams);
		const liveFields = identifyLiveFields(
			staticEntry.payload.parameters,
			liveParams,
		);

		return {
			_meta: {
				enrichedAt: new Date().toISOString(),
				liveFields,
				source: "hybrid",
				tdBuild: this.serverMode.tdBuild,
			},
			entry: enrichedEntry,
		};
	}

	private async discoverInstance(opType: string): Promise<string | null> {
		const script = `_root = op('/project1')
_children = _root.findChildren(maxDepth=${DISCOVERY_MAX_DEPTH})
result = None
for _c in _children:
    if _c.OPType == '${opType}':
        result = _c.path
        break`;

		try {
			const result = await this.tdClient.execPythonScript<{
				result: string | null;
			}>({ script });
			if (!result.success) {
				return null;
			}
			return result.data.result ?? null;
		} catch {
			return null;
		}
	}
}

function toStaticResult(entry: TDOperatorEntry): FusionResult {
	return {
		_meta: { source: "static" },
		entry: {
			...entry,
			payload: {
				...entry.payload,
				parameters: entry.payload.parameters.map((p) => ({ ...p })),
			},
		},
	};
}

/**
 * Merge static operator entry with live parameter schemas.
 *
 * - Static params enriched by matching on `name` (live wins on style/default/ranges/menu)
 * - Static-only params kept as-is
 * - Full live param array stored in payload.liveParameters
 */
export function mergeOperatorEntry(
	staticEntry: TDOperatorEntry,
	liveParams: ParameterSchema[],
): EnrichedOperatorEntry {
	const liveByName = new Map<string, ParameterSchema>();
	for (const lp of liveParams) {
		if (lp.name) {
			liveByName.set(lp.name, lp);
		}
	}

	const enrichedParams: EnrichedStaticOperatorParam[] =
		staticEntry.payload.parameters.map((sp) => {
			const live = liveByName.get(sp.name);
			if (!live) return { ...sp };

			const enriched: EnrichedStaticOperatorParam = {
				...sp,
				// Live wins on these fields (only override if present)
				...(live.style !== undefined && { style: live.style }),
				...(live.default !== undefined && { default: live.default }),
				...(live.val !== undefined && { val: live.val }),
				...(live.min !== undefined && { min: live.min }),
				...(live.max !== undefined && { max: live.max }),
				...(live.clampMin !== undefined && { clampMin: live.clampMin }),
				...(live.clampMax !== undefined && { clampMax: live.clampMax }),
				...(live.menuNames !== undefined && {
					menuNames: live.menuNames,
				}),
				...(live.menuLabels !== undefined && {
					menuLabels: live.menuLabels,
				}),
			};
			// Static wins on description
			return enriched;
		});

	const liveParameters: LiveParameter[] = liveParams.map((lp) => ({
		...lp,
	}));

	return {
		...staticEntry,
		payload: {
			...staticEntry.payload,
			liveParameters,
			parameters: enrichedParams,
		},
	};
}

function identifyLiveFields(
	staticParams: TDOperatorEntry["payload"]["parameters"],
	liveParams: ParameterSchema[],
): string[] {
	const staticNames = new Set(staticParams.map((p) => p.name));
	const fields: string[] = [];

	for (const lp of liveParams) {
		if (lp.name && staticNames.has(lp.name)) {
			fields.push(lp.name);
		}
	}

	if (liveParams.length > 0) {
		fields.push("liveParameters");
	}

	return fields;
}
