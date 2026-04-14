# TD Starter Pack — TouchDesigner x Claude MCP

![CI](https://github.com/GuiGPaP/TD_starter_pack/actions/workflows/ci.yml/badge.svg)

Starter pack pour piloter TouchDesigner depuis Claude via le Model Context Protocol (MCP).
Le serveur MCP fonctionne en **mode docs-only** (recherche d'operateurs, GLSL patterns, assets) sans TouchDesigner, et passe automatiquement en **mode live** quand TD est connecte.

> Base sur [8beeeaaat/touchdesigner-mcp](https://github.com/8beeeaaat/touchdesigner-mcp) avec des fonctionnalites supplementaires : validation GLSL, linting/typechecking de DATs, indexation de projet, base de connaissances (542 docs offline), templates reseau, suggestions de workflow, bibliotheque de tutoriels, historique des versions TD, skills Claude, et plus.

**[Guide utilisateur complet](docs/user-guide.md)** | **[Full user guide (EN)](docs/user-guide.en.md)**

[Read in English](README.md)

## Prerequis

- **Node.js 18+** — requis pour le serveur MCP
- **TouchDesigner 2023+** *(optionnel)* — requis uniquement pour les outils live
- **Claude Code**, **Claude Desktop**, ou tout client MCP compatible

## Quick Start

### Mode docs-only (sans TouchDesigner)

```bash
# 1. Cloner le repo et initialiser les submodules (TDpretext, TDDocker)
git clone https://github.com/GuiGPaP/TD_starter_pack.git
cd TD_starter_pack
git submodule update --init --recursive

# 2. Builder le serveur MCP
cd _mcp_server
npm ci
npm run build:dist
cd ..
```

3. Relancer Claude Code dans ce dossier — la config MCP est incluse (`.mcp.json`), les tools de recherche sont disponibles immediatement (operateurs, GLSL patterns, assets).

### Mode live (avec TouchDesigner)

1. Completer le Quick Start docs-only ci-dessus
2. Ouvrir `starter_pack.toe` dans TouchDesigner — le composant `mcp_webserver_base.tox` lance le web bridge sur le port 9981
3. Utiliser `get_health` pour verifier la connexion, ou `wait_for_td` pour attendre que TD soit pret

## Submodules

Deux composants vivent dans leurs propres repos publics et sont inclus ici en tant que submodules git (extraits le 2026-04-14 pour une distribution OSS standalone) :

- **[TDpretext](https://github.com/GuiGPaP/TDpretext)** (`TDpretext/`) — Layout de texte base sur Pretext dans TouchDesigner via Web Render TOP.
- **[TDDocker](https://github.com/GuiGPaP/TDDocker)** (`TDDocker/`) — Gestionnaire de cycle de vie Docker pour TD (compose overlay, transports, watchdog). Contient un submodule imbrique `TD_SLlidar_docker/sllidar_ros2/` pinne sur l'upstream Slamtec.

Apres clonage, toujours executer :

```bash
git submodule update --init --recursive
```

## Configuration multi-client

### Claude Code (config locale au projet)

Le fichier `.mcp.example.json` est pret pour Claude Code (chemin relatif) :

```bash
cp .mcp.example.json .mcp.json
```

### Claude Desktop (`claude_desktop_config.json`)

Utiliser un **chemin absolu** vers `dist/cli.js` :

```json
{
  "mcpServers": {
    "touchdesigner": {
      "command": "node",
      "args": ["C:/chemin/vers/TD_starter_pack/_mcp_server/dist/cli.js"],
      "env": { "TD_WEB_SERVER_PORT": "9981" }
    }
  }
}
```

### Codex CLI

```bash
codex mcp add touchdesigner -- node /chemin/vers/TD_starter_pack/_mcp_server/dist/cli.js
```

## Outils MCP disponibles

| Categorie | Outils | Mode |
|-----------|--------|------|
| **Sante** | `get_health`, `wait_for_td` | offline |
| **Recherche** | `search_operators`, `search_td_assets`, `search_glsl_patterns`, `search_projects`, `search_tutorials`, `search_techniques`, `search_workflow_patterns`, `search_network_templates`, `search_snippets`, `search_palette`, `search_lessons`, `describe_td_tools` | offline |
| **Comparaison** | `compare_operators` | offline |
| **Catalogues** | `get_td_asset`, `get_glsl_pattern`, `get_tutorial`, `get_technique`, `get_workflow_pattern`, `get_network_template`, `get_snippet`, `get_lesson`, `get_capabilities` | offline |
| **Workflow** | `suggest_workflow` | offline |
| **Versions** | `list_versions`, `get_version_info`, `list_experimental_builds`, `get_experimental_build` | offline |
| **Catalogue projets** | `scan_projects`, `search_projects` | offline |
| **Nodes** | `get_td_nodes`, `get_td_node_parameters`, `create_td_node`, `delete_td_node`, `update_td_node_parameters`, `get_td_node_errors`, `scan_network_errors` | live |
| **Layout / Cablage** | `layout_nodes`, `connect_nodes`, `copy_node`, `screenshot_operator`, `export_subgraph` | live |
| **Helpers** | `create_geometry_comp`, `create_feedback_loop`, `configure_instancing` | live |
| **Execution** | `execute_python_script` (modes: read-only/safe-write/full-exec), `exec_node_method` | live |
| **Audit** | `get_exec_log` | offline |
| **Packaging** | `package_project`, `bulk_package_projects` | live |
| **Introspection TD** | `get_td_info`, `get_td_classes`, `get_td_class_details`, `get_td_module_help` | live |
| **Introspection noeuds** | `get_node_parameter_schema`, `complete_op_paths`, `get_chop_channels`, `get_dat_table_info`, `get_comp_extensions` | live |
| **DAT** | `get_dat_text`, `set_dat_text`, `lint_dat`, `lint_dats`, `typecheck_dat`, `format_dat`, `discover_dat_candidates` | live |
| **Validation** | `validate_glsl_dat`, `validate_json_dat` | live |
| **Deploy** | `deploy_td_asset`, `deploy_glsl_pattern`, `deploy_network_template`, `undo_last_deploy` | live |
| **Palette** | `index_palette`, `load_palette_component` | live |
| **Contexte projet** | `index_td_project`, `get_td_context` | live |
| **Performance** | `get_performance` (FPS + trail stats via `_perf_monitor` / `_perf_trail`) | live |
| **Lessons** | `capture_lesson`, `scan_for_lessons` | live |

**offline** = fonctionne sans TouchDesigner | **live** = requiert une connexion TD active

> Appeler `describe_td_tools` au runtime pour la liste canonique toujours a jour.

## Golden Path — workflows de base

### Creer un Geometry COMP

```python
create_geometry_comp(parentPath="/project1/base1", name="geo1", x=0, y=0)
```

### Creer une feedback loop

```python
create_feedback_loop(parentPath="/project1/base1", name="sim", processType="glslTOP")
```

### Configurer l'instancing

```python
configure_instancing(geoPath="/project1/base1/geo1", instanceOpName="noise_chop")
```

## Structure du projet

```
_mcp_server/             # serveur MCP Node.js (inline depuis 2026-03-26) — fork a l'origine de 8beeeaaat/touchdesigner-mcp
TDpretext/               # submodule : layout de texte Pretext dans TD (Web Render TOP)
TDDocker/                # submodule : gestionnaire Docker pour TD (+ submodule SLlidar imbrique)
modules/
  mcp/services/          # logique metier (maintenu a la main)
  mcp/controllers/       # routing OpenAPI + handlers generes
  td_helpers/            # helpers reseau & layout
  td_server/             # serveur OpenAPI (d'origine generee)
  utils/                 # result types, logging, serialization
  tests/                 # pytest unit + smoke tests (fake_td.py = fake graph TD)
.claude/skills/          # skills Claude (td-guide, td-glsl, td-python, td-pretext, td-sketch-ui)
.mcp.example.json        # config MCP exemple (copier vers .mcp.json)
starter_pack.toe         # projet TD de demarrage
mcp_webserver_base.tox   # composant serveur web MCP
import_modules.py        # bootstrap des modules au demarrage TD
```

## Code genere vs maintenu

- **Genere** : `modules/td_server/openapi_server/` (OpenAPI Generator) + `modules/mcp/controllers/generated_handlers.py`
- **Maintenu** : tout le reste sous `modules/`

Ces fichiers generes ont recu des ajustements manuels coordonnes. L'OpenAPI spec reste la source de verite, mais des mises a jour manuelles restent necessaires tant que le workflow de regeneration n'est pas formalise. Exclus du linting/type-checking via `pyproject.toml`.

## Conventions d'extension

Pour ajouter une fonctionnalite :

1. **Helper** — ajouter une fonction dans `modules/td_helpers/` (duck-typed, pas de dependance TD directe)
2. **Service** — exposer via une methode dans `modules/mcp/services/api_service.py`
3. **OpenAPI** — mettre a jour la spec `openapi.yaml`, puis synchroniser les couches derivees (`generated_handlers.py`, `default_controller.py`)
4. **Tests** — unit test du helper + smoke test du workflow bout-en-bout

> Quand mettre a jour les skills : si la surface d'outils MCP change (nouvel outil, parametres modifies).

## Developpement

### Python (modules TouchDesigner)

```bash
uv sync                              # installer les dependances
uv run pytest                        # lancer les tests
uv run ruff check modules/           # lint
uv run ruff format modules/          # format
uv run pyright                       # type-check
just check                           # tout d'un coup (requiert just)
```

### MCP Server (Node.js)

```bash
cd _mcp_server
npm ci                               # installer les dependances
npm run build:dist                   # compiler TypeScript
npm test                             # lancer les tests
npm run lint                         # lint + typecheck
```

## Skills Claude

| Besoin | Skill |
|--------|-------|
| Reseau TD / operateurs / layout / rendu / contexte projet | `td-guide` |
| Shaders GLSL (pixel, vertex, compute, particules) | `td-glsl` |
| Utilitaires Python (TDFunctions, TDJSON, TDStoreTools, TDResources), linting DAT, ruff | `td-python` |
| Layout de texte natif / atlas de fontes / evitement d'obstacles | `td-pretext` |
| UI depuis sketch / wireframe → widgets Palette | `td-sketch-ui` |

En cas de doute, commencer par `td-guide` — il route vers `td-glsl` pour les shaders et `td-python` pour le travail Python.

## Troubleshooting

### MCP / Connexion

- **Port conflict** (`EADDRINUSE`) — changer `TD_WEB_SERVER_PORT` dans `.mcp.json` ou fermer les autres instances TouchDesigner
- **TD absent au demarrage** — normal, le serveur demarre en mode docs-only. Les outils offline fonctionnent. Utiliser `get_health` pour verifier la connexion
- **Config invalide** — verifier que le chemin vers `dist/cli.js` existe : `node ./_mcp_server/dist/cli.js --help`
- **Verifier la connexion TD** — appeler `get_health` (resultat immediat) ou `wait_for_td` (attend jusqu'a 30s)

### Python / TouchDesigner

- **Module `td` non trouve** — normal hors de TouchDesigner, les tests mockent via `conftest.py`
- **Tests d'integration Flask non collectes** — deselectionnes par defaut via `addopts` + markers dans `pyproject.toml`
- **`import_modules.py` ne trouve pas le schema** — verifier le chemin `modules/td_server/openapi_server/openapi/openapi.yaml`

## Versioning

Ce monorepo contient deux composants versionnes independamment :

- **`pyproject.toml` (v0.1.0)** — wrapper Python du monorepo (tests, CI, modules). Suit son propre SemVer, demarre au MVP.
- **`_mcp_server/package.json` (v1.5.0-td.1)** — serveur MCP TouchDesigner, forke depuis [8beeeaaat/touchdesigner-mcp](https://github.com/8beeeaaat/touchdesigner-mcp) v1.5.0. Le suffixe `-td.1` marque notre divergence pour TD_starter_pack.

Ces cycles restent separes volontairement : le serveur MCP peut etre publie seul sur npm, tandis que le wrapper root suit le rythme de release du starter-pack.

## Attribution

Base sur et adapte de repos open-source (MIT) :
- [8beeeaaat/touchdesigner-mcp](https://github.com/8beeeaaat/touchdesigner-mcp) — serveur MCP TouchDesigner d'origine (code de base pour `_mcp_server/`)
- [bottobot/touchdesigner-mcp-server](https://github.com/bottobot/touchdesigner-mcp-server) — inspiration pour les features de documentation offline : workflow suggestion engine, tutoriels, network templates, builds experimentaux, bibliotheque de techniques, historique des versions TD
- [satoruhiga/claude-touchdesigner](https://github.com/satoruhiga/claude-touchdesigner) — skill td-guide
- [rheadsh/audiovisual-production-skills](https://github.com/rheadsh/audiovisual-production-skills) — materiel des skills GLSL / POP (fusionne dans `td-glsl`)

## Licence

[MIT](LICENSE)
