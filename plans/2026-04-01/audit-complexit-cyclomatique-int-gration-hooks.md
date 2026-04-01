<!-- session_id: d3f2a6c1-314d-40d2-8546-7445b6165df8 -->
# Plan : Audit complexité cyclomatique + intégration hooks

## Contexte

Le repo mélange Python (modules/, TDDocker/) et TypeScript (_mcp_server/) sans aucune règle de complexité activée. L'objectif est double :
1. **Audit ponctuel** : script `lizard` pour un rapport complet classé par fonction
2. **Garde-fou continu** : règles C901 (ruff) et cognitiveComplexity (biome) intégrées aux configs existantes — le stop hook les capte automatiquement sans modification

## Baseline mesurée

### Python root — C901 (seuil 10, pour l'audit)

| Fonction | Fichier | Complexité |
|----------|---------|------------|
| `complete_op_paths` | `api_service.py:1975` | **26** |
| `safe_serialize` | `serialization.py:9` | 17 |
| `_check_glsl_td_errors` | `api_service.py:1565` | 16 |
| `_resolve_help_target` | `api_service.py:2686` | 15 |
| `exec_python_script` | `api_service.py:935` | 14 |
| `lint_dat` | `api_service.py:1198` | 13 |
| `validate_json_dat` | `api_service.py:1388` | 13 |
| `match_route` | `openapi_router.py:98` | 13 |
| `create_node` | `api_service.py:662` | 11 |
| `_classify_dat_kind` | `api_service.py:2267` | 11 |

**Au seuil 18 (hook) : 1 seule violation** — `complete_op_paths` (26)

### TDDocker — C901 (seuil 10)

| Fonction | Complexité |
|----------|------------|
| `_setup_multi_project` | 16 |
| `_init_container_comp` | 15 |
| `_update_orchestrator_display` | 14 |
| `onParPulse` | 13 |
| `_load` | 12 |
| `_restore_projects` | 11 |

**Au seuil 18 (hook) : 0 violation** — aucun per-file-ignore nécessaire.

### TypeScript — cognitive complexity (seuil 15 par défaut biome)

**37 violations** dont les pires :

| Fonction | Fichier | Score |
|----------|---------|-------|
| deploy handler | `glslPatternTools.ts:215` | **67** |
| `matchesQuery` | `registry.ts:118` | **56** |
| `formatGlslDeployResult` | `glslPatternFormatter.ts:154` | **54** |
| `formatGlslPatternDetail` | `glslPatternFormatter.ts:19` | 49 |
| `scanForLessons` handler | `lessonTools.ts:383` | 39 |
| deploy handler | `assetTools.ts:169` | 37 |
| `formatPerformanceResult` | `perfTools.ts:193` | 36 |
| `getExecLog` handler | `execLogTools.ts:40` | 31 |
| `formatCapabilities` | `capabilitiesFormatter.ts:16` | 26 |
| `formatClassDetailsSummary` | `classListFormatter.ts:182` | 25 |
| ... +27 autres (16-25) | | |

## Décision clé : pas de changement au stop hook

C901 et `noExcessiveCognitiveComplexity` s'ajoutent aux configs ruff/biome. Les commandes `ruff check` et `biome check` du stop hook les exécutent déjà automatiquement.

- **Python** : seuil 18, `# noqa: C901` ciblé sur `complete_op_paths` uniquement (seule violation)
- **TDDocker** : seuil 18, 0 violation, pas de per-file-ignores
- **TS** : `"warn"` level = biome ne bloque pas *pour la complexité*. Note : `biome check src/` échoue déjà pour des erreurs existantes (noExplicitAny, useSortedKeys…). Le stop hook TS était déjà bloquant avant ce changement. Les warnings complexité apparaissent en plus dans la sortie biome et dans `post-edit-lint.sh`.

---

## Fichiers à modifier

### 1. `pyproject.toml` (root)

- Ajouter `"C901"` au `select` (après `"TC"`, ligne 58) avec commentaire `# mccabe complexity`
- Ajouter section après `[tool.ruff.lint.isort]` :
  ```toml
  [tool.ruff.lint.mccabe]
  max-complexity = 18
  ```
- **Pas de per-file-ignore C901** sur `api_service.py` — trop large, masquerait les régressions futures
- À la place, ajouter `# noqa: C901` ciblé sur la ligne `def complete_op_paths(` (`api_service.py:1975`) — seule violation > 18
- Ajouter `"lizard>=1.17"` au groupe dev (après `"pyright>=1.1"`, ligne 12)

### 2. `TDDocker/pyproject.toml`

- Ajouter `"C901"` au `select` ligne 28 :
  ```toml
  select = ["E", "F", "W", "I", "UP", "B", "SIM", "RUF", "C901"]
  ```
- Ajouter après `[tool.ruff.lint]` :
  ```toml
  [tool.ruff.lint.mccabe]
  max-complexity = 18
  ```
- **Pas de per-file-ignores** — 0 violation à seuil 18.

### 3. `_mcp_server/biome.json`

- Étendre `linter.rules.complexity` (lignes 37-39) :
  ```json
  "complexity": {
      "noStaticOnlyClass": "off",
      "noExcessiveCognitiveComplexity": {
          "level": "warn",
          "options": {
              "maxAllowedComplexity": 20
          }
      }
  }
  ```
- **Pas d'overrides en Phase 1** — `"warn"` ne change pas le comportement du stop hook (qui bloquait déjà pour la dette biome existante). Les warnings complexité apparaissent dans la sortie sans ajouter de nouvelles erreurs bloquantes.
- Phase 2 : changer en `"error"` + ajouter overrides pour les hotspots non encore refactorés.

### 4. `scripts/complexity_report.py` (NOUVEAU)

Script d'audit complet utilisant l'API Python de `lizard` :
- Scanne `modules/**/*.py`, `_mcp_server/src/**/*.ts`, `TDDocker/python/td_docker/**/*.py`
- Exclut : `openapi_server/`, `generated_handlers.py`, `tests/`, `node_modules/`, `dist/`, `gen/`
- Seuils : `>=10` surveiller, `>=15` élevé, `>=25` critique
- Génère `reports/complexity/latest.md` (tableau markdown) et `latest.json`
- Usage : `uv run python scripts/complexity_report.py`

### 5. `justfile`

Ajouter après la recette `check` (ligne 33) :
```just
# Cyclomatic complexity audit (full repo)
complexity:
    uv run python scripts/complexity_report.py
```

### 6. `.gitignore`

Ajouter `reports/complexity/` (pas `reports/` en général — trop large)

---

## Séquence d'implémentation

1. Configs ruff + biome (fichiers 1-3) — safe, per-file-ignores + warn protègent le code existant
2. Dépendance lizard (fichier 1)
3. Script d'audit (fichier 4)
4. Justfile + gitignore (fichiers 5-6)
5. Vérification

## Seuils

| Phase | Python C901 | TS cognitive | Comportement hook |
|-------|-------------|-------------|-------------------|
| Phase 1 (maintenant) | 18 | 20 (warn) | Bloque Python > 18 hors hotspots, affiche TS sans bloquer |
| Phase 2 (après cleanup) | 15 | 15 (error) | Bloque les deux, avec overrides sur le legacy restant |

## Vérification

1. `uv run ruff check modules/` → 0 erreur (C901 noqa sur `complete_op_paths`, les autres < 18)
2. `cd TDDocker && uv run ruff check python/` → 0 erreur (toutes < 18)
3. `cd _mcp_server && npx biome lint --only=lint/complexity/noExcessiveCognitiveComplexity src/` → warnings complexité visibles, exit 0 (warn level)
4. `just complexity` → premier rapport baseline avec les 3 scopes
5. Test fonctionnel : écrire une fonction Python triviale avec 20 `if` imbriqués → vérifier que le stop hook bloque

## Phase 2 — transition vers enforcement

Quand les refactors auront réduit les hotspots :
1. **Python** : retirer le `# noqa: C901` de `complete_op_paths` après refactor, baisser `max-complexity` à 15
2. **TS** : changer `"warn"` → `"error"`, baisser `maxAllowedComplexity` à 15, ajouter `overrides` explicites pour chaque fichier non encore refactoré (au minimum `registry.ts`, `glslPatternTools.ts`, `glslPatternFormatter.ts`, `lessonTools.ts`, `assetTools.ts`, `perfTools.ts`, `execLogTools.ts`)
3. **Pas de changement de hook** — toujours config-only

## Pas touché

- `validate-on-stop.mts` — aucun changement nécessaire
- `post-edit-lint.sh` — ruff/biome captent déjà les nouvelles règles
- `pre-commit-lint.sh` — idem
