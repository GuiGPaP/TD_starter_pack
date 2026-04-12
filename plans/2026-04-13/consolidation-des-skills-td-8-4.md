<!-- session_id: 39de023d-9b7a-4bac-9b36-fa039cfa753e -->
# Consolidation des Skills TD : 8 → 4

## Context

8 skills TD chargent chacun ~100-150 lignes de SKILL.md au trigger, avec ~30-40 lignes de boilerplate dupliqué par skill (cache rule, post-write rule, execution mode, "project context first", tables de documentation, instructions de chargement progressif). Un workflow Python typique charge 3 skills (378 lignes), un workflow shader en charge 2 (268 lignes). L'objectif est de réduire le nombre d'entrées dans le system prompt et le volume de Tier 1 chargé par workflow, tout en préservant 100% des guardrails et références.

## Plan de consolidation

| Skills actuels | Nouveau skill | Pourquoi |
|---|---|---|
| td-guide + td-context | **td-guide** | td-context (91 lignes) est toujours pré-requis ; son contenu devient une section dans td-guide. Élimine l'indirection `@td-context`. |
| td-glsl + td-glsl-vertex + td-pops | **td-glsl** | Structure identique, boilerplate identique. Un routeur de domaine (pixel/vertex/compute) charge le bon `domains/*.md`. |
| td-python + td-lint | **td-python** | Même domaine (Python dans TD), se cross-référencent déjà. Le workflow lint devient une section + référence. |
| td-pretext | **td-pretext** | Inchangé — domaine suffisamment isolé. |

### Gains estimés

| Métrique | Avant | Après | Économie |
|---|---|---|---|
| Descriptions system-reminder | ~16 lignes | ~8 lignes | -50% (permanent) |
| Decision tree CLAUDE.md | 8 rows | 4 rows | -4 rows (permanent) |
| Workflow shader (SKILL.md chargé) | 268 lignes | ~220 lignes | -18% |
| **Workflow Python (SKILL.md chargé)** | **378 lignes** | **170 lignes** | **-55%** |
| Workflow réseau simple | 224 lignes | 160 lignes | -29% |
| Total Tier 1 | 980 lignes | ~612 lignes | -38% |

## Phase 1 : Merge td-context → td-guide

1. Ajouter section `## Project Context Tools` dans `td-guide/SKILL.md` avec le contenu de td-context (Two Tools, Workflow, Decision Matrix, Anti-Pattern)
2. Créer `td-guide/references/context-tools.md` pour la doc détaillée des paramètres
3. Mettre à jour le `description` frontmatter de td-guide pour inclure les trigger words de td-context
4. Supprimer `.claude/skills/td-context/`

**Fichiers modifiés :**
- `.claude/skills/td-guide/SKILL.md`
- `.claude/skills/td-guide/references/index.md`
- Nouveau : `.claude/skills/td-guide/references/context-tools.md`
- Supprimé : `.claude/skills/td-context/`

## Phase 2 : Merge td-lint → td-python

1. Fusionner les guardrails de td-lint dans `td-python/SKILL.md` (dédupliquer "project context first", "execution mode rule")
2. Déplacer les références de td-lint dans `td-python/references/` : `response-schemas.md`, `ruff-rules.md`, `td-python-patterns.md`
3. Déplacer les exemples de td-lint dans `td-python/examples/` : `correction-loop.md`, `batch-workflow.md`, `format-typecheck.md`, `multi-lang-validation.md`
4. Mettre à jour `td-python/references/index.md` pour inclure les fichiers lint
5. Créer `td-python/examples/index.md`
6. Ajouter section compacte "6-Step Lint & Fix Workflow" + table MCP Lint Tools dans SKILL.md
7. Supprimer `.claude/skills/td-lint/`

**Fichiers modifiés :**
- `.claude/skills/td-python/SKILL.md` (rewrite)
- `.claude/skills/td-python/references/index.md`
- Nouveau : `.claude/skills/td-python/examples/index.md`
- Déplacés depuis td-lint : 3 refs + 4 examples
- Supprimé : `.claude/skills/td-lint/`

## Phase 3 : Merge td-glsl-vertex + td-pops → td-glsl

Structure cible :
```
td-glsl/
  SKILL.md                    # ~155 lignes : guardrails partagés + domain router
  domains/
    pixel.md                  # ~60 lignes : mental model + guardrails spécifiques pixel
    vertex.md                 # ~55 lignes : mental model + guardrails spécifiques vertex
    compute.md                # ~75 lignes : mental model + operator decision table + guardrails compute
  references/
    pixel/   (ex td-glsl/references/)
    vertex/  (ex td-glsl-vertex/references/)
    compute/ (ex td-pops/references/)
  examples/
    pixel/   (ex td-glsl/examples/)
    vertex/  (ex td-glsl-vertex/examples/)
    compute/ (ex td-pops/examples/)
  templates/
    pixel/   (ex td-glsl/templates/)
    vertex/  (ex td-glsl-vertex/templates/)
    compute/ (ex td-pops/templates/)
```

1. Créer `td-glsl/domains/` avec `pixel.md`, `vertex.md`, `compute.md` (extraction du contenu spécifique de chaque ancien SKILL.md)
2. Réécrire `td-glsl/SKILL.md` : garder uniquement les guardrails partagés (#version, validate_glsl_dat, normalize, project context) + domain router table + fonctions built-in TD communes
3. Réorganiser `references/`, `examples/`, `templates/` en sous-dossiers `pixel/`, `vertex/`, `compute/` (déplacer fichiers, pas de changement de contenu)
4. Supprimer `.claude/skills/td-glsl-vertex/` et `.claude/skills/td-pops/`

**Fichiers modifiés :**
- `.claude/skills/td-glsl/SKILL.md` (rewrite)
- Nouveaux : `domains/pixel.md`, `domains/vertex.md`, `domains/compute.md`
- Réorganisés : toutes les refs/examples/templates dans des sous-dossiers par domaine
- Supprimés : `.claude/skills/td-glsl-vertex/`, `.claude/skills/td-pops/`

## Phase 4 : Cleanup global

1. Supprimer toutes les mentions `Use @td-context` dans les skills restants (remplacer par instruction inline)
2. Simplifier les routing tables dans td-guide : "GLSL Skill Routing" → une seule ligne `td-glsl`, "Python Utilities Routing" → `td-python`
3. Mettre à jour `CLAUDE.md` — decision tree à 4 lignes :

| Need | Skill |
|------|-------|
| TD network / operators / layout / rendering / project context | **td-guide** |
| GLSL shaders (pixel, vertex, compute, particles) | **td-glsl** |
| Python utilities / DAT linting / code quality | **td-python** |
| Native text layout / font atlas / obstacle avoidance | **td-pretext** |

4. Vérifier que tous les chemins `@references/`, `@examples/`, `@templates/` sont corrects après restructuration

## Discovery progressive (architecture finale)

```
Tier 0 (toujours en contexte)
  └─ 4 descriptions dans system-reminder (~8 lignes)
  └─ Decision tree dans CLAUDE.md (4 rows)

Tier 1 (au trigger du skill)
  └─ SKILL.md (~155-170 lignes)
      Guardrails partagés, routing, workflow compact

Tier 1.5 (td-glsl seulement)
  └─ domains/{pixel,vertex,compute}.md (~60-75 lignes)
      Mental model + guardrails spécifiques au domaine

Tier 2 (à la demande)
  └─ references/index.md → UN fichier de référence
  └─ examples/index.md → UN fichier d'exemple
  └─ templates/ → UN template
```

## Vérification

- Invoquer chaque skill manuellement et vérifier que le SKILL.md se charge correctement
- Tester un workflow shader (pixel, vertex, compute) — vérifier que le domain router fonctionne
- Tester un workflow Python + lint — vérifier que la section lint est accessible
- Tester un workflow réseau simple — vérifier que les context tools sont dans td-guide
- Vérifier qu'aucun `@td-context`, `@td-lint`, `@td-glsl-vertex`, `@td-pops` ne reste dans les fichiers
