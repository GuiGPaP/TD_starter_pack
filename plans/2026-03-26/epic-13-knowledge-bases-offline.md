<!-- session_id: 6010ec0d-bd40-4517-ab69-a9875d2027ce -->
# Epic 13 — Knowledge Bases Offline

## Context

L'Epic 13 ajoute 4 knowledge bases offline au MCP server TouchDesigner. L'architecture est mature : chaque `kind` suit le pattern Schema → Data → Registry (auto-load) → Constants → Handler → Presenter → Register → Tests. Le travail est mécanique et bien cadré.

## Ordre d'exécution

| Phase | Issue | Scope | Risque |
|-------|-------|-------|--------|
| 1 | **#87** Operator examples | Schema enrichment, pas de nouveau kind | Minimal |
| 2 | **#88** Version history | Extend `VersionManifest`, 2 tools standalone | Faible |
| 3 | **#86** Techniques library | Nouveau kind `technique`, full pattern | Moyen (data volume) |
| 4 | **#89** Tutorial system | Nouveau kind `tutorial`, full pattern | Moyen (data volume) |

---

## Phase 1 — Issue #87 : Operator Examples

### Fichiers modifiés

| Fichier | Action |
|---------|--------|
| `src/features/resources/types.ts:82-87` | Ajouter `examples: z.array(exampleSchema).optional()` à `operatorPayloadSchema` (réutiliser `exampleSchema` L34-38, ajouter `context` optionnel) |
| `src/features/tools/handlers/searchTools.ts` | Ajouter `includeExamples: z.boolean().optional()` au schema `searchOperatorsSchema` |
| `src/features/tools/presenter/searchFormatter.ts` | Rendre les examples dans le formatage quand le flag est true |
| `data/td-knowledge/operators/*.json` (~15 fichiers) | Ajouter 2-5 `examples` par opérateur |
| `tests/unit/tools/searchTools.test.ts` | Tests includeExamples flag |

### Vérification
- `npm run build && npm test`
- Les 15+ operator JSONs existants passent toujours la validation (champ optionnel)

---

## Phase 2 — Issue #88 : TD Version History

### Fichiers modifiés/créés

| Fichier | Action |
|---------|--------|
| `src/features/resources/versionManifest.ts` | Ajouter champs optionnels à `TDVersionInfo` : `newOperators?`, `breakingChanges?`, `highlights?`, `releaseYear?` |
| `src/core/constants.ts` | `GET_VERSION_INFO`, `LIST_VERSIONS` |
| `src/features/tools/handlers/versionTools.ts` | **Nouveau** — `list_versions` (filtre par status) + `get_version_info` (par ID) |
| `src/features/tools/presenter/versionFormatter.ts` | **Nouveau** — `formatVersionList`, `formatVersionDetail` |
| `src/features/tools/presenter/index.ts` | Export des formatters version |
| `src/features/tools/register.ts` | Wirer `registerVersionTools` dans le bloc `if (resourceDeps)` |
| `data/td-knowledge/version-manifest.json` | Enrichir les 6 versions avec newOperators, breakingChanges, highlights |
| `tests/unit/tools/versionTools.test.ts` | **Nouveau** |

### Data : vérification factuelle requise
Les données version DOIVENT être vérifiées contre les release notes Derivative. Web search pendant l'implémentation.

### Vérification
- `npm run build && npm test`

---

## Phase 3 — Issue #86 : Techniques Library

### Pattern : copier exactement `workflowTools.ts`

| Fichier | Action |
|---------|--------|
| `src/features/resources/types.ts` | `techniquePayloadSchema` + `techniqueEntrySchema` + ajout union + export type |
| `src/features/resources/registry.ts` | `getTechniqueIndex()` + branch `technique` dans `matchesQuery()` |
| `src/core/constants.ts` | `SEARCH_TECHNIQUES`, `GET_TECHNIQUE` |
| `src/features/tools/handlers/techniqueTools.ts` | **Nouveau** — search + get, copie de workflowTools |
| `src/features/tools/presenter/techniqueFormatter.ts` | **Nouveau** |
| `src/features/tools/presenter/index.ts` | Export |
| `src/features/tools/register.ts` | Wirer `registerTechniqueTools` |
| `data/td-knowledge/techniques/*.json` | **Nouveau** — ~15 fichiers |
| `tests/unit/tools/techniqueTools.test.ts` | **Nouveau** |

### Schema technique
```
payload: {
  category: enum["gpu-compute","ml","audio-visual","networking","python-advanced","generative"]
  difficulty: enum["beginner","intermediate","advanced"]
  operatorChain?: [{ family, opType, role? }]
  codeSnippets?: [{ label, language, code, description? }]
  tips?: string[]
  tags: string[]
}
```

### Vérification
- `npm run build && npm test`

---

## Phase 4 — Issue #89 : Tutorial System

### Pattern : identique à Phase 3

| Fichier | Action |
|---------|--------|
| `src/features/resources/types.ts` | `tutorialPayloadSchema` + `tutorialEntrySchema` + ajout union + export type |
| `src/features/resources/registry.ts` | `getTutorialIndex()` + branch `tutorial` dans `matchesQuery()` |
| `src/core/constants.ts` | `SEARCH_TUTORIALS`, `GET_TUTORIAL` |
| `src/features/tools/handlers/tutorialTools.ts` | **Nouveau** |
| `src/features/tools/presenter/tutorialFormatter.ts` | **Nouveau** |
| `src/features/tools/presenter/index.ts` | Export |
| `src/features/tools/register.ts` | Wirer `registerTutorialTools` |
| `data/td-knowledge/tutorials/*.json` | **Nouveau** — ~10 fichiers |
| `tests/unit/tools/tutorialTools.test.ts` | **Nouveau** |

### Schema tutorial
```
payload: {
  difficulty: enum["beginner","intermediate","advanced"]
  estimatedTime: string
  prerequisites: string[]
  sections: [{ title, content, code? }]
  relatedOperators: string[]
  tags: string[]
}
```

### Vérification
- `npm run build && npm test`

---

## Stratégie de commits (dans le submodule)

1 commit par phase, chaque phase build+test avant commit :
1. `feat(#87): add operator examples to knowledge base`
2. `feat(#88): add version history tools (list_versions, get_version_info)`
3. `feat(#86): add techniques library (search_techniques, get_technique)`
4. `feat(#89): add tutorial system (search_tutorials, get_tutorial)`

Puis 1 commit dans le repo parent pour bumper le submodule.

## Vérification finale
- `npm run build` — zero errors
- `npm test` — tous les tests passent (hors intégration sans TD)
- Chaque nouveau tool répond correctement via MCP
