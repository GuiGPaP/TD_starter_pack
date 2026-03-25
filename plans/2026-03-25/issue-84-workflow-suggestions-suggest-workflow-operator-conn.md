<!-- session_id: 784494b1-bc97-4e53-9e05-ab5b4402980b -->
# Issue #84 — Workflow suggestions: suggest_workflow + operator connections

## Context

The MCP server creates and connects nodes but doesn't guide **what to connect after what**. Issue #84 adds an offline knowledge base of workflow patterns and operator transitions, with 3 search/get tools. Follows the exact same architecture as operators/lessons/GLSL patterns/toolkits (discriminated union, registry, loader, search tools, formatters).

## Deliverables

1. **Data**: workflow pattern JSON files + transitions.json
2. **Schema**: Zod types for `workflow` kind in the discriminated union
3. **Registry**: `matchesQuery` support for workflow entries
4. **Tools**: `suggest_workflow`, `search_workflow_patterns`, `get_workflow_pattern`
5. **Formatter**: `workflowFormatter.ts`

---

## Step 1: Zod schemas in `types.ts`

**File:** `_mcp_server/src/features/resources/types.ts`

Add `workflowPatternPayloadSchema`:

```typescript
const workflowOperatorSchema = z.object({
  opType: z.string(),
  family: z.string(),
  role: z.string().optional(),
});

const workflowConnectionSchema = z.object({
  from: z.string(),
  to: z.string(),
  fromOutput: z.number().default(0),
  toInput: z.number().default(0),
});

const workflowPatternPayloadSchema = z.object({
  category: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  operators: z.array(workflowOperatorSchema),
  connections: z.array(workflowConnectionSchema),
  tags: z.array(z.string()).optional(),
});
```

Add `workflowPatternEntrySchema` extending `knowledgeEntryBaseSchema` with `kind: "workflow"`.

Add to discriminated union.

Export `TDWorkflowPatternEntry` type.

---

## Step 2: Registry `matchesQuery` for workflows

**File:** `_mcp_server/src/features/resources/registry.ts`

Add workflow-specific matching in `matchesQuery()`:
- Match against: category, difficulty, tags, operators (opType, family, role)

Add `getWorkflowIndex()` helper method to KnowledgeRegistry.

---

## Step 3: Transitions data + loader

**File:** `_mcp_server/data/td-knowledge/workflows/transitions.json`

Static file with operator transition suggestions:
```json
{
  "noiseTOP": {
    "downstream": [
      { "opType": "feedbackTOP", "family": "TOP", "port": 0, "reason": "Feedback loop for temporal evolution" }
    ],
    "upstream": [...]
  }
}
```

This file is NOT loaded by the registry (it's not a knowledge entry). It's loaded directly by the `suggest_workflow` tool handler.

---

## Step 4: Workflow pattern data files

**Directory:** `_mcp_server/data/td-knowledge/workflows/`

Create ~15 starter workflow patterns covering:
- Audio-reactive visuals (CHOP → TOP)
- Generative art (noise → feedback → composite)
- Data visualization (DAT → CHOP → instancing)
- Camera + render pipeline (SOP → COMP → TOP)
- Post-processing chains (TOP → TOP)
- Particle systems (POP/SOP → instancing)
- UI/control interfaces (CHOP → parameter export)

Each file follows the `workflowPatternPayloadSchema`.

---

## Step 5: Formatter

**New file:** `_mcp_server/src/features/tools/presenter/workflowFormatter.ts`

```typescript
export function formatWorkflowSearchResults(entries, options?): string
export function formatWorkflowDetail(entry, options?): string
export function formatSuggestWorkflow(suggestions, opType, options?): string
```

Export from `presenter/index.ts`.

---

## Step 6: Tool handlers

**New file:** `_mcp_server/src/features/tools/handlers/workflowTools.ts`

```typescript
export function registerWorkflowTools(
  server: McpServer,
  logger: ILogger,
  registry: KnowledgeRegistry,
  serverMode: ServerMode,
): void
```

### 3 tools:

**`suggest_workflow`** (offline)
- Input: `opType` or `family`
- Loads `transitions.json`, returns upstream/downstream suggestions with ports and reasons
- Also searches workflow patterns that include this operator

**`search_workflow_patterns`** (offline)
- Input: `query`, optional `category`, `difficulty`, `tags`
- Filters registry by kind="workflow", returns matches

**`get_workflow_pattern`** (offline)
- Input: `id`
- Returns full pattern detail (operators, connections, description)

---

## Step 7: Constants + registration

**File:** `_mcp_server/src/core/constants.ts`
```typescript
SUGGEST_WORKFLOW: "suggest_workflow",
SEARCH_WORKFLOW_PATTERNS: "search_workflow_patterns",
GET_WORKFLOW_PATTERN: "get_workflow_pattern",
```

**File:** `_mcp_server/src/features/tools/register.ts`
```typescript
registerWorkflowTools(server, logger, knowledgeRegistry, serverMode);
```

---

## Step 8: Build + test

- `tsc --noEmit` + `biome check --fix` + `ruff check`
- `vitest run` — all pass
- Manual: `search_workflow_patterns` with "audio" returns audio patterns
- Manual: `suggest_workflow` with "noiseTOP" returns transitions

---

## Critical files

| File | Action |
|------|--------|
| `_mcp_server/src/features/resources/types.ts` | Add workflow schemas + union case |
| `_mcp_server/src/features/resources/registry.ts` | Add workflow matching + index |
| `_mcp_server/data/td-knowledge/workflows/*.json` | **New** — ~15 pattern files |
| `_mcp_server/data/td-knowledge/workflows/transitions.json` | **New** — transition table |
| `_mcp_server/src/features/tools/handlers/workflowTools.ts` | **New** — 3 tool handlers |
| `_mcp_server/src/features/tools/presenter/workflowFormatter.ts` | **New** — formatters |
| `_mcp_server/src/features/tools/presenter/index.ts` | Export formatters |
| `_mcp_server/src/core/constants.ts` | 3 tool name constants |
| `_mcp_server/src/features/tools/register.ts` | Register workflow tools |

## Verification

1. `npm run build` — clean
2. `vitest run` — all pass
3. `search_workflow_patterns` query="audio" → audio-reactive patterns
4. `get_workflow_pattern` id="audio-reactive-visuals" → full detail
5. `suggest_workflow` opType="noiseTOP" → downstream/upstream suggestions
6. `suggest_workflow` family="CHOP" → CHOP-relevant workflows
