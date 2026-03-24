<!-- session_id: c3cba092-b4ad-467c-91f6-f19055c51c4f -->
# Epic 10 — Version-aware docs + recherche intelligente (#67-#71)

## Context

Le KnowledgeRegistry a un search basique (substring). Pas de données de version, pas de scoring, pas de comparaison. Seul 1 opérateur dans le corpus. L'objectif : version manifest, lookup par opType, scoring, compare, warnings via presenters.

## Ordre recommandé

1. **#68a infra** — Schema versions, manifest loader, normalisation TD version, lookup par opType, tests
2. **#69** — Warnings via presenters/structured payload
3. **#70 + #71** — search_operators + compare_operators avec formatter + metadata + tests
4. **#68b** — Expansion corpus (~20 opérateurs) + contract tests

---

## #68a — Infra version + normalisation

### Version manifest

`data/td-knowledge/version-manifest.json` — fichier dédié (le loader ne scanne que les sous-dossiers, pas la racine) :

```json
{
  "schemaVersion": "1.0",
  "currentStable": "2024",
  "versions": [
    { "id": "2020", "pythonVersion": "3.7", "supportStatus": "legacy" },
    { "id": "2021", "pythonVersion": "3.9", "supportStatus": "legacy" },
    { "id": "2022", "pythonVersion": "3.9", "supportStatus": "maintenance" },
    { "id": "2023", "pythonVersion": "3.11", "supportStatus": "active" },
    { "id": "2024", "pythonVersion": "3.11", "supportStatus": "current" }
  ]
}
```

Chargement dédié dans `VersionManifest` (pas par le loader générique).

### Schema operator : ajouter `versions`

`src/features/resources/types.ts` — étendre `operatorPayloadSchema` :

```typescript
const operatorVersionSchema = z.object({
  addedIn: z.string().optional(),
  changedIn: z.array(z.string()).optional(),
  deprecated: z.boolean().optional(),
  deprecatedSince: z.string().optional(),
  removedIn: z.string().optional(),
  suggestedReplacement: z.string().optional(),
}).optional();

// operatorPayloadSchema.extend:
versions: operatorVersionSchema,
```

### Normalisation TD version

`tdBuild` varie selon les builds : `"2023.11000"`, `"099.2025.31760"`. Nouvelle fonction `normalizeTdVersion(tdBuild: string): string | null` dans `versionManifest.ts`. Doit gérer les deux formats. Tests avec les deux patterns.

### Lookup par opType dans le registry

`KnowledgeRegistry` a `getById(id)` mais pas de lookup par `opType`. Ajouter un index secondaire rempli à `loadAll()` :

```typescript
private readonly opTypeIndex = new Map<string, TDKnowledgeEntry>();

// In loadAll(), after this.entries.set(entry.id, entry):
if (entry.kind === "operator") {
  this.opTypeIndex.set(entry.payload.opType.toLowerCase(), entry);
}

getByOpType(opType: string): TDOperatorEntry | undefined {
  return this.opTypeIndex.get(opType.toLowerCase());
}
```

### Surface fusionService et versionManifest

Modifier `registerResources()` dans `src/features/resources/index.ts` pour retourner `{ registry, fusionService, versionManifest }` au lieu de juste `registry`. Adapter `touchDesignerServer.ts` et `register.ts` en conséquence.

### Fichiers

| Fichier | Type |
|---------|------|
| `data/td-knowledge/version-manifest.json` | **nouveau** |
| `src/features/resources/types.ts` | modifier (+operatorVersionSchema) |
| `src/features/resources/versionManifest.ts` | **nouveau** (loader, normalizeTdVersion, checkCompat) |
| `src/features/resources/registry.ts` | modifier (+getByOpType) |
| `src/features/resources/index.ts` | modifier (retourner { registry, fusionService, versionManifest }) |
| `src/server/touchDesignerServer.ts` | modifier (adapter au nouveau return type) |
| `src/features/tools/register.ts` | modifier (recevoir fusionService + versionManifest) |
| `tests/unit/resources/versionManifest.test.ts` | **nouveau** |

---

## #69 — Warnings via presenters

### Pas de string concatenation post-handler

Les warnings passent par le **payload structuré → presenter → finalizeFormattedText**. Pattern :

1. Après l'appel API réussi (ex: `createNode`), lookup opType dans le registry via `getByOpType()`
2. Si `versions.deprecated` ou `versions.removedIn` → construire un objet `compatibility`
3. Passer `compatibility` au formatter comme metadata supplémentaire
4. Le formatter inclut le warning dans la sortie structurée (markdown/yaml/json) proprement

### Objet compatibility

```typescript
interface CompatibilityInfo {
  level: "compatible" | "deprecated" | "unavailable" | "unknown";
  reason?: string;
  since?: string;
  suggestedReplacement?: string;
}
```

### Points d'injection

- `create_td_node` : lookup `result.data.result.opType` (retour API, source de vérité) via `getByOpType()`
- `deploy_glsl_pattern` : check `minVersion` du pattern
- `search_operators` (#70) : inclure `compatibility` dans chaque résultat

### Pas de warning si TD non connecté

Sans version TD connue, pas de comparaison possible → skip le check.

### Fichiers

| Fichier | Type |
|---------|------|
| `src/features/tools/presenter/operationFormatter.ts` | modifier (ajouter support compatibility dans create node) |
| `src/features/tools/handlers/tdTools.ts` | modifier (passer compatibility au formatter) |
| `src/features/tools/handlers/glslPatternTools.ts` | modifier (check minVersion) |
| `src/features/tools/presenter/glslPatternFormatter.ts` | modifier (support compatibility warning) |
| `src/features/tools/presenter/index.ts` | modifier (export new formatters) |

---

## #70 — search_operators

### Nouveau tool `search_operators` (offline, pas de withLiveGuard)

Schema avec `detailLevel` + `responseFormat` (convention existante) :

```typescript
{
  query: z.string(),
  family: z.enum(["TOP","CHOP","SOP","COMP","DAT","MAT"]).optional(),
  version: z.string().optional(),
  maxResults: z.number().int().min(1).max(50).optional(),
  ...detailOnlyFormattingSchema.shape,
}
```

### Scoring (`operatorScorer.ts`)

Fichier pur logic (pas de side effects) :

| Champ | Score base | Bonus exact | Bonus starts-with |
|-------|-----------|-------------|-------------------|
| id / opType | 100 | +50 | +25 |
| title | 90 | — | +20 |
| content.summary | 50 | — | — |
| searchKeywords | 30 | — | — |
| aliases | 30 | +50 (exact) | — |
| opFamily | 20 | — | — |

**Multi-term** : AND d'abord, puis fallback soft-OR si 0 résultats. Normalisation lowercase + strip spaces.
**Fuzzy** : Levenshtein pour termes > 3 chars, score réduit de 50%.
**Pénalité** : deprecated = -30. removedIn ≤ version cible = filtré.
**Version comparison** : via `normalizeTdVersion()` + comparaison numérique (pas de string brute).

### Formatter dédié

`src/features/tools/presenter/searchFormatter.ts` — `formatOperatorSearchResults()` et `formatOperatorComparison()`. Utilise `finalizeFormattedText()` comme tous les autres formatters.

### Metadata

Ajouter entrées dans `touchDesignerToolMetadata.ts` pour `search_operators` et `compare_operators`.

### Fichiers

| Fichier | Type |
|---------|------|
| `src/features/tools/handlers/searchTools.ts` | **nouveau** (search_operators + compare_operators) |
| `src/features/tools/presenter/searchFormatter.ts` | **nouveau** |
| `src/features/tools/security/operatorScorer.ts` | **nouveau** (scoring logic pure) |
| `src/core/constants.ts` | modifier (+SEARCH_OPERATORS, +COMPARE_OPERATORS) |
| `src/features/tools/register.ts` | modifier (+registerSearchTools) |
| `src/features/tools/metadata/touchDesignerToolMetadata.ts` | modifier (+2 entries) |
| `tests/unit/tools/operatorScorer.test.ts` | **nouveau** |
| `tests/unit/tools/searchTools.test.ts` | **nouveau** |
| `tests/unit/resources/registry.test.ts` | modifier (+tests getByOpType) |
| `tests/unit/resources/corpus.test.ts` | modifier (+contract tests nouveaux opérateurs) |
| `tests/integration/mcpToolsResponse.test.ts` | modifier (+tests search/compare) |

---

## #71 — compare_operators

Dans le même `searchTools.ts`. Schema :

```typescript
{
  op1: z.string(),
  op2: z.string(),
  ...detailOnlyFormattingSchema.shape,
}
```

Logique :
1. Lookup par id OU opType (try `getById`, fallback `getByOpType`)
2. Si TD connecté : enrichir via FusionService — comparer aussi `payload.liveParameters` (pas seulement `payload.parameters`)
3. Comparer : params communs/uniques, famille, versions, description
4. Formater via `formatOperatorComparison()`

Mode hybride : fonctionne offline (statique), enrichi online (live). Source de chaque facette indiquée dans la réponse.

---

## #68b — Expansion corpus

Ajouter ~20 opérateurs courants dans `data/td-knowledge/operators/` :
- TOP : noise, constant, feedback, composite, render, level, ramp
- CHOP : noise, pattern, constant, math, select
- SOP : line, circle, sphere, script
- COMP : base, geometry, camera, light
- DAT : text, table

Chaque fichier suit le schema existant + le nouveau champ `versions`.

---

## Vérification

1. `npx tsc --noEmit` — compile
2. `npm test` — tous les tests passent
3. `npm run lint` — clean
4. Test manuel :
   - `search_operators("noise")` → retourne Noise TOP, Noise CHOP avec scores
   - `search_operators("noise", family="TOP")` → filtre
   - `compare_operators("noise-top", "constant-top")` → comparaison structurée
   - `create_td_node(nodeType="scriptSOP")` avec TD connecté → warning si deprecated
   - `get_exec_log` → toujours fonctionnel (regression check)
