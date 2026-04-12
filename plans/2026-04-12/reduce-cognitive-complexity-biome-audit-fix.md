<!-- session_id: 96641d29-5b0f-4e31-b8ec-c824dd2d54d9 -->
# Reduce Cognitive Complexity — biome audit fix

## Context

biome reports 2 `noExcessiveCognitiveComplexity` errors (max 20):
1. **`projectCatalogTools.ts:852`** — bulk_package handler, complexity 60
2. **`projectCatalogFormatter.ts:86`** — `pushProjectSection`, complexity 27

These are pre-existing and block the stop hook. Goal: bring both under 20 with minimal disruption.

---

## Plan

### File 1: `_mcp_server/src/features/tools/handlers/projectCatalogTools.ts`

The bulk handler (lines 852–1110) does 5 distinct phases all inline. Extract each into a named helper:

#### A. `buildTargetList(scan, skipAlreadyPackaged)` → `{ targets, skippedProjects }`
- Lines 871–888
- Pure logic, no shared state
- Removes 2 for-loops + 1 if/else = ~4 complexity points

#### B. `buildDryRunResult(targets, projects, scan, warnings)` → early-return block
- Lines 890–929
- Move the dry-run for-loop + result construction into a helper
- ~2 complexity points

#### C. `reorderTargetsCurrentFirst(tdClient, targets, warnings)` → `{ originalProjectPath, originalProjectModified }`
- Lines 938–961
- Async, reads current project info, reorders targets in-place
- ~3 complexity points

#### D. `processTargets(...)` → `{ projects, aborted, switchedAway, consecutiveTimeouts }`
- Lines 963–1045 (the main for-loop)
- This is the biggest block (complexity ~20 alone). Sub-extract:
  - `handleModifiedProjectGuard(...)` — the unsaved-changes early break (lines 970–983)
  - `handleLoadFailure(...)` — the consecutive-timeout abort (lines 992–1018)
- The loop body calls these helpers, keeping the loop itself flat

#### E. `restoreOriginalProject(tdClient, ...)` → `restoredOriginalProject`
- Lines 1047–1066
- ~4 complexity points

After extraction, the handler becomes a flat orchestrator: call A → B (early return) → C → D → E → build result → format → return. Estimated remaining complexity: ~8-10.

### File 2: `_mcp_server/src/features/tools/presenter/projectCatalogFormatter.ts`

Extract `formatProjectLines(project, detailLevel): string[]` from the loop body (lines 96–121). `pushProjectSection` becomes:

```ts
function pushProjectSection(lines, heading, projects, detailLevel) {
  if (projects.length === 0) return;
  lines.push("", `${heading} (${projects.length}):`);
  for (const project of projects) {
    lines.push(...formatProjectLines(project, detailLevel));
  }
}
```

All the nested if-chains move into `formatProjectLines`. Estimated remaining complexity for `pushProjectSection`: ~3. `formatProjectLines` itself: ~10-12 (well under 20).

---

## Files to modify

1. `_mcp_server/src/features/tools/handlers/projectCatalogTools.ts` — extract helpers above the `server.tool(...)` call
2. `_mcp_server/src/features/tools/presenter/projectCatalogFormatter.ts` — extract `formatProjectLines`

## Verification

1. `cd _mcp_server && npm run lint:tsc` — type check
2. `cd _mcp_server && npx biome check src/` — must show 0 errors
3. `cd _mcp_server && npm test` — all tests pass
