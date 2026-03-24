<!-- session_id: 3451119f-8149-49e1-9ab0-c32018704301 -->
# Phase 4 — Enrichissement Skills + Sidecars

## Context

Phase 3 a livré `scan_for_lessons`. Phase 4 ajoute :
1. Chargement des sidecars `*.td-lessons.json` dans le KnowledgeRegistry
2. Génération automatique de `skillUpdateProposal` lors du capture

## Fichiers à créer/modifier

| Fichier | Action |
|---------|--------|
| `_mcp_server/src/features/catalog/types.ts` | Ajouter `LESSONS_SIDECAR_SUFFIX` |
| `_mcp_server/src/features/catalog/loader.ts` | Ajouter `lessonsPathFor()`, `loadLessons()`, étendre `scanForProjects()` |
| `_mcp_server/src/features/catalog/index.ts` | Re-exporter les nouvelles fonctions |
| `_mcp_server/src/features/lessons/enrichment.ts` | **Nouveau** — génère `skillUpdateProposal` à partir d'une lesson |
| `_mcp_server/src/features/tools/handlers/lessonTools.ts` | Intégrer enrichment dans `capture_lesson` |
| `_mcp_server/src/features/tools/handlers/projectCatalogTools.ts` | Charger lessons sidecars dans registry lors de `scan_projects` |
| `_mcp_server/tests/unit/lessons/enrichment.test.ts` | **Nouveau** |

## Détails

### 1. Sidecar loader

```typescript
// types.ts
export const LESSONS_SIDECAR_SUFFIX = ".td-lessons";

// loader.ts
export function lessonsPathFor(toePath: string): string
  → join(dirname(toePath), `${basename(toePath, ".toe")}${LESSONS_SIDECAR_SUFFIX}.json`)

export function loadLessons(toePath: string): TDLessonEntry[]
  → lit le sidecar, parse JSON (array), valide chaque entry
```

Intégration dans `scanForProjects()` : ajouter un champ `lessons: TDLessonEntry[]` au `ScanResult`, charger les sidecars en parallèle des manifests.

Puis dans `projectCatalogTools.ts` → `scan_projects` : quand des lessons sidecars sont trouvées, les injecter dans le KnowledgeRegistry via `addEntry()`.

### 2. Enrichment (`enrichment.ts`)

```typescript
function generateSkillProposal(lesson: TDLessonEntry): SkillUpdateProposal | undefined
```

Mapping :
- `tags` contient glsl/shader/pixel/vertex → `targetFile: "td-glsl"`, `section: "Critical Guardrails"`
- `operatorChain[].family` === "CHOP" → `targetFile: "td-guide"`, `section: "Critical Guardrails"`
- `tags` contient python/script → `targetFile: "td-python"`, `section: "Critical Guardrails"`
- Pitfalls → préfixe "⚠️" dans `proposedAddition`
- Patterns → préfixe "✅" dans `proposedAddition`

Appelé automatiquement dans `capture_lesson` quand `confidence >= "medium"`.

### 3. Intégration dans `capture_lesson`

Après construction de la lesson, avant écriture :
```typescript
if (lesson.provenance.confidence !== "low") {
  lesson.payload.skillUpdateProposal = generateSkillProposal(lesson);
}
```

## Vérification

| Test | Méthode |
|------|---------|
| `enrichment.ts` génère les bons targetFile/section | Unit test |
| `loadLessons()` lit un sidecar valide | Unit test |
| `capture_lesson` avec confidence medium → contient proposal | MCP test |
| `scan_projects` charge les lessons sidecars dans registry | Integration test |
| `npm run test:unit` — tous passent | CI |
