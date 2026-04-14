<!-- session_id: 695f2907-811e-4686-b505-fd480cfbb11a -->
# Plan — Mettre à jour les README (EN + FR) et ajouter l'attribution bottobot

## Context

Les deux README racine (`README.md` + `README.fr.md`) ont divergé de l'état réel du repo après plusieurs changements récents :

- **2026-03-26** : `_mcp_server/` inliné (était submodule `GuiGPaP/touchdesigner-mcp` branche `td-starter-pack`)
- **2026-04-14** : `TDpretext/` et `TDDocker/` extraits en repos publics et ajoutés en submodules
- Surface d'outils MCP élargie (workflow patterns, tutorials, network templates, experimental builds, techniques, snippets, palette, performance, lessons, layout/connect/copy, screenshot, etc. — beaucoup de ces ajouts viennent d'une analyse comparative avec `bottobot/touchdesigner-mcp-server` — cf. `plans/2026-03-25/analysis-bottobot-touchdesigner-mcp-server-vs-td-starter-pac.md`)
- Skills refactoring : actuels = `td-guide`, `td-glsl`, `td-python`, `td-pretext`, `td-sketch-ui`. Les README listent encore l'ancienne liste (`td-glsl-vertex`, `td-pops`, `td-lint`) qui n'existe plus dans `.claude/skills/`.
- `bottobot/touchdesigner-mcp-server` a inspiré plusieurs features (workflow engine, tutorials, network templates, experimental builds/techniques, TD version history, dedicated examples) — cité dans les plans mais absent de la section Attribution.

Objectif : les deux README doivent refléter l'état réel (submodules, skills, tools, attribution) pour une publication OSS propre.

## Fichiers à modifier

1. `C:\Users\guill\Desktop\TD_starter_pack\README.md`
2. `C:\Users\guill\Desktop\TD_starter_pack\README.fr.md`

Aucun autre fichier touché. Le `_mcp_server/README.md` (README du fork upstream) est laissé tel quel — il pointe vers le fork `8beeeaaat/touchdesigner-mcp` et sa doc `docs/installation.md` et `docs/development.md`, et n'est pas destiné à être le README « projet ».

## Changements à appliquer (même structure dans les deux langues)

### 1. Quick Start — Clone

Ajouter l'init des submodules juste après `git clone` :

```bash
git clone https://github.com/GuiGPaP/TD_starter_pack.git
cd TD_starter_pack
git submodule update --init --recursive
```

(EN) « initialize submodules (TDpretext, TDDocker) ».
(FR) « initialiser les submodules (TDpretext, TDDocker) ».

### 2. Nouvelle section « Submodules » (après Quick Start)

Aligner sur `CLAUDE.md` §Submodules :

- **TDpretext** (`TDpretext/`) — Pretext-based text layout dans TD via Web Render TOP — https://github.com/GuiGPaP/TDpretext
- **TDDocker** (`TDDocker/`) — Docker lifecycle manager (compose overlay, transports, watchdog), contient un submodule imbriqué `TD_SLlidar_docker/sllidar_ros2/` pinné sur Slamtec upstream — https://github.com/GuiGPaP/TDDocker

Mentionner que les deux ont été extraits le 2026-04-14 pour distribution OSS standalone.

### 3. Project structure

- Ajouter `TDpretext/` et `TDDocker/` comme submodules dans l'arborescence
- Corriger la ligne `.claude/skills/` : liste réelle = `td-guide, td-glsl, td-python, td-pretext, td-sketch-ui`
- Corriger le commentaire sur `_mcp_server/` : « MCP server (Node.js, inlined 2026-03-26) — originally forked from 8beeeaaat/touchdesigner-mcp » plutôt que « fork of 8beeeaaat/touchdesigner-mcp » (qui laisse penser que c'est encore un submodule externe)

### 4. Claude Skills (table)

Remplacer la table actuelle par le contenu du Skill Decision Tree de `CLAUDE.md` :

| Need | Skill |
|------|-------|
| TD network / operators / layout / rendering / project context | `td-guide` |
| GLSL shaders (pixel, vertex, compute, particles) | `td-glsl` |
| Python utilities (TDFunctions, TDJSON, TDStoreTools, TDResources), DAT linting, ruff | `td-python` |
| Native text layout / font atlas / obstacle avoidance | `td-pretext` |
| UI from sketch / wireframe → Palette widgets | `td-sketch-ui` |

### 5. Available MCP tools (table)

Rafraîchir avec les tools actuellement exposés (constatés via la liste MCP du runtime). Ajouts notables à intégrer dans des catégories existantes/nouvelles :

- **Search** : ajouter `search_tutorials`, `search_techniques`, `search_workflow_patterns`, `search_network_templates`, `search_snippets`, `search_palette`, `search_lessons`
- **Catalogs** : ajouter `get_tutorial`, `get_technique`, `get_workflow_pattern`, `get_network_template`, `get_snippet`, `suggest_workflow`
- **Versions** (nouvelle catégorie, offline) : `list_versions`, `get_version_info`, `list_experimental_builds`, `get_experimental_build`
- **Palette** : `index_palette`, `load_palette_component`
- **Layout/Wiring** (live) : ajouter `layout_nodes`, `connect_nodes`, `copy_node`, `screenshot_operator`, `scan_network_errors`, `export_subgraph`
- **Deploy** : ajouter `deploy_network_template`, `undo_last_deploy`
- **Packaging** : ajouter `bulk_package_projects`
- **Performance** (nouvelle catégorie, live) : `get_performance` (FPS + trail stats via `_perf_monitor`/`_perf_trail`)
- **Lessons** : `capture_lesson`, `scan_for_lessons`, `get_lesson`

Ne pas tenter d'être exhaustif au point de recopier la liste ; viser « catégories complètes + outils phares » pour rester lisible. Un lien vers `describe_td_tools` reste la source canonique.

### 6. Attribution — **ajout bottobot**

Ajouter l'entrée manquante :

```markdown
- [bottobot/touchdesigner-mcp-server](https://github.com/bottobot/touchdesigner-mcp-server) — inspiration for the offline documentation features: workflow suggestion engine, tutorials, network templates, experimental builds, techniques library, and TD version history
```

(FR) « inspiration pour les features de documentation offline : workflow suggestion engine, tutorials, network templates, builds expérimentaux, bibliothèque de techniques, historique des versions TD »

Garder l'ordre : 8beeeaaat en premier (code base), puis bottobot (inspiration features offline), puis satoruhiga, puis rheadsh.

### 7. Cohérences mineures

- Vérifier que les liens `docs/user-guide.md` (FR) et `docs/user-guide.en.md` (EN) sont corrects — OK, les deux fichiers existent dans `docs/`.
- `build:dist` — script réel dans `_mcp_server/package.json:73` : OK, conservé.
- Supprimer la mention « fork » tout court de l'encart en haut du README : le code `_mcp_server/` vient historiquement du fork, mais le repo `TD_starter_pack` lui-même n'est pas un fork. Reformuler en « Builds on [8beeeaaat/touchdesigner-mcp](...) with additional features... » plutôt que « Fork of... ».

## Verification

1. **Lecture comparée** : relire les deux README côte à côte, section par section, pour s'assurer de la parité EN/FR (titres, ordre, tables identiques).
2. **Factuel** :
   - `ls .claude/skills/` → correspond à la table Skills
   - `cat .gitmodules` → correspond à la section Submodules
   - `grep -c "^| " README.md` section tools → raisonnablement aligné avec la surface réelle
3. **Liens** : vérifier que tous les liens externes (GitHub repos) et internes (`docs/user-guide.*.md`, `LICENSE`) résolvent (`lychee` est configuré dans `lychee.toml` — `just check` ne lance pas lychee automatiquement, mais on peut faire `lychee README.md README.fr.md` manuellement si besoin).
4. **Pas de régression CI** : le badge CI en haut reste valide, aucun changement hors README → CI ne doit rien rejouer de différent.

## Hors scope

- Pas de refonte du `_mcp_server/README.md` (README du fork upstream).
- Pas d'ajout/suppression de features.
- Pas de traduction complète de `docs/user-guide.*` — ces fichiers sont déjà à jour et hors du périmètre de la demande.
