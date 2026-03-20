<!-- session_id: bcef65b7-df0f-4d99-838e-67ef82921184 -->
# Plan: Issue #54 — Fusion statique + live

## Context

Epic 7 PR1 delivered static MCP resources (`td://modules/{id}`) and PR2 added `ServerMode` (online/offline state machine). Issue #54 is the next step: when TD is connected, enrich static resource data with live introspection (parameter schemas, classes, build info).

Currently there are **no operator static fiches** — only Python module docs. We need to:
1. Add operator resource URIs + a few sample static fiches
2. Build a fusion layer that merges static + live data
3. Cache live results with TTL, invalidate on build change

All work happens in `_mcp_server/` submodule.

---

## Step 1: Extend types.ts — operator schema + enrichment meta

**File:** `src/features/resources/types.ts`

- Add `operatorPayloadSchema` with: `opType`, `opFamily`, `parameters[]` (static subset)
- Make `kind` a union: `"python-module" | "operator"`
- Add `enrichmentMetaSchema`: `{ source: "static"|"live"|"hybrid", enrichedAt?: string, tdBuild?: string, liveFields?: string[] }`
- Create `knowledgeEntryBaseSchema` (shared fields) + discriminated schemas per kind
- Export: `TDOperatorEntry`, `EnrichmentMeta`, updated `TDKnowledgeEntry` (union)

## Step 2: Add sample operator static fiches

**Directory:** `data/td-knowledge/operators/`

Create `glslTOP.json` (minimum for acceptance criteria) with:
- `kind: "operator"`, `id: "glsl-top"`, static description, warnings, examples
- Skeletal `parameters` (curated subset: `glslversion`, `outputresolution`, `outputformat`)

Optionally 1-2 more (e.g., `feedbackTOP.json`, `noiseTOP.json`) to validate the pattern.

## Step 3: Update loader to handle operator entries

**File:** `src/features/resources/loader.ts`

The loader already walks subdirectories generically. Only change: validate against the updated union schema (both `python-module` and `operator` kinds pass).

## Step 4: EnrichmentCache class

**New file:** `src/features/resources/enrichmentCache.ts`

Generic `EnrichmentCache<T>`:
- `get(key: string): CacheHit<T> | undefined`
- `set(key: string, value: T, ttlMs: number): void`
- `invalidateAll(): void`
- Internal: `Map<string, { value: T; expiresAt: number }>`
- Constants: `SCHEMA_TTL_MS = 5 * 60 * 1000`, `CLASSES_TTL_MS = 30 * 60 * 1000`

## Step 5: FusionService class

**New file:** `src/features/resources/fusionService.ts`

Constructor: `(registry, tdClient, serverMode, logger)`

Core method `getEntry(id: string): Promise<EnrichedKnowledgeEntry>`:
1. Get static entry from registry (may be undefined for live-only operators)
2. If `serverMode.mode === "docs-only"` → return static with `_meta: { source: "static" }`
3. If live → check cache → if miss, call `tdClient.getNodeParameterSchema({ nodePath: opType })`
4. Merge: static wins on `description`, `warnings`, `examples`; live wins on `parameters.type`, `.default`, `.menu`
5. Tag with `_meta: { source: "hybrid", enrichedAt, tdBuild, liveFields: [...] }`
6. Cache and return

Event listener on `serverMode "modeChanged"`:
- `"docs-only"` → invalidate cache
- `"live"` with new build → invalidate cache

Track `lastKnownBuild` to detect build changes mid-session.

## Step 6: Resource URI constants + operator resource handler

**File:** `src/core/constants.ts` — add:
```
OPERATORS_INDEX: "td://operators"
OPERATOR_DETAIL: "td://operators/{id}"
```

**New file:** `src/features/resources/handlers/operatorResources.ts`

Following `knowledgeResources.ts` pattern:
- `registerOperatorResources(server, logger, fusionService, registry)`
- `td://operators` → static index of operator-kind entries
- `td://operators/{id}` → async callback calling `fusionService.getEntry(id)` (returns static or hybrid)

## Step 7: Wire dependencies through

**File:** `src/features/resources/index.ts`
- `registerResources(server, logger, tdClient, serverMode)` — expanded signature
- Create `FusionService(registry, tdClient, serverMode, logger)`
- Call `registerOperatorResources(server, logger, fusionService, registry)`

**File:** `src/server/touchDesignerServer.ts`
- `registerResources(this.server, this.logger, this.tdClient, this.serverMode)`

## Step 8: Tests

**`tests/unit/resources/enrichmentCache.test.ts`:**
- TTL expiration, invalidateAll, cache hit/miss

**`tests/unit/resources/fusionService.test.ts`:**
- Offline → static entry with `_meta.source: "static"`
- Online → hybrid entry with live params merged
- Static fields preserved (description, warnings, examples)
- Cache hit on second call
- Cache invalidated on build change
- Graceful degradation: TD call fails → return static with warning

**`tests/unit/resources/operatorResources.test.ts`:**
- Resource registration (2 resources: index + template)
- Index returns operator entries
- Detail returns enriched entry (async)
- Unknown ID throws McpError

---

## Critical Files

| File | Action |
|------|--------|
| `src/features/resources/types.ts` | Modify — add operator schema + enrichment meta |
| `src/features/resources/loader.ts` | Modify — validate union schema |
| `src/features/resources/enrichmentCache.ts` | **New** |
| `src/features/resources/fusionService.ts` | **New** |
| `src/features/resources/handlers/operatorResources.ts` | **New** |
| `src/features/resources/index.ts` | Modify — wire tdClient, serverMode, fusionService |
| `src/core/constants.ts` | Modify — add OPERATORS_INDEX/DETAIL URIs |
| `src/server/touchDesignerServer.ts` | Modify — pass tdClient/serverMode to registerResources |
| `data/td-knowledge/operators/glslTOP.json` | **New** — sample static fiche |

## Merge Strategy (reference)

| Field | Static wins | Live wins |
|-------|------------|-----------|
| description | X | |
| warnings | X | |
| examples | X | |
| parameters.type | | X |
| parameters.menu | | X |
| parameters.default | | X |
| availability | | X |

## Verification

1. `npm run build` — compiles without errors
2. `npm test` — all tests pass (existing + new)
3. `npm run lint` — biome passes
4. Manual check: read `td://operators/glsl-top` resource in offline mode → static fiche
5. If TD connected: read `td://operators/glsl-top` → enriched with live params, `_meta.source: "hybrid"`
