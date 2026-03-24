<!-- session_id: 3451119f-8149-49e1-9ab0-c32018704301 -->
# Lessons Learned System — Self-Improving Skills Base

## Context

Construire un système hybride (auto-scan + capture manuelle) de lessons learned qui enrichit la base de connaissances MCP au fil des projets TD. Deux catégories : **patterns** (ce qui marche) et **pitfalls** (ce qui casse). Les lessons alimentent les skills existants via un pipeline d'enrichissement.

Architecture alignée sur l'existant : schema-first (Zod), registries, search scoring, sidecar pattern.

---

## 1. Schema — Nouveau kind `"lesson"`

Rejoint le discriminated union existant dans `types.ts`. Un seul `kind`, avec `category: "pattern" | "pitfall"` dans le payload.

```typescript
lessonPayload = {
  category: "pattern" | "pitfall",
  operatorChain?: [{ opType, family, role? }],   // opérateurs impliqués
  // Patterns
  recipe?: { description, steps?, example?: { code?, language?, description } },
  // Pitfalls
  symptom?: string,
  cause?: string,
  fix?: string,
  // Classification
  tags: string[],
  relatedPatternIds?: string[],                   // liens vers entries existantes
  difficulty?: "beginner" | "intermediate" | "advanced",
  // Enrichissement
  skillUpdateProposal?: { targetFile, section, proposedAddition, status }
}

lessonProvenance = base + {
  discoveredIn?: string,        // nom du projet source
  discoveredAt?: string,        // date ISO
  validatedIn?: string[],       // projets qui ont confirmé
  validationCount: number       // compteur cross-projet
}
```

## 2. Storage

```
data/td-knowledge/lessons/          ← entries individuelles (curated)
  feedback-displace-organic.json
  decay-above-one-blowout.json

{project}.td-lessons.json           ← sidecar array (project-scoped, auto-generated)
```

Convention de nommage : `{kebab-case-id}.json`, identique à `glsl-patterns/`.

## 3. Nouveaux MCP Tools

### `search_lessons` (offline)
- Params: `query`, `category?`, `tags?`, `family?`, `minConfidence?`, `maxResults?`
- Cherche dans KnowledgeRegistry, scoring : title > summary > tags > operatorChain > symptom/cause

### `capture_lesson` (offline, écrit sur disque)
- Params: `title`, `category`, `summary`, `operatorChain?`, `recipe?`, `code?`, `symptom?`, `cause?`, `fix?`, `tags`, `relatedIds?`, `projectName?`, `confidence?`, `saveTo?` (builtin|project)
- Génère l'ID, valide via Zod, écrit le JSON, hot-reload le registry

### `scan_for_lessons` (live TD requis)
- Params: `rootPath?`, `maxDepth?`, `autoCapture?`
- Python scan du projet → TS pattern detection → candidats
- Preview par défaut, `autoCapture: true` pour persister

## 4. Auto-Scan Algorithm

**Python côté TD** (`scan_for_lesson_candidates` dans `api_service.py`) :
- Collecte : graphe de connexions, types d'ops, valeurs de paramètres, états d'erreur
- Walk récursif du réseau à partir de `rootPath`

**TS côté serveur** (`detector.ts`) — règles heuristiques :

| Règle | Catégorie | Détection |
|-------|-----------|-----------|
| Feedback loop | pattern | Feedback TOP dans une chaîne, ops entre input/output |
| GLSL + Noise + Feedback | pattern | Noise → GLSL avec Feedback connecté |
| CHOP export vers params | pattern | CHOP avec export flag vers params TOP |
| Instancing setup | pattern | Geometry COMP avec `instanceCHOP` set |
| Decay > 1.0 | pitfall | Uniform/param > 1.0 dans chaîne feedback |
| Resolution mismatch | pitfall | TOPs connectés avec résolutions différentes |
| Orphan operators | pitfall | Ops sans connexions |
| Error-state ops | pitfall | Ops en erreur |

**Dé-duplication** : compare `operatorChain` + `tags` avec lessons existantes. Si match → incrémente `validationCount`.

## 5. Pipeline d'enrichissement skills

```
Lesson (validationCount >= 3, confidence: high)
  → Génère skillUpdateProposal (targetFile, section, proposedAddition)
  → Status: proposed → approved (review) → applied (écriture .md)
```

Mapping automatique :
- GLSL-related tags → `td-glsl` skill
- CHOP family → `td-guide` CHOP section
- Python code → `td-python` skill

## 6. Fichiers à créer/modifier

### Phase 1 — Schema + Search (offline)
| Fichier | Action |
|---------|--------|
| `_mcp_server/src/features/resources/types.ts` | Ajouter `lessonEntrySchema` au union |
| `_mcp_server/src/features/resources/registry.ts` | `getLessonIndex()`, `addEntry()`, étendre search |
| `_mcp_server/data/td-knowledge/lessons/` | 3-5 seed lessons (hand-crafted) |
| `_mcp_server/src/features/tools/handlers/lessonTools.ts` | `search_lessons`, `get_lesson` |
| `_mcp_server/src/features/tools/presenter/lessonFormatter.ts` | Formatters |
| `_mcp_server/src/core/constants.ts` | Ajouter tool names |
| `_mcp_server/src/features/tools/register.ts` | Wire up |
| `_mcp_server/tests/unit/lessons/` | Tests |

### Phase 2 — Capture manuelle (write)
| Fichier | Action |
|---------|--------|
| `_mcp_server/src/features/lessons/writer.ts` | Écriture JSON + sidecar |
| `_mcp_server/src/features/lessons/idGenerator.ts` | Title → kebab-case + dedup |
| `lessonTools.ts` | Ajouter `capture_lesson` |

### Phase 3 — Auto-scan (live TD)
| Fichier | Action |
|---------|--------|
| `modules/mcp/services/api_service.py` | `scan_for_lesson_candidates()` |
| `_mcp_server/src/features/lessons/detector.ts` | Pattern detection heuristiques |
| `_mcp_server/src/features/lessons/scanScript.ts` | Génération script Python |
| `lessonTools.ts` | Ajouter `scan_for_lessons` avec `withLiveGuard` |

### Phase 4 — Enrichissement + sidecars
| Fichier | Action |
|---------|--------|
| `_mcp_server/src/features/lessons/enrichment.ts` | Génération proposals |
| `_mcp_server/src/features/catalog/loader.ts` | Charger `*.td-lessons.json` |

## 7. Vérification

| Phase | Test |
|-------|------|
| 1 | `search_lessons` retourne des résultats sur les seed lessons |
| 1 | Les lessons apparaissent dans `KnowledgeRegistry.getByKind("lesson")` |
| 2 | `capture_lesson` crée un JSON valide, searchable immédiatement |
| 2 | Round-trip : capture → search → retrouve la lesson |
| 3 | `scan_for_lessons` sur un projet TD réel retourne des candidats |
| 3 | `autoCapture: true` persiste les candidats, incrémente `validationCount` des doublons |
| 4 | Lessons depuis sidecars `*.td-lessons.json` apparaissent dans search |
| Global | `npm run lint && npx tsc --noEmit && npm test` |
| Global | `uv run ruff check modules/` + `python scripts/sync_modules.py --check` |

## Notes

- Commencer par Phase 1 seule — c'est la fondation
- Les seed lessons doivent couvrir les patterns TD les plus courants (feedback, instancing, CHOP export)
- Le pipeline d'enrichissement est intentionnellement léger en Phase 1 (juste le champ dans le JSON)
