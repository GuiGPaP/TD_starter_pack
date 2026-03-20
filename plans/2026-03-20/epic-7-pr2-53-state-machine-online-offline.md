<!-- session_id: 79ae10db-135e-4ab3-893b-113b6518f1bb -->
# Epic 7 PR2 (#53) — State machine online/offline

## Context

PR1 livré : resources `td://modules` + `td://modules/{id}` fonctionnent offline. Mais les 36 tools échouent tous quand TD n'est pas lancé, avec un timeout/retry 60s. Pas de distinction entre tools offline et tools nécessitant TD.

**Objectif :** Serveur démarre sans TD, tools offline marchent immédiatement, tools live retournent une erreur claire (pas un timeout), et quand TD se connecte tout s'enrichit automatiquement.

## Décisions structurantes

1. **Pas de SDK `disable()`** — il cache le tool du listing `tools/list` (mcp.js:68-69). L'issue demande "visible-but-disabled". On garde tous tools enabled, erreur claire côté handler.

2. **Séparation offline ≠ incompatible** — `verifyVersionCompatibility()` (touchDesignerClient.ts:822) peut échouer soit par erreur réseau (AxiosError → offline), soit par incompatibilité version (TD joignable mais trop vieux). Seules les erreurs réseau déclenchent `transitionOffline()`. L'incompatibilité reste une erreur normale, pas un changement de mode.

3. **Probe mechanism** — Les guards offline ne bloquent PAS `verifyCompatibility()`. Le guard intercepte **après** le `verifyCompatibility()` call, pas avant. Quand un tool live est appelé en mode `docs-only`, le handler appelle quand même `tdClient.xxx()` qui passe par `verifyCompatibility()` → si TD est revenu, `transitionOnline()` est appelée et le tool continue normalement. Si TD n'est pas là, l'erreur TTL-cached (60s) est retournée. **Alternative probe-first (retenue)** : pas de guard bloquant. On ajoute le mode info dans la réponse d'erreur quand offline, mais on laisse les tools tenter l'appel. Cela permet la détection automatique du retour online.

   **Correction majeure :** Le guard ne court-circuite PAS avant l'appel API. À la place, le guard agit après la levée d'erreur par `verifyCompatibility()` : il transforme l'erreur en message clair avec mode info au lieu du message réseau brut. Le chemin reste : handler → tdClient.method() → verifyCompatibility() → transitionOnline/Offline → succès ou throw → handler catch enrichit le message.

4. **`deploy_td_asset` dryRun** — Le chemin dryRun (assetTools.ts:229) est purement local. Le guard ne s'applique pas au dryRun, seulement à l'exécution réelle.

5. **`get_capabilities` offline** — Passe par `formatCapabilities()` comme en online. On enrichit le formatter avec `mode`/`tdBuild` fields. Pas de JSON brut.

6. **Tests dans le client existant** — Ajouter des cas dans `touchDesignerClient.mock.test.ts` pour les transitions d'état : offline → online, online → offline, "reachable but incompatible" ne change PAS le mode.

## Machine d'états

```
DOCS_ONLY  ──(verifyCompatibility success)──→  LIVE
   ↑                                             │
   └──────(AxiosError in verifyVersionCompat)────┘
```

- **DOCS_ONLY** : état initial. Resources OK. Tools appellent tdClient normalement mais `verifyCompatibility()` throw (cached) → handler enrichit l'erreur avec mode info.
- **LIVE** : TD connecté. Tout fonctionne normalement.
- **HYBRID** : défini dans l'enum mais non atteignable en PR2.

**Transition online :** Déclenchée dans `verifyCompatibility()` quand `verifyVersionCompatibility()` retourne `success` (ligne 372-387). Appelle `serverMode.transitionOnline(tdBuild)`.

**Transition offline :** Déclenchée dans `verifyVersionCompatibility()` (ligne 822-856) quand une `AxiosError` est attrapée (réseau). NE PAS déclencher sur les erreurs de compatibilité (version mismatch = TD joignable mais incompatible, le mode reste `live`).

---

## Étape 1 — ServerMode (`src/core/serverMode.ts`)

```typescript
import { EventEmitter } from "node:events";

export type ServerModeValue = "docs-only" | "hybrid" | "live";

export class ServerMode extends EventEmitter {
  private _mode: ServerModeValue = "docs-only";
  private _tdBuild: string | null = null;

  get mode(): ServerModeValue
  get tdBuild(): string | null

  transitionOnline(tdBuild?: string): void
    // docs-only → live, émet "modeChanged". Idempotent.

  transitionOffline(): void
    // live/hybrid → docs-only, clear tdBuild, émet "modeChanged". Idempotent.

  toJSON(): { mode: ServerModeValue; tdBuild: string | null }
}
```

## Étape 2 — Constantes (`src/core/constants.ts`)

```typescript
export const OFFLINE_TOOLS: ReadonlySet<string> = new Set([
  TOOL_NAMES.DESCRIBE_TD_TOOLS,
  TOOL_NAMES.SEARCH_TD_ASSETS,
  TOOL_NAMES.GET_TD_ASSET,
  TOOL_NAMES.GET_CAPABILITIES,
]);
```

## Étape 3 — Intégrer ServerMode dans TouchDesignerClient

**Modifier :** `src/tdClient/touchDesignerClient.ts`

- Ajouter `serverMode?: ServerMode` au constructeur params
- Dans `verifyCompatibility()` après succès (ligne 386) : `this.serverMode?.transitionOnline()`
- Dans `verifyVersionCompatibility()` :
  - Ligne 826 catch AxiosError → `this.serverMode?.transitionOffline()` **avant** return
  - Ligne 886 `result.level === "error"` → **NE PAS** appeler transitionOffline (c'est une incompatibilité, TD est joignable)
  - Ligne 858 `!tdInfoResult.success` → vérifier si c'est réseau ou API. Si API response parsing error, pas de transition.

**Modifier :** `src/tdClient/index.ts`
- Ajouter `serverMode?: ServerMode` à `CreateTouchDesignerClientParams` et forward

## Étape 4 — Enrichir `handleToolError` avec mode info

**Modifier :** `src/core/errorHandling.ts`

Enrichir `handleToolError()` pour inclure le mode quand disponible :

```typescript
export function handleToolError(
  error: unknown,
  logger: ILogger,
  toolName: ToolNames,
  options?: { serverMode?: ServerMode; referenceComment?: string },
): ErrorResponse {
  // ... existing error formatting ...

  // Si mode docs-only, ajouter un hint
  if (options?.serverMode?.mode === "docs-only") {
    formattedMessage += "\n\n💡 Mode: docs-only — static resources (td://modules) are available offline.";
  }

  return { isError: true, content: [{ type: "text", text: formattedMessage }] };
}
```

**Pas de guard bloquant :** les tools live appellent toujours `tdClient.xxx()` normalement. La transition se fait dans `verifyCompatibility()`. L'erreur est enrichie avec le mode dans le catch handler.

## Étape 5 — Modifier les handlers pour passer serverMode à handleToolError

**Modifier :** `src/features/tools/handlers/tdTools.ts`

- Accepter `serverMode: ServerMode` comme paramètre de `registerTdTools()`
- Pour chaque tool live, modifier le catch :

```typescript
} catch (error) {
  return handleToolError(error, logger, TOOL_NAMES.GET_TD_INFO, { serverMode });
}
```

- Pour les tools offline (`describe_td_tools`) : pas de changement
- Pour `get_capabilities` : voir étape 6

**Modifier :** `src/features/tools/handlers/assetTools.ts`
- Accepter `serverMode` en paramètre
- `deploy_td_asset` : le guard ne s'applique qu'à l'exécution (pas au dryRun). Enrichir le catch avec serverMode.

## Étape 6 — Enrichir `get_capabilities` et son formatter

**Modifier :** `src/features/tools/handlers/tdTools.ts` — handler `GET_CAPABILITIES`

```typescript
server.tool(TOOL_NAMES.GET_CAPABILITIES, ..., async (params) => {
  const modeInfo = serverMode.toJSON();

  try {
    const result = await tdClient.getCapabilities();
    if (!result.success) throw result.error;
    // Merge mode info into response data
    const formattedText = formatCapabilities(result.data, {
      detailLevel: detailLevel ?? "summary",
      responseFormat,
      modeInfo,  // nouveau champ
    });
    return createToolResult(tdClient, formattedText);
  } catch (error) {
    if (serverMode.mode === "docs-only") {
      // Offline: retourner capabilities offline via le même formatter
      const formattedText = formatCapabilities(undefined, {
        detailLevel: detailLevel ?? "summary",
        responseFormat,
        modeInfo,
      });
      return { content: [{ text: formattedText, type: "text" as const }] };
    }
    return handleToolError(error, logger, TOOL_NAMES.GET_CAPABILITIES, { serverMode });
  }
});
```

**Modifier :** `src/features/tools/presenter/capabilitiesFormatter.ts`

Ajouter `modeInfo?: { mode: ServerModeValue; tdBuild: string | null }` aux options du formatter. Inclure les lignes mode dans toutes les branches (minimal, summary, detailed) :

```typescript
// Début du format
lines.push(`Mode: ${modeInfo.mode}`);
if (modeInfo.tdBuild) lines.push(`TD Build: ${modeInfo.tdBuild}`);
lines.push(`Online: ${modeInfo.mode !== "docs-only"}`);
```

## Étape 7 — Wiring serveur

**Modifier :** `src/server/touchDesignerServer.ts`

```diff
+ import { ServerMode } from "../core/serverMode.js";

  export class TouchDesignerServer {
+   readonly serverMode: ServerMode;

    constructor() {
+     this.serverMode = new ServerMode();
      // ... McpServer creation ...
-     this.tdClient = createTouchDesignerClient({ logger: this.logger });
+     this.tdClient = createTouchDesignerClient({
+       logger: this.logger,
+       serverMode: this.serverMode,
+     });
    }
  }
```

**Modifier :** `src/features/tools/register.ts`

```diff
+ import type { ServerMode } from "../../core/serverMode.js";

  export function registerTools(
    server: McpServer,
    logger: ILogger,
    tdClient: TouchDesignerClient,
+   serverMode: ServerMode,
  ): void {
-   registerTdTools(server, logger, tdClient);
+   registerTdTools(server, logger, tdClient, serverMode);
    // ... asset registry ...
-   registerAssetTools(server, logger, tdClient, registry);
+   registerAssetTools(server, logger, tdClient, registry, serverMode);
  }
```

**Modifier :** `touchDesignerServer.ts` — `registerAllFeatures()` :
```diff
-   registerTools(this.server, this.logger, this.tdClient);
+   registerTools(this.server, this.logger, this.tdClient, this.serverMode);
```

---

## Étape 8 — Tests

### Nouveau : `tests/unit/serverMode.test.ts`
- État initial = `docs-only`, tdBuild = null
- `transitionOnline("2023.12345")` → mode `live`, tdBuild set, émet `modeChanged`
- `transitionOnline()` quand déjà `live` → pas d'event
- `transitionOffline()` → mode `docs-only`, tdBuild = null, émet `modeChanged`
- `transitionOffline()` quand déjà `docs-only` → pas d'event
- `toJSON()` retourne `{ mode, tdBuild }`

### Ajouter à : `tests/unit/touchDesignerClient.mock.test.ts`
- **docs-only → live** : mock `getTdInfo` retourne succès compatible → `serverMode.mode === "live"`
- **live → docs-only** : mock `getTdInfo` throw AxiosError(ECONNREFUSED) → `serverMode.mode === "docs-only"`
- **Reachable but incompatible** : mock `getTdInfo` retourne succès avec version incompatible → mode reste `live` (ou `docs-only` si jamais connecté, mais ne transitionne PAS à cause de l'incompatibilité)
- **TTL cache clear → re-probe** : après 60s simulé, le prochain call retente → si TD est revenu, transition online

### Nouveau : `tests/unit/resources/offlineCapabilities.test.ts`
- `get_capabilities` en mode `docs-only` → retourne formatted text avec `Mode: docs-only`, pas de throw
- `get_capabilities` en mode `live` → retourne capabilities TD + mode info
- `handleToolError` avec serverMode `docs-only` → message enrichi avec hint offline

### Modifier : `tests/unit/touchDesignerServer.test.ts`
- Vérifier que `ServerMode` est instancié
- Mock factory reçoit `serverMode`

---

## Fichiers

**Nouveau (submodule) :**
```
src/core/serverMode.ts
tests/unit/serverMode.test.ts
tests/unit/resources/offlineCapabilities.test.ts
```

**Modifiés (submodule) :**
```
src/core/constants.ts                              (+OFFLINE_TOOLS)
src/core/errorHandling.ts                          (+mode hint in handleToolError)
src/tdClient/touchDesignerClient.ts                (+serverMode param, transitions)
src/tdClient/index.ts                              (+serverMode in factory)
src/features/tools/handlers/tdTools.ts             (+serverMode param, pass to handleToolError, get_capabilities offline)
src/features/tools/handlers/assetTools.ts          (+serverMode param, pass to handleToolError)
src/features/tools/register.ts                     (+serverMode forwarding)
src/features/tools/presenter/capabilitiesFormatter.ts (+modeInfo rendering)
src/server/touchDesignerServer.ts                  (+ServerMode creation, pass to factory+tools)
tests/unit/touchDesignerClient.mock.test.ts        (+state transition tests)
tests/unit/touchDesignerServer.test.ts             (+ServerMode assertions)
```

## Vérification

| Check | Commande |
|-------|----------|
| Types | `cd _mcp_server && npx tsc --noEmit` |
| Lint | `cd _mcp_server && npm run lint` |
| Tests unit | `cd _mcp_server && npm run test:unit` |
| Offline : capabilities | Sans TD → `get_capabilities` retourne `Mode: docs-only` (formatted) |
| Offline : describe_tools | Sans TD → `describe_td_tools` fonctionne normalement |
| Offline : tool live | Sans TD → `create_td_node` → erreur enrichie avec mode hint |
| Online : capabilities | Avec TD → `get_capabilities` retourne `Mode: live` + TD capabilities |
| Online : tous tools | Avec TD → fonctionnement normal inchangé |
| Transition retour | Arrêter TD → prochain tool live → erreur + mode `docs-only`. Relancer TD → prochain tool live → succès + mode `live` |
| Incompatible | TD joignable mais version incompatible → erreur version, mode ne change PAS |

## Hors scope PR2

- PR3 (#54) — enrichissement live des resources
- Reconnection automatique (#77)
- UI client (#79)
- État HYBRID actif (PR3)
