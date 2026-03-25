<!-- session_id: 784494b1-bc97-4e53-9e05-ab5b4402980b -->
# Issues #85 + #90 — Network templates + Experimental builds

## Context

Two Epic 13 knowledge base items. #85 adds deployable network templates (search/get/deploy), building on the workflow patterns architecture from #84 + the new `create_td_node`/`connect_nodes`/`layout_nodes` tools from #82/#100. #90 adds a lightweight experimental builds tracker.

---

# Part A: Issue #85 — Network templates

## Data: `_mcp_server/data/td-knowledge/templates/*.json`

Same knowledge entry schema pattern. Each template includes operators with positions, connections, and parameter overrides.

New kind: `"template"` in discriminated union.

### Template payload schema

```typescript
payload: {
  category: string,
  difficulty: "beginner" | "intermediate" | "advanced",
  operators: [{ name, opType, family, x?, y?, role? }],
  connections: [{ from, to, fromOutput?, toInput?, note? }],
  parameters?: { [operatorName]: { [paramName]: value } },
  tags: string[],
}
```

### ~8 template files

video-player, generative-art, audio-reactive, data-visualization, particle-system, post-processing, feedback-loop, sop-to-top-pipeline

## Tools

| Tool | Type | Description |
|------|------|-------------|
| `search_network_templates` | Offline | Search by query/category/difficulty/tags |
| `get_network_template` | Offline | Full detail with operators, connections, params |
| `deploy_network_template` | **Live** | Create all ops, wire connections, set params in TD |

### Deploy logic (Python service method)

`deploy_network_template` in `api_service.py`:
1. Load template from registry by ID
2. Validate `parentPath` is a COMP
3. For each operator: `parent.create(opType, name)` with x/y positioning
4. For each connection: wire via `inputConnectors[].connect()`
5. For each parameter override: set `par.<name>.val = value`
6. Return summary: created ops, connections, errors

## Files

| File | Action |
|------|--------|
| `src/features/resources/types.ts` | Add template schemas + union case |
| `src/features/resources/registry.ts` | Add template matching + `getTemplateIndex()` |
| `data/td-knowledge/templates/*.json` | **New** — 8 templates |
| `src/features/tools/handlers/networkTemplateTools.ts` | **New** — 3 tool handlers |
| `src/features/tools/presenter/networkTemplateFormatter.ts` | **New** — formatters |
| `src/features/tools/presenter/index.ts` | Export formatters |
| `src/core/constants.ts` | 3 tool name constants |
| `src/features/tools/register.ts` | Register template tools |
| `modules/mcp/services/api_service.py` | Add `deploy_network_template` method |

---

# Part B: Issue #90 — Experimental builds

## Data: `_mcp_server/data/td-builds/experimental-builds.json`

Single JSON file (NOT in td-knowledge — not a knowledge entry). Loaded directly by tool handler.

```json
[
  {
    "series": "2025.10000",
    "status": "active",
    "latestBuild": "2025.10500",
    "features": [{ "area": "rendering", "description": "..." }],
    "breakingChanges": ["..."],
    "newOperators": ["popforce"],
    "graduatedTo": null
  }
]
```

## Tools

| Tool | Type |
|------|------|
| `list_experimental_builds` | Offline — list/filter by area, status |
| `get_experimental_build` | Offline — detail of one series |

## Files

| File | Action |
|------|--------|
| `data/td-builds/experimental-builds.json` | **New** — build data |
| `src/features/tools/handlers/buildTools.ts` | **New** — 2 tool handlers |
| `src/features/tools/presenter/buildFormatter.ts` | **New** — formatters |
| `src/features/tools/presenter/index.ts` | Export formatters |
| `src/core/constants.ts` | 2 tool name constants |
| `src/features/tools/register.ts` | Register build tools |

---

# Implementation order

1. **#90 first** (simpler, 30min) — builds data + 2 tools
2. **#85 second** (larger) — template schema + data + 3 tools + Python deploy

## Verification

- `tsc --noEmit` + `biome check` + `vitest run` — all clean
- `list_experimental_builds` → returns build series
- `search_network_templates` query="audio" → audio-reactive template
- `deploy_network_template` with TD live → operators created and wired
