<!-- session_id: c3cba092-b4ad-467c-91f6-f19055c51c4f -->
# Issue #78 — Mode docs-only (serveur MCP utilisable sans TD)

## Context

Le serveur MCP démarre déjà en mode `docs-only` (#77), mais les tools live échouent avec des timeouts réseau quand TD est absent. L'objectif : guard propre sur les tools live, probe opportuniste pour l'activation automatique, et banner de démarrage avec stats.

## Approche

- **Guard au niveau handler** — tous les tools restent visibles dans `tools/list`
- **Séparation état/présentation** — `ServerMode.isLive` (boolean) + helper externe pour construire la réponse MCP
- **Wrapper `withLiveGuard()`** — DRY, pas de copier-coller sur 33 handlers
- **Probe opportuniste** — le guard fait un `healthProbe()` rapide avant d'échouer, pour détecter TD qui est apparu entre-temps
- **Banner stderr** — `console.error` (pas McpLogger qui peut être silencieux avant connexion MCP)

---

## Changements

### 1. `src/core/serverMode.ts` — ajout `isLive` getter

```typescript
get isLive(): boolean {
    return this._mode === "live";
}
```

Pas de construction de réponse MCP ici — ServerMode reste un state machine pur.

### 2. `src/features/tools/toolGuards.ts` — nouveau fichier

Helper de guard + wrapper :

```typescript
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ServerMode } from "../../core/serverMode.js";
import type { TouchDesignerClient } from "../../tdClient/touchDesignerClient.js";

const GUARD_PROBE_TIMEOUT_MS = 1500;

function createDocsOnlyResult(toolName: string): CallToolResult {
    return {
        isError: true,
        content: [{
            type: "text",
            text: `${toolName}: Requires TouchDesigner connection.\n\n` +
                  `Server is in docs-only mode.\n\n` +
                  `Available actions:\n` +
                  `• get_health — check connection status\n` +
                  `• wait_for_td — wait for TD to come online\n` +
                  `• search_td_assets / search_glsl_patterns — browse offline catalogues\n` +
                  `• describe_td_tools — list all available tools`
        }]
    };
}

export function withLiveGuard<P>(
    toolName: string,
    serverMode: ServerMode,
    tdClient: TouchDesignerClient,
    handler: (params: P) => Promise<CallToolResult>,
): (params: P) => Promise<CallToolResult> {
    return async (params: P) => {
        if (serverMode.isLive) return handler(params);

        // Opportunistic probe — TD may have appeared since last check
        const probe = await tdClient.healthProbe(GUARD_PROBE_TIMEOUT_MS);
        if (probe.online) {
            // healthProbe already called serverMode.transitionOnline()
            return handler(params);
        }

        return createDocsOnlyResult(toolName);
    };
}
```

**Pourquoi le probe opportuniste :** Sans ça, le seul chemin docs-only→live serait get_health/wait_for_td. Avec le probe, un tool live détecte TD automatiquement. Le coût est ~1.5s max sur échec réseau (vs le timeout complet qu'on avait avant). Le `healthProbe()` appelle déjà `serverMode.transitionOnline()` en cas de succès (l.872), donc le mode se met à jour transparentement.

### 3. `src/features/tools/handlers/tdTools.ts` — wrapper sur 31 tools

Remplacer le pattern actuel :
```typescript
server.tool(TOOL_NAMES.GET_TD_INFO, "description", schema, async (params) => {
    try { ... } catch (error) { return handleToolError(...); }
});
```

Par :
```typescript
server.tool(TOOL_NAMES.GET_TD_INFO, "description", schema,
    withLiveGuard(TOOL_NAMES.GET_TD_INFO, serverMode, tdClient, async (params) => {
        try { ... } catch (error) { return handleToolError(...); }
    })
);
```

**31 tools à wrapper** (tous sauf DESCRIBE_TD_TOOLS et GET_CAPABILITIES qui sont offline-capable).

**2 tools SANS guard :**
- `DESCRIBE_TD_TOOLS` (l.253) — metadata statique locale
- `GET_CAPABILITIES` (l.329) — a son propre fallback docs-only (l.341)

### 4. `src/features/tools/handlers/assetTools.ts` — guard sur deploy_td_asset

Wrapper `deploy_td_asset` (l.160) avec `withLiveGuard`. Les 2 autres (search, get) restent offline.

### 5. `src/features/tools/handlers/glslPatternTools.ts` — guard sur deploy_glsl_pattern

Wrapper `deploy_glsl_pattern` (l.206) avec `withLiveGuard`. Les 2 autres (search, get) restent offline.

### 6. `src/server/touchDesignerServer.ts` — banner startup + mode transitions

**Surfacer les stats :** Modifier `registerAllFeatures()` pour retourner `{ knowledgeRegistry, assetRegistry }` (au lieu de ne retourner que `knowledgeRegistry` implicitement). Adapter `registerTools()` dans `register.ts` pour aussi retourner `assetRegistry`.

**Banner post-probe :** Modifier le health probe dans le constructeur :

```typescript
void this.tdClient.healthProbe(2000).then((health) => {
    if (health.online) {
        console.error(`[TD-MCP] TouchDesigner detected (build ${health.build ?? "unknown"})`);
    } else {
        this.logDocsOnlyBanner(stats);
    }
}).catch(() => {
    this.logDocsOnlyBanner(stats);
});
```

Où `logDocsOnlyBanner` écrit sur stderr :
```
[TD-MCP] Started in docs-only mode
[TD-MCP] N operators, M Python modules, K GLSL patterns, J assets loaded
[TD-MCP] Connect TouchDesigner to enable live tools (port 9981)
```

**Mode transitions :** Listener `modeChanged` sur stderr :
```typescript
this.serverMode.on("modeChanged", (mode) => {
    if (mode === "live") {
        console.error(`[TD-MCP] TouchDesigner connected (build ${this.serverMode.tdBuild}) — live tools enabled`);
    } else {
        console.error("[TD-MCP] TouchDesigner disconnected — docs-only mode");
    }
});
```

### 7. `src/features/tools/register.ts` — retourner assetRegistry

Modifier `registerTools()` pour retourner `{ assetRegistry }` afin que `touchDesignerServer.ts` puisse récupérer les stats.

### 8. Tests

**`tests/unit/serverMode.test.ts`** — ajouter :
- `isLive returns false initially`
- `isLive returns true after transitionOnline`

**`tests/unit/tools/toolGuards.test.ts`** — nouveau fichier :
- `withLiveGuard passes through when live` — handler exécuté
- `withLiveGuard probes and passes when TD appears` — mode docs-only, probe retourne online, handler exécuté
- `withLiveGuard returns error when TD is down` — mode docs-only, probe retourne offline, erreur structurée
- `guard error contains tool name and suggestions`
- **Cas critique : transition complète** — démarrage docs-only → healthProbe/transitionOnline → tool live autorisé → transitionOffline → tool live bloqué

---

## Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `src/core/serverMode.ts` | +getter `isLive` |
| `src/features/tools/toolGuards.ts` | **nouveau** — `withLiveGuard()` + `createDocsOnlyResult()` |
| `src/features/tools/handlers/tdTools.ts` | wrapper 31 tools avec `withLiveGuard` |
| `src/features/tools/handlers/assetTools.ts` | wrapper deploy_td_asset |
| `src/features/tools/handlers/glslPatternTools.ts` | wrapper deploy_glsl_pattern |
| `src/features/tools/register.ts` | retourner assetRegistry pour stats |
| `src/server/touchDesignerServer.ts` | banner stderr + mode transition logs |
| `tests/unit/serverMode.test.ts` | +2 tests isLive |
| `tests/unit/tools/toolGuards.test.ts` | **nouveau** — 5+ tests dont transition complète |

## Vérification

1. `cd _mcp_server && npm run build` — compile sans erreur
2. `npm test` — tous les tests passent
3. `npm run lint` — pas de regression
4. **Test manuel sans TD** :
   - Banner docs-only sur stderr avec stats
   - `get_health` → `{ online: false }`
   - `search_glsl_patterns` → fonctionne
   - `create_td_node` → erreur structurée "Requires TouchDesigner connection"
5. **Test manuel avec TD** :
   - Banner détecte TD au démarrage
   - Tous les tools live fonctionnent
6. **Test transition** :
   - Démarrer sans TD → banner docs-only
   - Lancer TD → appeler un tool live → probe opportuniste détecte TD → tool s'exécute
   - Banner "TouchDesigner connected" sur stderr
