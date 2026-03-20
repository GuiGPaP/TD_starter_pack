<!-- session_id: bcef65b7-df0f-4d99-838e-67ef82921184 -->
# Plan: Issue #54 — Fusion statique + live (PR3)

## Context

Epic 7 PR1 delivered static MCP resources (`td://modules/{id}`) and PR2 added `ServerMode` (online/offline state machine). Issue #54 enriches static resource data with live TD introspection when TD is connected.

**Critical constraint**: `getNodeParameterSchema` requires a real `nodePath` (`td.op(node_path)`) — there is no type-level introspection API. Live enrichment is therefore limited to operators that **already exist in the running TD project**.

**PR3 scope**: operators that have a static fiche AND are instanced in the project. Non-COMP built-ins only (COMPs may have custom params that don't reflect the "pure" type). No "live-only operators", no "classes" enrichment (deferred).

**Enriched resource shape**: `{ version: "1", entry: TDOperatorEntry, _meta: EnrichmentMeta }` — `_meta` is a sibling of `entry`, not nested inside it.

All work in `_mcp_server/` submodule.

---

## Step 1: Types + registry + knowledgeResources (single atomic step)

Three files must change together to avoid breaking the existing `td://modules` resources.

### 1a. `src/features/resources/types.ts` — discriminated union

- Extract shared base fields into `knowledgeEntryBaseSchema` (`id`, `title`, `aliases`, `content`, `provenance`, `searchKeywords`)
- Keep `pythonModuleEntrySchema` = base + `kind: "python-module"` + `payload: pythonModulePayloadSchema`
- Add `operatorPayloadSchema`: `{ opType: string, opFamily: string, parameters: StaticOperatorParam[] }`
  - `StaticOperatorParam`: `{ name: string, label?: string, style?: string, default?: unknown, description?: string }`
  - Note: static uses `style` (not `type`) to match the live API contract (`ParameterSchema.style`)
- Add `liveParameterSchema` mirroring the generated `ParameterSchema` interface exactly:
  `{ name, label, style, default: unknown, val: unknown, min, max, clampMin, clampMax, menuNames: string[], menuLabels: string[], isOP, readOnly, page }`
- Add `operatorEntrySchema` = base + `kind: "operator"` + `payload: operatorPayloadSchema`
- `knowledgeEntrySchema` = `z.discriminatedUnion("kind", [pythonModuleEntrySchema, operatorEntrySchema])`
- Add `enrichmentMetaSchema`: `{ source: "static"|"live"|"hybrid", enrichedAt?: string, tdBuild?: string | null, liveFields?: string[] }`
- Add `enrichedOperatorEntrySchema`: extends `operatorEntrySchema` with a `liveParameters` field (full `ParameterSchema[]` from live) alongside the static `parameters`
- Export: `TDKnowledgeEntry` (union), `TDPythonModuleEntry`, `TDOperatorEntry`, `EnrichmentMeta`, `EnrichedOperatorEntry`

### 1b. `src/features/resources/registry.ts` — kind-aware

- `getByKind(kind)` already works (string filter)
- Fix `matchesQuery()`: make it kind-aware — for `"python-module"` search `canonicalName` + `members[].name`; for `"operator"` search `opType` + `opFamily` + `parameters[].name`
- Add `getOperatorIndex()`: returns lightweight index filtered to `kind === "operator"`
- Add `getModuleIndex()`: returns lightweight index filtered to `kind === "python-module"`

### 1c. `src/features/resources/handlers/knowledgeResources.ts` — filter modules only

- `registerKnowledgeResources` uses `registry.getModuleIndex()` instead of `registry.getIndex()` for the `td://modules` static resource and the template's `list` callback
- Detail handler: keep `registry.getById(id)` but add a kind check — if the entry exists but `kind !== "python-module"`, throw `Module "${id}" not found`

### 1d. `src/features/resources/loader.ts`

- Already walks subdirectories — just ensure it validates against the new union schema (both `python-module` and `operator` pass Zod parse)

---

## Step 2: Operator static fiches

**Directory:** `data/td-knowledge/operators/`

Create `glsl-top.json` (filename matches `id`):
```json
{
  "id": "glsl-top",
  "title": "GLSL TOP",
  "kind": "operator",
  "aliases": ["glsltop", "shader top", "pixel shader"],
  "content": {
    "summary": "Runs custom GLSL fragment shaders for real-time image processing.",
    "warnings": ["Requires GLSL version matching your GPU driver."]
  },
  "provenance": { "source": "td-docs", "confidence": "high", "license": "Derivative" },
  "searchKeywords": ["glsl", "shader", "fragment", "pixel", "gpu", "post-processing"],
  "payload": {
    "opType": "glslTOP",
    "opFamily": "TOP",
    "parameters": [
      { "name": "glslversion", "label": "GLSL Version", "style": "Menu", "description": "GLSL language version" },
      { "name": "outputresolution", "label": "Output Resolution", "style": "Menu", "description": "Resolution mode" },
      { "name": "resolutionw", "label": "Resolution W", "style": "Int", "description": "Output width in pixels" },
      { "name": "resolutionh", "label": "Resolution H", "style": "Int", "description": "Output height in pixels" }
    ]
  }
}
```

Scope: non-COMP built-ins only (e.g., glslTOP, noiseTOP). Optionally add 1-2 more to validate the pattern.

---

## Step 3: Resource URI constants + operator resource handler

### 3a. `src/core/constants.ts`

Add:
```typescript
OPERATORS_INDEX: "td://operators",
OPERATOR_DETAIL: "td://operators/{id}",
```

### 3b. `src/core/errorHandling.ts` — update offline hint

Change the docs-only hint from `td://modules` to `td://modules, td://operators`.

### 3c. New file: `src/features/resources/handlers/operatorResources.ts`

Following `knowledgeResources.ts` pattern exactly:
- `registerOperatorResources(server, logger, registry, fusionService)`
- `td://operators` → `registry.getOperatorIndex()`
- `td://operators/{id}` → **async** callback: `fusionService.getEntry(id)` → returns `{ version: "1", entry, _meta }` or throws
- If `fusionService` returns `undefined`, throw `McpError(InvalidParams, "Operator not found")`
- Response shape: `{ version: "1", entry: EnrichedOperatorEntry, _meta: EnrichmentMeta }`

---

## Step 4: EnrichmentCache

**New file:** `src/features/resources/enrichmentCache.ts`

Generic `EnrichmentCache<T>`:
- `get(key: string): T | undefined` — returns value if not expired
- `set(key: string, value: T, ttlMs: number): void`
- `invalidateAll(): void`
- `size: number` (for tests)
- Internal: `Map<string, { value: T; expiresAt: number }>`
- Constant: `PARAM_SCHEMA_TTL_MS = 5 * 60 * 1000` (5 min)

No `CLASSES_TTL_MS` — classes are out of scope for PR3.

---

## Step 5: FusionService — live lookup strategy

**New file:** `src/features/resources/fusionService.ts`

### Constructor
```typescript
constructor(registry, tdClient, serverMode, logger)
```
- Listen to `serverMode.on("modeChanged")` → `invalidateAll()` on any transition
- Track `lastKnownBuild: string | null = null`

### `getEntry(id: string): Promise<{ entry: EnrichedOperatorEntry; _meta: EnrichmentMeta } | undefined>`

1. `registry.getById(id)` → if not found or `kind !== "operator"`, return `undefined`
2. If `serverMode.mode === "docs-only"` → return `{ entry, _meta: { source: "static" } }` (no `liveParameters`)
3. **Build change check**: if `serverMode.tdBuild !== lastKnownBuild` → `cache.invalidateAll()`, update `lastKnownBuild`
4. Check cache by `id` → if hit, return cached result
5. **Live lookup** (two-step: discover instance, then fetch schema):
   - **Discovery**: call `tdClient.execPythonScript` with a script following the `scan_script.py` pattern:
     ```python
     _root = op('/project1')
     _children = _root.findChildren(maxDepth=5)
     result = None
     for _c in _children:
         if _c.OPType == '{opType}':
             result = _c.path
             break
     ```
     Uses `op()` (available in exec scope per `api_service.py:557`), compares `OPType` string — no `eval()`.
   - If no instance found → return `{ version: "1", entry, _meta: { source: "static" } }` (graceful fallback)
   - If instance found → call `tdClient.getNodeParameterSchema({ nodePath: foundPath })`
   - If that call fails → return `{ version: "1", entry, _meta: { source: "static" } }` with warning log
6. **Merge**: `mergeOperatorEntry(staticEntry, liveParams)` (pure function)
7. Tag with `_meta: { source: "hybrid", enrichedAt: isoNow, tdBuild: serverMode.tdBuild, liveFields: [...] }`
8. Cache result, return

### `mergeOperatorEntry(static, liveParamSchemas: ParameterSchema[]): EnrichedOperatorEntry`

The enriched entry keeps **both** the curated static `parameters` and the full live `liveParameters`:

- `entry.payload.parameters` = static params (curated descriptions, preserved as-is)
- `entry.payload.liveParameters` = full `ParameterSchema[]` from live API (all fields: `name`, `label`, `style`, `default`, `val`, `min`, `max`, `clampMin`, `clampMax`, `menuNames`, `menuLabels`, `isOP`, `readOnly`, `page`)

For the static params, enrich them by matching on `name`:
- For each static param with a matching live param: live wins on `style`, `default` (now `unknown`, not `string`), add `menuNames`/`menuLabels`, `min`/`max`, `val`; static wins on `description`
- **Static-only params** (no live match): kept as-is
- **Live-only params**: available in `liveParameters` but NOT injected into static `parameters`

Entry-level `content.summary` and `content.warnings`: always static (no `examples` field — it doesn't exist in the current schema).

### Important: `"hybrid"` is a `_meta.source` value only

`ServerModeValue "hybrid"` on the state machine is NOT activated by this PR. The `_meta.source: "hybrid"` is purely a resource-level provenance marker.

---

## Step 6: Wire dependencies

### `src/features/resources/index.ts`

Expand signature:
```typescript
registerResources(server, logger, tdClient, serverMode)
```
- Create `KnowledgeRegistry` + `loadAll()` (unchanged)
- Create `FusionService(registry, tdClient, serverMode, logger)`
- Call `registerKnowledgeResources(server, logger, registry)` (modules — unchanged)
- Call `registerOperatorResources(server, logger, registry, fusionService)`

### `src/server/touchDesignerServer.ts`

```typescript
registerResources(this.server, this.logger, this.tdClient, this.serverMode);
```

---

## Step 7: Tests

### `tests/unit/resources/enrichmentCache.test.ts`
- Cache hit returns value before TTL
- Cache miss after TTL expiration
- `invalidateAll()` clears all entries
- `set` overwrites existing key

### `tests/unit/resources/fusionService.test.ts`
Mock `KnowledgeRegistry`, `TouchDesignerClient`, `ServerMode`.
- **Offline**: returns static entry with `_meta.source: "static"`
- **Online, no instance found** (execPythonScript returns null): returns static with `_meta.source: "static"`
- **Online, instance found**: returns hybrid entry with live params merged
- **Merge rules**: static `description` preserved, live `type`/`default` override, live-only params appended
- **Cache hit**: second call doesn't invoke tdClient
- **Build change**: invalidates cache (compare `serverMode.tdBuild` vs `lastKnownBuild`)
- **TD call failure**: graceful degradation → static with warning log

### `tests/unit/resources/operatorResources.test.ts`
Following `knowledgeResources.test.ts` pattern:
- Registers 2 resources (index + template)
- Index returns only operator entries
- Detail returns enriched entry (async)
- Unknown ID throws McpError

### Update `tests/unit/resources/knowledgeResources.test.ts`
- Verify `td://modules` index does NOT include operator entries when both kinds are in registry

---

## Critical Files

| File | Action |
|------|--------|
| `src/features/resources/types.ts` | Modify — discriminated union + enrichment meta |
| `src/features/resources/registry.ts` | Modify — kind-aware search + getModuleIndex/getOperatorIndex |
| `src/features/resources/handlers/knowledgeResources.ts` | Modify — filter to python-module only |
| `src/features/resources/loader.ts` | Modify — validate union schema |
| `src/core/constants.ts` | Modify — add operator URIs |
| `src/core/errorHandling.ts` | Modify — update offline hint |
| `data/td-knowledge/operators/glsl-top.json` | **New** — sample static fiche |
| `src/features/resources/enrichmentCache.ts` | **New** |
| `src/features/resources/fusionService.ts` | **New** |
| `src/features/resources/handlers/operatorResources.ts` | **New** |
| `src/features/resources/index.ts` | Modify — wire tdClient, serverMode, fusionService |
| `src/server/touchDesignerServer.ts` | Modify — pass dependencies |

## Merge Strategy (reference)

| Field | Static wins | Live wins | Notes |
|-------|------------|-----------|-------|
| entry.content.summary | X | | Curated |
| entry.content.warnings | X | | Curated |
| param.description | X | | Curated |
| param.style | | X | Real style from build |
| param.default (`unknown`) | | X | Real default from build |
| param.menuNames/menuLabels | | X | Real menu items from build |
| param.min/max/clampMin/clampMax | | X | Real ranges from build |
| param.val | | X | Current value |
| liveParameters (full array) | | X | All params from live, unmerged |

## Out of scope (deferred)

- Classes enrichment (`getClasses`/`getClassDetails`) → future PR
- Live-only operators (no static fiche) → requires new type-level API endpoint
- Activating `ServerModeValue "hybrid"` on the state machine
- Cache persistence between sessions

## Verification

1. `npm run build` — compiles
2. `npm test` — all tests pass (existing + new)
3. `npm run lint` — biome passes
4. Manual: `td://modules` index does NOT contain operator entries
5. Manual: `td://operators/glsl-top` offline → static fiche with `_meta.source: "static"`
6. Manual (TD connected): `td://operators/glsl-top` with a glslTOP instance in project → enriched with live params, `_meta.source: "hybrid"`
7. Manual (TD connected, no glslTOP instance): → static fiche, `_meta.source: "static"`
