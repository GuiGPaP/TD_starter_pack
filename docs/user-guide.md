# TD Starter Pack — Guide utilisateur

[English version](user-guide.en.md)

## Table des matieres

- [Modes de fonctionnement](#modes-de-fonctionnement)
- [Outils MCP](#outils-mcp)
  - [Sante et connexion](#sante-et-connexion)
  - [Recherche et decouverte](#recherche-et-decouverte)
  - [Gestion des nodes](#gestion-des-nodes)
  - [Execution Python](#execution-python)
  - [Operateurs DAT](#operateurs-dat)
  - [Assemblage reseau](#assemblage-reseau)
  - [Deploiement](#deploiement)
  - [Introspection](#introspection)
- [Resources MCP](#resources-mcp)
- [Prompts MCP](#prompts-mcp)
- [Modes de securite execute_python_script](#modes-de-securite)
- [Audit log](#audit-log)
- [Recherche d'operateurs](#recherche-doperateurs)
- [Comparaison d'operateurs](#comparaison-doperateurs)
- [Compatibilite de version](#compatibilite-de-version)
- [Skills Claude](#skills-claude)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

## Modes de fonctionnement

Le serveur MCP fonctionne en deux modes qui se detectent automatiquement :

### Mode docs-only (sans TouchDesigner)

Le serveur demarre immediatement sans attendre TD. Les outils offline sont disponibles :
- Recherche d'operateurs, patterns GLSL, assets
- Consultation du catalogue de connaissances (operators, modules Python)
- Analyse et preview de scripts Python (sans execution)
- Consultation de l'audit log

### Mode live (avec TouchDesigner)

Quand TD est connecte (port 9981 par defaut), tous les outils deviennent disponibles :
- Creation, modification, suppression de nodes
- Execution de scripts Python dans TD
- Linting, formatage, validation de DATs
- Deploiement d'assets et patterns GLSL

Le passage d'un mode a l'autre est affiche dans les logs stderr du serveur. Utilisez `get_health` pour verifier l'etat de la connexion.

---

## Outils MCP

### Sante et connexion

| Outil | Mode | Description |
|-------|------|-------------|
| `get_health` | offline | Verifie la connexion TD : online, build, latence, compatibilite |
| `wait_for_td` | offline | Attend que TD soit disponible (timeout 1-120s, defaut 30s) |
| `get_capabilities` | offline | Capacites du serveur : mode, outils installes (ruff, pyright) |
| `get_td_info` | live | Infos de l'environnement TD : version, OS, build |

### Recherche et decouverte

| Outil | Mode | Description |
|-------|------|-------------|
| `search_operators` | offline | Recherche scoree dans le catalogue d'operateurs. Filtres : famille, version TD |
| `compare_operators` | offline | Comparaison cote-a-cote de 2 operateurs (params communs/uniques, version) |
| `search_glsl_patterns` | offline | Recherche de patterns GLSL par type, difficulte, tags |
| `search_td_assets` | offline | Recherche d'assets .tox reutilisables |
| `describe_td_tools` | offline | Manifeste de tous les outils MCP disponibles |

### Gestion des nodes

| Outil | Mode | Description |
|-------|------|-------------|
| `create_td_node` | live | Creer un node (auto-positionne si x/y omis) |
| `delete_td_node` | live | Supprimer un node |
| `get_td_nodes` | live | Lister les nodes sous un parent |
| `get_td_node_parameters` | live | Lire les parametres d'un node |
| `update_td_node_parameters` | live | Modifier les parametres d'un node |
| `get_td_node_errors` | live | Verifier les erreurs d'un node et ses enfants |

### Execution Python

| Outil | Mode | Description |
|-------|------|-------------|
| `execute_python_script` | live | Executer du Python dans TD avec modes de securite et preview |
| `exec_node_method` | live | Appeler une methode Python sur un node specifique |
| `get_exec_log` | offline | Consulter l'audit log des executions |

### Operateurs DAT

| Outil | Mode | Description |
|-------|------|-------------|
| `get_dat_text` | live | Lire le contenu texte d'un DAT |
| `set_dat_text` | live | Ecrire du contenu dans un DAT |
| `lint_dat` | live | Linter un DAT Python avec ruff (auto-fix optionnel) |
| `lint_dats` | live | Linter tous les DATs Python sous un parent |
| `typecheck_dat` | live | Typechecker un DAT avec pyright + stubs td.pyi |
| `format_dat` | live | Formater un DAT avec ruff format |
| `validate_glsl_dat` | live | Valider du code GLSL dans un DAT |
| `validate_json_dat` | live | Valider du JSON/YAML dans un DAT |
| `discover_dat_candidates` | live | Decouvrir les DATs sous un parent (python, glsl, text, data) |

### Assemblage reseau

| Outil | Mode | Description |
|-------|------|-------------|
| `create_geometry_comp` | live | Creer un Geometry COMP avec In/Out |
| `create_feedback_loop` | live | Creer une boucle feedback TOP (init, feedback, process, out) |
| `configure_instancing` | live | Configurer le GPU instancing sur un Geometry COMP |

### Deploiement

| Outil | Mode | Description |
|-------|------|-------------|
| `deploy_td_asset` | live | Deployer un asset .tox dans le projet (dry-run, force) |
| `deploy_glsl_pattern` | live | Deployer un pattern GLSL (cree les ops, injecte le code, connecte) |

### Introspection

| Outil | Mode | Description |
|-------|------|-------------|
| `get_node_parameter_schema` | live | Schema de parametres d'un node (type, range, menu, defaut) |
| `complete_op_paths` | live | Auto-completion de chemins op() |
| `get_chop_channels` | live | Canaux d'un CHOP avec statistiques |
| `get_dat_table_info` | live | Dimensions et apercu d'un table DAT |
| `get_comp_extensions` | live | Methodes et proprietes des extensions d'un COMP |
| `get_td_context` | live | Info contextuelle agregee d'un node (params, canaux, erreurs...) |
| `index_td_project` | live | Index du projet pour la completion de code |
| `get_td_classes` | offline | Liste des classes Python TouchDesigner |
| `get_td_class_details` | offline | Details d'une classe (methodes, proprietes) |
| `get_td_module_help` | offline | Documentation Python help() d'un module |
| `get_glsl_pattern` | offline | Details d'un pattern GLSL avec code source |
| `get_td_asset` | offline | Details d'un asset avec README |

---

## Resources MCP

Resources accessibles via le protocole MCP (lecture automatique par les clients) :

| URI | Description |
|-----|-------------|
| `td://modules` | Index des modules Python documentes |
| `td://modules/{id}` | Detail d'un module (ex: `td://modules/tdfunctions`) |
| `td://operators` | Index des 22 operateurs dans le catalogue |
| `td://operators/{id}` | Detail d'un operateur (enrichi avec les donnees live si TD connecte) |

---

## Prompts MCP

Prompts predefined pour guider Claude dans des taches courantes :

| Prompt | Arguments | Description |
|--------|-----------|-------------|
| Search node | nodeName, nodeFamily?, nodeType? | Recherche floue de nodes |
| Check node errors | nodePath | Inspection des erreurs d'un node |
| Node connection | — | Guide pour connecter des nodes |

---

## Modes de securite

`execute_python_script` supporte 3 modes de securite via le parametre `mode` :

### read-only (lecture seule)

Autorise : lecture de parametres, introspection, queries, `print()`, `len()`, `dir()`.

Bloque : assignation de parametres (`.par.x = ...`), `.create()`, `.connect()`, `.text = ...`, et tout ce qui est bloque en safe-write.

### safe-write (ecriture securisee)

Autorise : tout ce que read-only autorise + creation de nodes, modification de parametres, connexions.

Bloque : `.destroy()`, acces filesystem (`os.remove`, `shutil`, `open('w')`), execution dynamique (`exec()`, `eval()`), reseau (`socket`, `urllib`), `subprocess`, `sys.exit()`.

### full-exec (execution complete)

Aucune restriction. Comportement par defaut (retrocompatible).

### Preview

Le parametre `preview=true` analyse le script sans l'executer :

```
execute_python_script(
  script="op('/project1').par.tx = 5",
  mode="read-only",
  preview=true
)
```

Retourne : status (ALLOWED/BLOCKED), mode requis, violations avec numeros de ligne, niveau de confiance (high/medium/low).

### Limites

L'analyse est basee sur du pattern matching statique, pas un AST Python complet. Les constructions dynamiques (`eval()`, `getattr()`, `__import__()`) peuvent contourner les restrictions. **Ce n'est pas une sandbox de securite, c'est un garde-fou d'usage.**

---

## Audit log

Chaque appel a `execute_python_script` est enregistre dans un ring buffer en memoire (100 entrees max). Le log est perdu au redemarrage du serveur.

### Consulter le log

```
get_exec_log(limit=10)
get_exec_log(outcome="blocked")
get_exec_log(mode="read-only")
```

### Contenu d'une entree

- ID monotone, timestamp
- Script (tronque a 500 chars, secrets masques)
- Mode utilise, preview ou non
- Resultat : executed, blocked, previewed, error
- Duree d'execution
- Violations detectees (si applicable)

### Redaction automatique

- Chemins Windows avec noms d'utilisateur : `C:\Users\xxx\...` masques
- Tokens et cles d'API : patterns `key=`, `token:` masques

---

## Recherche d'operateurs

### Recherche scoree

```
search_operators(query="noise", family="TOP", maxResults=5)
```

Le scoring prend en compte : nom/id (100 pts), titre (90), description (50), mots-cles (30), aliases (30), famille (20). Bonus pour match exact (+50) ou debut de mot (+25).

### Multi-termes

Tous les termes doivent matcher (logique AND). Si 0 resultats, fallback automatique en OR.

### Fuzzy matching

Pour les termes > 3 caracteres, matching Levenshtein avec score reduit de 50%.

### Filtres

- `family` : TOP, CHOP, SOP, COMP, DAT, MAT
- `version` : filtre les operateurs indisponibles dans la version TD cible

---

## Comparaison d'operateurs

```
compare_operators(op1="noise-top", op2="noise-chop", detailLevel="detailed")
```

Retourne : parametres communs et uniques a chaque operateur, famille, nombre de parametres, compatibilite de version, descriptions. Fonctionne offline (donnees statiques) et mieux online (parametres live enrichis).

---

## Compatibilite de version

### Version manifest

Le serveur connait les versions TD 2020 a 2025 avec leur version Python et leur statut de support. La version stable actuelle est **TD 2025**.

### Donnees par operateur

Chaque operateur du catalogue peut avoir :
- `addedIn` : version d'ajout
- `deprecatedSince` : version de deprecation
- `removedIn` : version de suppression
- `suggestedReplacement` : operateur de remplacement

### Warnings automatiques

Les resultats de recherche incluent le statut de compatibilite (compatible, deprecated, unavailable) en tenant compte de la version TD connectee.

---

## Skills Claude

Les skills sont des guides specialises charges automatiquement par Claude Code :

| Skill | Usage |
|-------|-------|
| `td-guide` | Reseau TD, operateurs, layout, rendering, data conversion |
| `td-glsl` | Pixel shaders, GLSL TOP, effets 2D, textures generatives |
| `td-glsl-vertex` | Vertex shaders, GLSL MAT, materiaux 3D, deplacement |
| `td-pops` | Compute shaders, particules, GLSL POP, SSBO |
| `td-python` | TDFunctions, TDJSON, TDStoreTools, TDResources |
| `td-lint` | Linting Python, ruff, qualite de code DAT |
| `td-context` | Index projet, completion de code, contexte par node |

---

## Configuration

### .mcp.json (Claude Code — inclus dans le repo)

```json
{
  "mcpServers": {
    "touchdesigner": {
      "command": "node",
      "args": ["./_mcp_server/dist/cli.js"],
      "env": { "TD_WEB_SERVER_PORT": "9981" }
    }
  }
}
```

### Claude Desktop (chemin absolu)

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

### Variables d'environnement

| Variable | Defaut | Description |
|----------|--------|-------------|
| `TD_WEB_SERVER_HOST` | `http://127.0.0.1` | Hote du WebServer TD |
| `TD_WEB_SERVER_PORT` | `9981` | Port du WebServer TD |
| `TD_MCP_KNOWLEDGE_PATH` | auto | Chemin vers la base de connaissances |
| `TD_MCP_GLSLANG_PATH` | auto | Chemin vers glslangValidator |

---

## Troubleshooting

### Connexion MCP

- **Port occupe** (`EADDRINUSE`) — Changer `TD_WEB_SERVER_PORT` dans `.mcp.json`
- **TD absent au demarrage** — Normal, mode docs-only actif. `get_health` pour verifier
- **Config invalide** — Verifier le chemin : `node ./_mcp_server/dist/cli.js --help`
- **Verifier la connexion** — `get_health` (immediat) ou `wait_for_td` (attend 30s)

### Execution Python

- **Script bloque** — Verifier le `mode`. Utiliser `preview=true` pour analyser
- **Module `td` non trouve** — Normal hors de TD, les tests mockent via `conftest.py`
- **Timeout reseau** — TD peut etre lent a repondre. `wait_for_td(timeoutSeconds=60)`

### Validation GLSL

- **glslangValidator absent** — Auto-provisionne sur Windows x64. Autres OS : `brew install glslang` ou `apt install glslang-tools`
- **Echec download** — Supprimer le sentinel `.glslang_download_failed` pour forcer un retry
