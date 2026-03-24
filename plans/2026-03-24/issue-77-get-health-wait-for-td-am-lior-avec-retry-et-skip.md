<!-- session_id: fe4f6355-3fdb-4c08-9054-2c4f218c8a82 -->
# Issue #77 — get_health/wait_for_td amélioré avec retry et skip

## Context

The MCP server has no health check tool, no reconnection logic, and no skip-immediate on startup. When TD is absent, tools fail silently after a 5s timeout. This issue adds `get_health`, `wait_for_td`, faster reconnection, and non-blocking startup.

## Files to modify

| File | Change |
|------|--------|
| `_mcp_server/src/tdClient/touchDesignerClient.ts` | Add `healthProbe()`, `_lastSeen`/`_lastBuild` fields, reduce `ERROR_CACHE_TTL_MS` to 10s |
| `_mcp_server/src/core/constants.ts` | Add `GET_HEALTH`, `WAIT_FOR_TD` to `TOOL_NAMES` |
| `_mcp_server/src/features/tools/handlers/healthTools.ts` | **New** — `registerHealthTools()` with both tool handlers |
| `_mcp_server/src/features/tools/register.ts` | Wire `registerHealthTools()` |
| `_mcp_server/src/server/touchDesignerServer.ts` | Non-blocking startup probe |
| `_mcp_server/src/features/tools/metadata/touchDesignerToolMetadata.ts` | Metadata entries |
| `_mcp_server/tests/unit/tools/healthTools.test.ts` | **New** — handler tests |
| `_mcp_server/tests/unit/touchDesignerClient.mock.test.ts` | Add `healthProbe`, `lastSeen`, `lastBuild`, TTL tests |

---

## Step 1 — `healthProbe()` in TouchDesignerClient

**File:** `_mcp_server/src/tdClient/touchDesignerClient.ts`

Add private fields + public getters:
```ts
private _lastSeen: string | null = null;
private _lastBuild: string | null = null;
get lastSeen() { return this._lastSeen; }
get lastBuild() { return this._lastBuild; }
```

New method — calls `this.api.getTdInfo()` directly (bypasses `verifyCompatibility()` cache), follows `verifyVersionCompatibility()` error handling pattern:

```ts
async healthProbe(timeoutMs = 2000): Promise<{
  online: boolean;
  build: string | null;
  lastSeen: string | null;
  latencyMs: number;
  compatible: boolean | null;   // null = unknown (offline)
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
      return { online: true, build, lastSeen: this._lastSeen, latencyMs, compatible: null, error: result.error ?? null };
    }

    // Check version compatibility
    const apiVersion = result.data?.mcpApiVersion?.trim() || "";
    const compat = this.checkVersionCompatibility(MCP_SERVER_VERSION, apiVersion);
    const compatible = compat.level !== "error";

    return {
      online: true, build, lastSeen: this._lastSeen, latencyMs,
      compatible,
      error: compatible ? null : compat.message,
    };
  } catch (error) {
    // Only catch AxiosError (network/HTTP). Propagate programming errors.
    if (!axios.isAxiosError(error)) {
      throw error;
    }
    const latencyMs = Date.now() - start;
    this.serverMode?.transitionOffline();
    return {
      online: false, build: this._lastBuild, lastSeen: this._lastSeen, latencyMs,
      compatible: null, error: this.formatConnectionError(error.message),
    };
  }
}
```

Also update `verifyVersionCompatibility()` success path (~line 879-880) to set `this._lastSeen` and `this._lastBuild`.

Reduce `ERROR_CACHE_TTL_MS` from `60 * 1000` → `10 * 1000`.

---

## Step 2 — Tool constants

**File:** `_mcp_server/src/core/constants.ts`

Add to `TOOL_NAMES` (alphabetical):
```ts
GET_HEALTH: "get_health",
WAIT_FOR_TD: "wait_for_td",
```

---

## Step 3 — Tool handlers

**New file:** `_mcp_server/src/features/tools/handlers/healthTools.ts`

### `get_health`
- Schema: `{}` (no params)
- Calls `tdClient.healthProbe(2000)`, returns structured result
- No `verifyCompatibility()` gate — works in any server mode
- Target: <100ms online, <500ms offline (ECONNREFUSED is instant on localhost)

### `wait_for_td`
- Schema: `{ timeoutSeconds: z.number().min(1).max(120).default(30).optional() }`
- Sequential polling loop (not setInterval):

```ts
const deadline = Date.now() + timeoutSeconds * 1000;
while (Date.now() < deadline) {
  const health = await tdClient.healthProbe(2000);
  if (health.online) {
    // Refresh compat cache so subsequent tools work immediately
    await tdClient.invalidateAndProbe();
    // Re-probe to get final compatible state after cache refresh
    const final = await tdClient.healthProbe(2000);
    return { ...final, timedOut: false, ready: final.compatible === true };
  }
  await sleep(2000);
}
// Timeout
const lastHealth = await tdClient.healthProbe(2000);
return { ...lastHealth, timedOut: true, ready: false };
```

- If TD is reachable but incompatible: returns `{ online: true, compatible: false, ready: false, error: "..." }`
- Helper: `const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));`

---

## Step 4 — Wire in register.ts

**File:** `_mcp_server/src/features/tools/register.ts`

```ts
import { registerHealthTools } from "./handlers/healthTools.js";
// After registerTdTools():
registerHealthTools(server, logger, tdClient, serverMode);
```

No extra deps needed (no knowledgeRegistry, no assetRegistry).

---

## Step 5 — Non-blocking startup probe

**File:** `_mcp_server/src/server/touchDesignerServer.ts`

After `registerAllFeatures()` in constructor:
```ts
void this.tdClient.healthProbe(2000).catch(() => {
  // Stay in docs-only mode silently
});
```

Safe because: the logger fix (async .catch in McpLogger) is already in place, and `healthProbe` doesn't log before connection — it only calls `this.api.getTdInfo()` and updates state.

---

## Step 6 — Tool metadata

**File:** `_mcp_server/src/features/tools/metadata/touchDesignerToolMetadata.ts`

Add entries for both tools, category `"system"`, following existing pattern.

---

## Step 7 — Tests

### Handler tests: `_mcp_server/tests/unit/tools/healthTools.test.ts` (new)

Following pattern from `tests/unit/tools/glslPatternTools.test.ts`:
1. `get_health` online → `{ online: true, build, compatible: true }`
2. `get_health` offline → `{ online: false, compatible: null }`
3. `get_health` reachable but API error → `{ online: true, compatible: null }`
4. `wait_for_td` immediate success → no polling
5. `wait_for_td` success after retry → resolves after 2nd probe
6. `wait_for_td` timeout → `{ timedOut: true, ready: false }`
7. `wait_for_td` reachable but incompatible → `{ online: true, compatible: false, ready: false }`

### Client tests: `_mcp_server/tests/unit/touchDesignerClient.mock.test.ts` (extend)

1. `healthProbe()` calls `transitionOnline` on HTTP response
2. `healthProbe()` calls `transitionOffline` on AxiosError
3. `healthProbe()` propagates non-Axios errors (TypeError etc.)
4. `lastSeen`/`lastBuild` set on success, persisted on subsequent failure
5. `ERROR_CACHE_TTL_MS` is 10s (update any existing test that references 60s)

---

## Verification

```bash
cd _mcp_server && npm run build && npm run lint && npm test
```

Manual:
1. TD running → `get_health` → `online: true, compatible: true`
2. TD stopped → `get_health` → `online: false` (fast, <500ms)
3. TD stopped → `wait_for_td(timeoutSeconds=10)` → start TD → resolves with `ready: true`
4. Restart server without TD → starts instantly in docs-only → connect TD → `get_health` shows online
