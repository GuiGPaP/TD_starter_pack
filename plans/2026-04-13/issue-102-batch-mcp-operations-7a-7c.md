<!-- session_id: 96641d29-5b0f-4e31-b8ec-c824dd2d54d9 -->
# Issue #102 — Batch MCP operations (7a + 7c)

## Context

MCP tools `get_td_context` and `get_td_nodes` accept only a single path. When Claude needs context for N nodes, it makes N sequential calls. Adding optional array params reduces round-trips.

7b (field selection) already done. 7d (token estimate) skipped as over-engineering.

## Approach: TS-side loop, Python API unchanged

No Python/OpenAPI changes. The TS handler accepts an optional array, loops calls to the existing single-path tdClient method, and aggregates results.

### 7a. get_td_context multi-path

**File: `_mcp_server/src/features/tools/handlers/tdTools.ts`**

1. Extend schema with optional `nodePaths: z.array(z.string()).max(10).optional()`
2. In handler: if `nodePaths` provided, loop over paths calling `tdClient.getTdContext()` for each
3. Collect results into `Record<string, GetTdContext200Data>`
4. Format each result with `formatTdContext()` and join with separator

**File: `_mcp_server/src/features/tools/presenter/completionFormatter.ts`**

5. Add `formatTdContextMulti(results: Record<string, GetTdContext200Data>, options)` that iterates entries and calls existing `formatTdContext` per entry, joining with `---`

### 7c. Batch get_td_nodes

**File: `_mcp_server/src/features/tools/handlers/tdTools.ts`**

1. Extend schema with optional `parentPaths: z.array(z.string()).max(10).optional()`
2. In handler: if `parentPaths` provided, loop over paths calling `tdClient.getNodes()` for each
3. Collect results, format each with `formatNodeList()`, join with separator

**File: `_mcp_server/src/features/tools/presenter/nodeListFormatter.ts`**

4. Add `formatNodeListMulti(results: Array<{parentPath, data}>, options)` — iterates and joins

### Backward compatibility

- `nodePath` / `parentPath` (singular) still works as before
- `nodePaths` / `parentPaths` (plural) is optional, max 10
- If both singular and plural provided: use plural, ignore singular

## Files to modify

1. `_mcp_server/src/features/tools/handlers/tdTools.ts` — schemas + handlers
2. `_mcp_server/src/features/tools/presenter/completionFormatter.ts` — multi formatter
3. `_mcp_server/src/features/tools/presenter/nodeListFormatter.ts` — multi formatter

## Verification

1. `cd _mcp_server && npm run lint:tsc`
2. `cd _mcp_server && npx biome check src/`
3. `cd _mcp_server && npm test`
