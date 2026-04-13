<!-- session_id: 0a3937d6-5e5a-4251-9267-3b387a24a32a -->
# Plan: Finir #105 — Enrichir les skills avec les Operator Snippets

## Context

L'issue #105 a ses Phases 1-3 complètes : extraction de 483 snippets, analyse (204 tips, 15 thèmes), et 2 outils MCP (`search_snippets`, `get_snippet`) mergés dans `a6d400c`. **Mais aucun des 3 skills TD ne sait que ces outils existent** — un agent utilisant td-guide, td-glsl ou td-python ne découvrira jamais les snippets. C'est la Phase "Skill Enrichment" manquante.

`export_subgraph` (#95) n'est **PAS** nécessaire — les snippets contiennent déjà les connexions extraites des .tox.

## Changements

### 1. `skills/td-guide/SKILL.md` — Ajouter snippets à la table de documentation

**Fichier:** `.claude/skills/td-guide/SKILL.md` (section "Fetching Documentation", ~lignes 103-116)

- Ajouter 2 lignes à la table des outils :
  - `search_snippets` — 483 exemples officiels Derivative (réseau, connexions, params, readMe)
  - `get_snippet` — détail complet d'un snippet (operators, DATs, code Python/GLSL)
- Ajouter quand utiliser snippets vs autres outils : exemples de réseau réels, patterns de connexion, params non-default en pratique

### 2. `skills/td-glsl/SKILL.md` — Ajouter snippets shader

**Fichier:** `.claude/skills/td-glsl/SKILL.md` (section "Fetching Documentation", ~lignes 61-70)

- Ajouter `search_snippets` avec `family="TOP"` ou `family="MAT"` pour trouver du GLSL embarqué dans les exemples officiels
- Distinguer : `search_glsl_patterns` = curated + difficulty-ranked ; `search_snippets` = exemples officiels bruts avec contexte réseau

### 3. `skills/td-python/SKILL.md` — Ajouter snippets Python

**Fichier:** `.claude/skills/td-python/SKILL.md` (section "Fetching Documentation", ~lignes 114-123)

- Ajouter `search_snippets` pour trouver du code Python embarqué dans les DATs officiels
- Ajouter `get_snippet` pour récupérer le code complet d'un exemple

### 4. Fermer l'issue #105

- Commenter sur l'issue avec le résumé des phases complétées
- Fermer l'issue (Phase 4 "incremental update" est un nice-to-have pour une version TD future, pas bloquant)

## Vérification

1. `cd _mcp_server && npm run build` — le code compile
2. `cd _mcp_server && npm test` — tests passent
3. Relire chaque SKILL.md modifié pour vérifier la cohérence des tables
4. Vérifier que les noms d'outils (`search_snippets`, `get_snippet`) matchent exactement les constantes dans `_mcp_server/src/core/constants.ts`
