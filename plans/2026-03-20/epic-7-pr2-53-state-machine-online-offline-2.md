<!-- session_id: 79ae10db-135e-4ab3-893b-113b6518f1bb -->
# Epic 7 PR2 (#53) — State machine online/offline

## Context

PR1 livré : resources `td://modules` fonctionnent offline. Les 36 tools échouent quand TD n'est pas lancé avec un timeout réseau non borné + retry caché 60s. Pas de mode explicite.

## Résolution findings

| # | Finding | Résolution |
|---|---------|------------|
| 1 | get_capabilities masque erreurs de compatibilité | `transitionOnline()` dès que HTTP répond (pas AxiosError). Le catch de get_capabilities distingue mode `docs-only` (→ offline status) vs mode `live` (→ handleToolError avec le vrai diagnostic). |
| 2 | Timeout global casse les tools lents | Timeout 5s uniquement sur le probe `getTdInfo` dans `verifyVersionCompatibility()`, pas global. |
| 3 | tdBuild indisponible | Extraire `tdInfoResult.data.version` et passer à `transitionOnline(tdBuild)`. |
| 4 | `!tdInfoResult.success` ≠ offline | Corrigé : si HTTP répond (même `success: false`), TD est reachable → `transitionOnline()`. L'erreur applicative reste une erreur (mode `live`). NB: `formatConnectionError()` est appelé sur ce path par le code existant — on garde ce comportement pour backward compat, seul le mode change. |
| 5 | Cache 60s bloque la récupération | `get_capabilities` = probe explicite via `invalidateAndProbe()`. Autres tools attendent le TTL. Documenté. |
| 6 | handleToolError casse les callers | 5ème arg optionnel. 4ème `referenceComment` préservé. |
| 7 | responseFormat json/yaml pas tenu offline | `formatCapabilities` passe `structured: modeInfo` dans `finalizeFormattedText` → json/yaml fonctionnels. |

## Sémantique du mode

**Mode = reachability HTTP**, pas health applicative :
- `transitionOnline()` = le HTTP call de `getTdInfo()` n'a PAS levé d'`AxiosError` (TD a répondu)
- `transitionOffline()` = `AxiosError` dans le catch de `getTdInfo()` (réseau échoué)
- `success: false` dans le body = TD a répondu avec une erreur applicative → mode reste `live` (ou passe à `live` si on était `docs-only`)
- Incompatibilité version = erreur normale, mode `live`

## Machine d'états

```
DOCS_ONLY  ──(getTdInfo no AxiosError)──→  LIVE
   ↑                                         │
   └──────(AxiosError in getTdInfo)──────────┘
```

- **DOCS_ONLY** : état initial + TD injoignable.
- **LIVE** : TD a répondu HTTP (peut être incompatible ou en erreur applicative).
- **HYBRID** : défini, non atteignable PR2.

**Récupération (comportement produit documenté) :**
- `get_capabilities` est le **seul tool de récupération immédiate** : il bypasse le cache d'erreur et re-probe TD. L'utilisateur (ou le LLM) peut appeler `get_capabilities` à tout moment pour forcer un re-check.
- **Tous les autres tools** restent soumis au cache d'erreur TTL (60s). Si TD revient, ils ne le détectent qu'après expiration du cache. C'est le comportement existant, inchangé.
- La reconnection automatique par polling est hors scope (#77).

---

## Étape 1 — ServerMode (`src/core/serverMode.ts`)

Nouveau fichier :

```typescript
import { EventEmitter } from "node:events";

export type ServerModeValue = "docs-only" | "hybrid" | "live";

export class ServerMode extends EventEmitter {
  private _mode: ServerModeValue = "docs-only";
  private _tdBuild: string | null = null;

  get mode(): ServerModeValue { return this._mode; }
  get tdBuild(): string | null { return this._tdBuild; }

  transitionOnline(tdBuild?: string): void {
    this._tdBuild = tdBuild ?? this._tdBuild;
    if (this._mode !== "live") {
      this._mode = "live";
      this.emit("modeChanged", this._mode);
    }
  }

  transitionOffline(): void {
    this._tdBuild = null;
    if (this._mode !== "docs-only") {
      this._mode = "docs-only";
      this.emit("modeChanged", this._mode);
    }
  }

  toJSON(): { mode: ServerModeValue; tdBuild: string | null } {
    return { mode: this._mode, tdBuild: this._tdBuild };
  }
}
```

## Étape 2 — Intégrer ServerMode dans TouchDesignerClient

**Modifier :** `src/tdClient/touchDesignerClient.ts`

### Constructor
Ajouter `serverMode?: ServerMode` au params.

### `verifyVersionCompatibility()` (ligne 822-894)

```typescript
async verifyVersionCompatibility() {
  let tdInfoResult;
  try {
    tdInfoResult = await this.api.getTdInfo({ timeout: 5000 });
  } catch (error) {
    if (!axios.isAxiosError(error)) throw error;
    // Network error → OFFLINE
    this.serverMode?.transitionOffline();
    const errorMessage = this.formatConnectionError(error.message || "Unknown");
    return createErrorResult(new Error(errorMessage));
  }

  // HTTP responded (even if success:false) → TD is REACHABLE → ONLINE
  const tdBuild = tdInfoResult.data?.version ?? null;
  this.serverMode?.transitionOnline(tdBuild ?? undefined);

  if (!tdInfoResult.success) {
    // Application-level error (TD responded but error in body)
    // Mode stays "live" — TD is reachable
    const errorMessage = this.formatConnectionError(tdInfoResult.error);
    return createErrorResult(new Error(errorMessage));
  }

  // Version compatibility check
  const apiVersionRaw = tdInfoResult.data?.mcpApiVersion?.trim() || "";
  const result = this.checkVersionCompatibility(MCP_SERVER_VERSION, apiVersionRaw);
  // ... existing log ...
  if (result.level === "error") {
    return createErrorResult(new Error(result.message)); // Mode stays "live"
  }
  return createSuccessResult({ level: result.level, message: result.message });
}
```

**Note timeout :** `getTdInfo` dans l'API générée (TouchDesignerAPI.ts:1651) accepte un 2ème argument `options?: AxiosRequestConfig`. On passe `{ timeout: 5000 }`. Les autres endpoints gardent le timeout par défaut (aucun).

### Nouveau : `invalidateAndProbe()`

```typescript
/**
 * Force a fresh compatibility probe, bypassing the error cache.
 * Used by get_capabilities for immediate recovery detection.
 */
async invalidateAndProbe(): Promise<void> {
  this.invalidateCompatibilityCache("manual probe");
  this.verifiedCompatibilityError = null;
  this.errorCacheTimestamp = null;
  await this.verifyCompatibility();
}
```

**Modifier :** `src/tdClient/index.ts`
- Ajouter `serverMode?: ServerMode` à `CreateTouchDesignerClientParams`, forward.

## Étape 3 — handleToolError (backward-compatible)

**Modifier :** `src/core/errorHandling.ts`

```typescript
export function handleToolError(
  error: unknown,
  logger: ILogger,
  toolName: ToolNames,
  referenceComment?: string,       // ← préservé, aucun caller ne change
  serverMode?: ServerMode,         // ← NEW 5ème arg optionnel
): ErrorResponse {
  // ... existing logic identique ...

  let errorMessage = `${toolName}: ${formattedError}${referenceComment ? `. ${referenceComment}` : ""}`;

  if (serverMode?.mode === "docs-only") {
    errorMessage += "\n\n💡 Mode: docs-only — static resources (td://modules) are available offline.";
  }

  return { content: [{ text: errorMessage, type: "text" as const }], isError: true };
}
```

## Étape 4 — Passer serverMode aux handlers

**Modifier :** `src/features/tools/handlers/tdTools.ts`

- `registerTdTools()` accepte `serverMode: ServerMode` en 4ème param
- Chaque catch des 33 tools : ajouter `serverMode` en 5ème arg

```typescript
// Sans REFERENCE_COMMENT (18 tools) :
return handleToolError(error, logger, TOOL_NAMES.XXX, undefined, serverMode);

// Avec REFERENCE_COMMENT (15 tools) :
return handleToolError(error, logger, TOOL_NAMES.XXX, REFERENCE_COMMENT, serverMode);
```

**Modifier :** `src/features/tools/handlers/assetTools.ts`
- `registerAssetTools()` accepte `serverMode` en 5ème param
- `deploy_td_asset` catch : ajouter `serverMode` en 5ème arg
- dryRun path (ligne 229) : inchangé

## Étape 5 — get_capabilities = probe + status

**Modifier :** `src/features/tools/handlers/tdTools.ts` — handler `GET_CAPABILITIES`

```typescript
server.tool(TOOL_NAMES.GET_CAPABILITIES, ..., async (params) => {
  const { detailLevel, responseFormat } = params;

  // Phase 1 : probe frais (bypasse le cache d'erreur)
  try {
    await tdClient.invalidateAndProbe();
  } catch (probeError) {
    const modeInfo = serverMode.toJSON();
    if (modeInfo.mode === "docs-only") {
      // Réseau échoué → retourner status offline via formatter
      const formattedText = formatCapabilities(undefined, {
        detailLevel: detailLevel ?? "summary",
        responseFormat,
        modeInfo,
      });
      return { content: [{ text: formattedText, type: "text" as const }] };
    }
    // TD joignable mais erreur (incompatibilité, etc.) → afficher le vrai diagnostic
    return handleToolError(probeError, logger, TOOL_NAMES.GET_CAPABILITIES, undefined, serverMode);
  }

  // Phase 2 : TD joignable → fetch full capabilities
  try {
    const result = await tdClient.getCapabilities();
    if (!result.success) throw result.error;
    const formattedText = formatCapabilities(result.data, {
      detailLevel: detailLevel ?? "summary",
      responseFormat,
      modeInfo: serverMode.toJSON(),
    });
    return createToolResult(tdClient, formattedText);
  } catch (error) {
    return handleToolError(error, logger, TOOL_NAMES.GET_CAPABILITIES, undefined, serverMode);
  }
});
```

## Étape 6 — capabilitiesFormatter

**Modifier :** `src/features/tools/presenter/capabilitiesFormatter.ts`

```typescript
type ModeInfo = { mode: string; tdBuild: string | null };
type FormatterOpts = Pick<FormatterOptions, "detailLevel" | "responseFormat"> & {
  modeInfo?: ModeInfo;
};

export function formatCapabilities(
  data: GetCapabilities200ResponseData | undefined,
  options?: FormatterOpts,
): string {
  const opts = mergeFormatterOptions(options);
  const modeInfo = options?.modeInfo;

  // Mode header lines
  const modeLines: string[] = [];
  if (modeInfo) {
    modeLines.push(`Mode: ${modeInfo.mode}`);
    modeLines.push(`Online: ${modeInfo.mode !== "docs-only"}`);
    if (modeInfo.tdBuild) modeLines.push(`TD Build: ${modeInfo.tdBuild}`);
  }
  const modeHeader = modeLines.length ? modeLines.join("\n") + "\n" : "";

  if (!data) {
    const text = modeHeader + "TD capabilities not available.";
    // Pass modeInfo as structured data for json/yaml responseFormat
    return finalizeFormattedText(text, opts, {
      context: { title: "Capabilities" },
      structured: modeInfo ? { ...modeInfo, online: modeInfo.mode !== "docs-only" } : undefined,
    });
  }

  // Existing rendering : prepend modeHeader before "Features:"
  if (opts.detailLevel === "minimal") {
    const parts: string[] = [];
    if (modeInfo) parts.push(`mode=${modeInfo.mode}`);
    // ... existing minimal parts ...
    return finalizeFormattedText(parts.join(", "), opts, {
      context: { title: "Capabilities" },
    });
  }

  const lines: string[] = [];
  if (modeHeader) lines.push(modeHeader);
  lines.push("Features:");
  // ... existing lines ...

  return finalizeFormattedText(lines.join("\n"), opts, {
    context: { title: "Capabilities" },
    structured: { ...(modeInfo ?? {}), ...data },
    template: opts.detailLevel === "detailed" ? "detailedPayload" : "default",
  });
}
```

## Étape 7 — Wiring serveur

**Modifier :** `src/server/touchDesignerServer.ts`
- `import { ServerMode }` + créer dans constructor
- Passer à `createTouchDesignerClient({ logger, serverMode })`
- Passer à `registerTools(server, logger, tdClient, serverMode)`

**Modifier :** `src/features/tools/register.ts`
- Accepter `serverMode` en 4ème param, forward aux deux register functions

---

## Étape 8 — Tests

### Nouveau : `tests/unit/serverMode.test.ts`
- État initial = `docs-only`, tdBuild = null
- `transitionOnline("2023.12345")` → `live`, tdBuild set, event
- Double `transitionOnline()` → pas de double event
- `transitionOffline()` → `docs-only`, tdBuild cleared, event
- Double `transitionOffline()` → pas de double event
- `toJSON()` shape

### Ajouter à : `tests/unit/touchDesignerClient.mock.test.ts`

**Sémantique clé :** Seul un `AxiosError` (throw, pas un return) déclenche `transitionOffline()`. Les tests existants avec `mockResolvedValue({success: false, error: "ECONNREFUSED..."})` modélisent un scénario où la couche API a répondu — dans le nouveau modèle, c'est `live`, pas `docs-only`. Les nouvelles assertions doivent refléter cela.

- **AxiosError → docs-only** : `getTdInfo` mock `.mockRejectedValue(new AxiosError("ECONNREFUSED"))` → `serverMode.mode === "docs-only"`
- **HTTP success compatible → live** : `getTdInfo` succès avec version compatible → `serverMode.mode === "live"`, `serverMode.tdBuild === "2023.12345"`
- **HTTP success:false → live (pas docs-only)** : `getTdInfo` retourne `{success: false, error: "..."}` → `serverMode.mode === "live"` car TD a répondu HTTP
- **Incompatible version → live** : `getTdInfo` succès, version majeure incompatible → mode `live` (TD joignable)
- **invalidateAndProbe bypasse cache** : error cached via AxiosError, `invalidateAndProbe()` → probe immédiat sans attendre TTL
- **Recovery via invalidateAndProbe** : AxiosError cached, mock switch to success, `invalidateAndProbe()` → `live`
- **Pas de modification des tests existants** : les tests de format d'erreur (ECONNREFUSED, ETIMEDOUT, etc.) restent — ils testent le message d'erreur, pas le mode

### Modifier : `tests/unit/touchDesignerServer.test.ts`
- `ServerMode` instancié et passé

---

## Fichiers

**Nouveau :**
```
src/core/serverMode.ts
tests/unit/serverMode.test.ts
```

**Modifiés :**
```
src/core/errorHandling.ts                              (+5ème param serverMode)
src/tdClient/touchDesignerClient.ts                    (+serverMode, transitions, invalidateAndProbe, timeout probe)
src/tdClient/index.ts                                  (+serverMode in factory)
src/features/tools/handlers/tdTools.ts                 (+serverMode, handleToolError 5ème arg, get_capabilities probe)
src/features/tools/handlers/assetTools.ts              (+serverMode, handleToolError 5ème arg)
src/features/tools/register.ts                         (+serverMode forwarding)
src/features/tools/presenter/capabilitiesFormatter.ts  (+modeInfo, structured data)
src/server/touchDesignerServer.ts                      (+ServerMode creation)
tests/unit/touchDesignerClient.mock.test.ts            (+6 transition tests)
tests/unit/touchDesignerServer.test.ts                 (+assertions)
```

## Vérification

| Check | Commande |
|-------|----------|
| Types | `cd _mcp_server && npx tsc --noEmit` |
| Lint | `cd _mcp_server && npm run lint` |
| Tests unit | `cd _mcp_server && npm run test:unit` |
| Timeout probe | Sans TD → tool live échoue en ~5s (timeout getTdInfo) |
| Error enrichie | Sans TD → tool live → erreur + "Mode: docs-only" hint |
| Capabilities offline | Sans TD → `get_capabilities` → "Mode: docs-only, Online: false" via formatter |
| Capabilities json | Sans TD → `get_capabilities(responseFormat=json)` → `{ mode: "docs-only", online: false }` |
| Capabilities online | Avec TD → `get_capabilities` → Mode: live + TD capabilities |
| Incompatible | TD incompatible → erreur version explicite, mode = `live` |
| Recovery get_cap | Stop TD → Start TD → `get_capabilities` → probe frais → mode `live` immédiat |
| Recovery tool | Stop TD → Start TD → attendre >60s → tool live → succès |
| success:false | TD retourne `{success: false}` → mode `live`, erreur applicative affichée |
| dryRun offline | Sans TD → `deploy_td_asset(dryRun=true)` → fonctionne |

## Hors scope PR2

- PR3 (#54) — enrichissement live des resources
- Reconnection automatique / polling (#77) — `invalidateAndProbe()` = mécanisme minimal
- UI client (#79)
- État HYBRID actif (PR3)
