<!-- session_id: 6ce21031-d411-4bae-bd0c-5f80f704d359 -->
# Issue #81 — Support des extensions tierces : T3D, LOP, POPx

## Context

Le knowledge registry ne connaît que les 6 familles natives TD (TOP, CHOP, SOP, COMP, DAT, MAT). Les toolkits tiers (T3D, LOPs, POPx) sont des `.tox` installés manuellement, avec un licensing Patreon qui interdit de redistribuer les paramètres. L'objectif est de rendre le registry, la recherche et l'introspection compatibles avec ces extensions.

Le dossier `custom OP/` contient les `.tox` localement — il ne doit PAS être commité.

## Décision : pas de skeleton operators

L'issue propose des opérateurs skeleton avec `parameters: []`. On ne les inclut **pas** en Phase 1 car :
- Les `opType` exacts sont inconnus sans introspection live
- Des entrées placeholder polluent les résultats de recherche
- `detect_toolkits` pourra découvrir les opérateurs réels plus tard

On ajoute uniquement le kind `"toolkit"` (métadonnées du toolkit lui-même).

---

## Étapes

### 1. `.gitignore` — exclure `custom OP/`

**Fichier :** `.gitignore`
Ajouter `custom OP/` à la fin.

### 2. Schema — nouveau kind `"toolkit"` dans types.ts

**Fichier :** `_mcp_server/src/features/resources/types.ts`

Ajouter `toolkitPayloadSchema` :
```ts
const toolkitPayloadSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  vendor: z.string(),
  url: z.string().url().optional(),
  opFamilyPrefix: z.string(),
  installHint: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  detectionPaths: z.array(z.string()).optional(),
});
```

Ajouter `toolkitEntrySchema` et l'inclure dans la discriminated union (ligne 242).

Exporter `TDToolkitEntry`.

### 3. Registry — support du kind `"toolkit"`

**Fichier :** `_mcp_server/src/features/resources/registry.ts`

- Ajouter `getToolkitIndex()` (pattern identique à `getLessonIndex()`)
- Étendre `matchesQuery()` pour le kind `"toolkit"` : chercher dans `payload.name`, `payload.vendor`, `payload.opFamilyPrefix`

### 4. Relâcher l'enum `family` dans search_operators

**Fichier :** `_mcp_server/src/features/tools/handlers/searchTools.ts` (lignes 23-26)

Remplacer :
```ts
family: z.enum(["TOP", "CHOP", "SOP", "COMP", "DAT", "MAT"])
```
par :
```ts
family: z.string().toUpperCase()
```

La logique de filtrage utilise déjà `toUpperCase()` — aucun changement supplémentaire.

### 5. Constantes — noms des nouveaux outils

**Fichier :** `_mcp_server/src/core/constants.ts`

Ajouter dans `TOOL_NAMES` :
```ts
SEARCH_TOOLKITS: "search_toolkits",
GET_TOOLKIT: "get_toolkit",
DETECT_TOOLKITS: "detect_toolkits",
```

### 6. Données JSON — 3 fichiers toolkit

**Répertoire :** `_mcp_server/data/td-knowledge/toolkits/` (nouveau)

| Fichier | name | vendor | opFamilyPrefix | detectionPaths |
|---|---|---|---|---|
| `t3d.json` | T3D | Josef Pelz | T3D | ["/project1/T3D"] |
| `lop.json` | LOPs | alltd.org / Yea Chen | LOP | ["/project1/dot_lops"] |
| `popx.json` | POPx | (Patreon) | POPx | ["/project1/POPX"] |

Provenance : `source: "manual"`, `confidence: "low"`, `license: "proprietary-patreon"` (ou `"MIT"` pour LOPs si applicable).

### 7. Formatter — toolkitFormatter.ts

**Nouveau fichier :** `_mcp_server/src/features/tools/presenter/toolkitFormatter.ts`

Suivre le pattern de `lessonFormatter.ts` :
- `formatToolkitDetail(entry)` — nom, version, vendor, URL, install hint, warnings
- `formatToolkitSearchResults(results, query)` — vue liste
- `formatDetectResult(detected[])` — résultats de détection live

Exporter depuis `presenter/index.ts`.

### 8. Handler — toolkitTools.ts

**Nouveau fichier :** `_mcp_server/src/features/tools/handlers/toolkitTools.ts`

Suivre le pattern de `lessonTools.ts` :

- **`search_toolkits`** (offline) — `registry.getByKind("toolkit")`, filtre par query, format
- **`get_toolkit`** (offline) — `registry.getById(id)`, vérifie `kind === "toolkit"`, format
- **`detect_toolkits`** (live TD requis) — pour chaque toolkit, exécute un script Python via `tdClient` qui vérifie `op(detectionPath)` dans TD. Retourne statut: installed / not_found / unknown

Exporter `registerToolkitTools()`.

### 9. Enregistrement — register.ts

**Fichier :** `_mcp_server/src/features/tools/register.ts`

- Importer `registerToolkitTools` depuis `./handlers/toolkitTools.js`
- Appeler après `registerLessonTools` :
```ts
registerToolkitTools(server, logger, knowledgeRegistry, serverMode, tdClient);
```

---

## Fichiers impactés

| Fichier | Action |
|---|---|
| `.gitignore` | Ajouter `custom OP/` |
| `_mcp_server/src/features/resources/types.ts` | Nouveau `toolkitPayloadSchema` + `toolkitEntrySchema` dans union |
| `_mcp_server/src/features/resources/registry.ts` | `getToolkitIndex()` + `matchesQuery()` toolkit branch |
| `_mcp_server/src/features/tools/handlers/searchTools.ts` | `z.enum()` → `z.string()` pour family |
| `_mcp_server/src/core/constants.ts` | 3 constantes outil |
| `_mcp_server/data/td-knowledge/toolkits/*.json` | **3 nouveaux** fichiers données |
| `_mcp_server/src/features/tools/presenter/toolkitFormatter.ts` | **Nouveau** — formatters |
| `_mcp_server/src/features/tools/presenter/index.ts` | Re-export |
| `_mcp_server/src/features/tools/handlers/toolkitTools.ts` | **Nouveau** — handlers |
| `_mcp_server/src/features/tools/register.ts` | Import + appel registration |

## Vérification

- [ ] `npm run build` dans `_mcp_server/` — compilation TS OK
- [ ] `npm test` — tests existants passent
- [ ] `search_toolkits` retourne les 3 toolkits
- [ ] `get_toolkit` avec `t3d-toolkit` retourne le détail
- [ ] `search_operators` avec `family: "T3D"` ne crash plus (retourne 0 résultats, attendu)
- [ ] `detect_toolkits` avec TD connecté + toolkit installé → `installed`
- [ ] Outils natifs (TOP, CHOP…) fonctionnent normalement (non-régression)
