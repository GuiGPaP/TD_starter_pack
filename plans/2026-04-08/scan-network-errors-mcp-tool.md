<!-- session_id: 8f13e36d-2334-4fc7-b795-aa1b11a2b2e0 -->
# Plan: `scan_network_errors` MCP Tool

## Context

The MCP server has no tool to scan errors/warnings across an entire TD network. `get_td_node_errors` targets a single node and parses the fragile string output of `node.errors(recurse=True)`. We need a dedicated diagnostic tool that walks the operator tree and returns a structured report of all errors and warnings — similar to how `get_performance` scans for expensive operators.

## Approach

Follow the **perfTools.ts pattern** exactly: inline Python script with placeholders → build function → Zod schema → `execPythonScript(read-only)` → JSON parse → markdown formatter.

## Files to Modify

### 1. `_mcp_server/src/core/constants.ts` — Add constant

Add `SCAN_NETWORK_ERRORS: "scan_network_errors"` to `TOOL_NAMES` (alphabetically after `SCAN_FOR_LESSONS`).

### 2. `_mcp_server/src/features/tools/handlers/errorScanTools.ts` — NEW file

**Python script** (`ERROR_SCAN_SCRIPT`):
- `findChildren(maxDepth=N)` on the scope root, cap at 500 ops
- Call `.errors()` on each operator → record as `severity: "error"`
- Try `.warnings()` too → catch `AttributeError` once, then stop trying (flag `warningsSupported`)
- Return JSON: `{totalScanned, truncated, errorCount, warningCount, warningsSupported, issues: [{path, name, opType, family, severity, message}]}`

**Parameters** (Zod, inline):
- `scope` (string, default `"/project1"`) — root path to scan
- `maxDepth` (number 1-20, default 5) — recursion depth
- `includeWarnings` (boolean, default true)

**Formatter** (`formatErrorScanResult`):
- Summary header: scope, depth, scanned count, error/warning counts
- Errors table: `| Operator | Type | Message |`
- Warnings table (if any)
- Notes for truncation or missing `.warnings()` API
- Escape `|` and newlines in messages for valid markdown tables

### 3. `_mcp_server/src/features/tools/register.ts` — Wire it up

- Import `registerErrorScanTools` (line ~17, alphabetically after `registerExecLogTools`)
- Call `registerErrorScanTools(server, logger, tdClient, serverMode)` after `registerPerfTools` (line ~56)

## Verification

1. `cd _mcp_server && npm run build` — must compile clean
2. `cd _mcp_server && npm test` — existing tests pass
3. Live test: call `scan_network_errors` with scope `/project1` via MCP and verify structured output
4. Edge cases: empty network (0 errors), network with errors, invalid scope path
