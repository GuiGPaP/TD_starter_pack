# TD Starter Pack — TouchDesigner × Claude MCP

![CI](https://github.com/GuiGPaP/TD_starter_pack/actions/workflows/ci.yml/badge.svg)

Starter pack pour piloter TouchDesigner depuis Claude via le Model Context Protocol (MCP).

## Prérequis

- **TouchDesigner 2023+** (Python 3.11 intégré)
- **[uv](https://docs.astral.sh/uv/)** — gestionnaire de paquets Python
- **Claude Desktop** ou **Claude Code** avec MCP configuré

## Quick Start

```bash
# 1. Cloner le repo
git clone https://github.com/GuiGPaP/TD_starter_pack.git
cd TD_starter_pack

# 2. Installer les dépendances dev
uv sync
```

3. **Ouvrir `starter_pack.toe`** dans TouchDesigner — le composant `mcp_webserver_base.tox` lance le web bridge automatiquement, `import_modules.py` bootstrap les modules Python.

4. **Connecter Claude au web bridge TD** — le repo ne fournit pas de fichier de config MCP prêt à l'emploi. Pointez Claude vers l'URL du serveur TD actif.

## Outils MCP disponibles

| Catégorie | Outils |
|-----------|--------|
| **Nodes** | `get_nodes`, `get_node_detail`, `create_node`, `delete_node`, `update_node`, `get_node_errors` |
| **Helpers haut niveau** | `create_geometry_comp`, `create_feedback_loop`, `configure_instancing` |
| **Exécution** | `exec_python_script`, `exec_node_method` |
| **Introspection TD** | `get_td_info`, `get_td_python_classes`, `get_td_python_class_details`, `get_module_help` |

## Golden Path — workflows de base

### Créer un Geometry COMP

```python
create_geometry_comp(parentPath="/project1/base1", name="geo1", x=0, y=0)
```

### Créer une feedback loop

```python
create_feedback_loop(parentPath="/project1/base1", name="sim", processType="glslTOP")
```

### Configurer l'instancing

```python
configure_instancing(geoPath="/project1/base1/geo1", instanceOpName="noise_chop")
```

## Structure du projet

```
modules/
  mcp/services/          # logique métier (maintenu à la main)
  mcp/controllers/       # routing OpenAPI + handlers générés
  td_helpers/            # helpers réseau & layout
  td_server/             # serveur OpenAPI (d'origine générée)
  utils/                 # result types, logging, serialization
  tests/                 # pytest unit + smoke tests (fake_td.py = fake graph TD)
.claude/skills/          # 4 skills Claude (td-guide, td-glsl, td-glsl-vertex, td-pops)
starter_pack.toe         # projet TD de démarrage
mcp_webserver_base.tox   # composant serveur web MCP
import_modules.py        # bootstrap des modules au démarrage TD
```

## Code généré vs maintenu

- **Généré** : `modules/td_server/openapi_server/` (OpenAPI Generator) + `modules/mcp/controllers/generated_handlers.py`
- **Maintenu** : tout le reste sous `modules/`

Ces fichiers générés ont reçu des ajustements manuels coordonnés. L'OpenAPI spec reste la source de vérité, mais des mises à jour manuelles restent nécessaires tant que le workflow de régénération n'est pas formalisé. Exclus du linting/type-checking via `pyproject.toml`.

## Conventions d'extension

Pour ajouter une fonctionnalité :

1. **Helper** — ajouter une fonction dans `modules/td_helpers/` (duck-typed, pas de dépendance TD directe)
2. **Service** — exposer via une méthode dans `modules/mcp/services/api_service.py`
3. **OpenAPI** — mettre à jour la spec `openapi.yaml`, puis synchroniser les couches dérivées (`generated_handlers.py`, `default_controller.py`) — le workflow de régénération n'est pas encore formalisé
4. **Tests** — unit test du helper + smoke test du workflow bout-en-bout

> Quand mettre à jour les skills : si la surface d'outils MCP change (nouvel outil, paramètres modifiés).

## Développement

```bash
uv sync                              # installer les dépendances
uv run pytest                        # lancer les tests
uv run ruff check modules/           # lint
uv run ruff format modules/          # format
uv run pyright                       # type-check
just check                           # tout d'un coup (requiert just)
```

## Skills Claude

| Besoin | Skill |
|--------|-------|
| Réseau TD / opérateurs / layout | `td-guide` |
| Pixel shader / GLSL TOP | `td-glsl` |
| Vertex shader / GLSL MAT | `td-glsl-vertex` |
| Compute shader / particules | `td-pops` |

## Troubleshooting

- **Module `td` non trouvé** — normal hors de TouchDesigner, les tests mockent via `conftest.py`
- **Tests d'intégration Flask non collectés** — désélectionnés par défaut via `addopts` + markers dans `pyproject.toml`
- **`import_modules.py` ne trouve pas le schema** — vérifier le chemin `modules/td_server/openapi_server/openapi/openapi.yaml`

## Attribution

Basé sur et adapté de repos open-source (MIT) :
- [8beeeaaat/touchdesigner-mcp](https://github.com/8beeeaaat/touchdesigner-mcp) — serveur MCP TouchDesigner d'origine
- [satoruhiga/claude-touchdesigner](https://github.com/satoruhiga/claude-touchdesigner) — skill td-guide
- [rheadsh/audiovisual-production-skills](https://github.com/rheadsh/audiovisual-production-skills) — skills td-glsl, td-glsl-vertex, td-pops
