<!-- session_id: c3cba092-b4ad-467c-91f6-f19055c51c4f -->
# Issue #79 — Config client standardisée et documentation onboarding

## Context

Avec #77 (health tools) et #78 (docs-only mode), le serveur MCP est utilisable sans TD. Mais l'onboarding est incohérent :
- Le README dit "le repo ne fournit pas de fichier de config MCP prêt à l'emploi" (README.md:26)
- `.mcp.example.json` contient Context7 et Exa (hors scope) avec un placeholder `/ABSOLUTE/PATH/TO/`
- Les prérequis citent TD comme obligatoire et pas Node.js
- Pas de mention du mode docs-only

## Scope

Fichiers **documentation/config** dans le repo racine uniquement. Pas de code TS/Python.

## Changements

### 1. `.mcp.example.json` — simplifier (config locale au repo)

TD seul, chemin relatif (pour Claude Code qui résout depuis la racine du projet) :

```json
{
  "mcpServers": {
    "touchdesigner": {
      "command": "node",
      "args": ["./_mcp_server/dist/cli.js"],
      "env": {
        "TD_WEB_SERVER_PORT": "9981"
      }
    }
  }
}
```

- Chemin relatif = config locale au repo (Claude Code)
- `TD_WEB_SERVER_HOST` retiré (défaut `http://127.0.0.1` dans cli.ts:16)
- Pas de `--stdio` (défaut dans cli.ts:93)
- Les snippets Claude Desktop (chemin absolu) restent dans le README

### 2. `README.md` — Prérequis mis à jour

Remplacer la section Prérequis actuelle. Le prérequis principal pour docs-only est **Node.js + npm**. TD devient optionnel (mode live). uv passe en section Développement.

```markdown
## Prérequis

- **Node.js 18+** — requis pour le serveur MCP
- **TouchDesigner 2023+** *(optionnel)* — requis uniquement pour les outils live
- **Claude Code**, **Claude Desktop**, ou tout client MCP compatible
```

### 3. `README.md` — Quick Start en 2 modes

Remplacer le Quick Start actuel par :

**Mode docs-only (sans TouchDesigner)**
1. Cloner le repo + `git submodule update --init`
2. `cd _mcp_server && npm ci && npm run build:dist`
3. Copier `.mcp.example.json` vers `.mcp.json` (bash: `cp`, PowerShell: `Copy-Item`)
4. Relancer Claude Code — les tools de recherche (operators, GLSL patterns, assets) sont disponibles

**Mode live (avec TouchDesigner)**
1. Tout ce qui est au-dessus
2. Ouvrir `starter_pack.toe` dans TouchDesigner
3. Utiliser `get_health` pour vérifier la connexion, ou `wait_for_td` pour attendre que TD soit prêt

Prudence : ne pas promettre "auto-activation" — décrire le comportement actuel (probe au démarrage + `get_health`/`wait_for_td` pour vérifier).

### 4. `README.md` — section Configuration multi-client

Après le Quick Start :

**Claude Code** (config locale au projet) :
```
Copier .mcp.example.json → .mcp.json
```

**Claude Desktop** (`claude_desktop_config.json`, chemin absolu) :
```json
{
  "mcpServers": {
    "touchdesigner": {
      "command": "node",
      "args": ["C:/chemin/vers/_mcp_server/dist/cli.js"],
      "env": { "TD_WEB_SERVER_PORT": "9981" }
    }
  }
}
```

**Codex CLI** :
```bash
codex mcp add touchdesigner -- node /chemin/vers/_mcp_server/dist/cli.js
```

### 5. `README.md` — tableau tools avec colonne Mode

Refondre le tableau pour ajouter une colonne **Mode** (offline / live) :

| Catégorie | Outil | Mode |
|-----------|-------|------|
| **Santé** | `get_health`, `wait_for_td` | offline |
| **Recherche** | `search_td_assets`, `search_glsl_patterns`, `describe_td_tools` | offline |
| **Catalogues** | `get_td_asset`, `get_glsl_pattern`, `get_capabilities` | offline |
| **Nodes** | `create_td_node`, `delete_td_node`, `get_td_nodes`, ... | live |
| **DAT** | `get_dat_text`, `set_dat_text`, `lint_dat`, `lint_dats`, ... | live |
| **Exécution** | `execute_python_script`, `exec_node_method` | live |
| **Deploy** | `deploy_td_asset`, `deploy_glsl_pattern` | live |
| etc. | | |

### 6. `README.md` — Troubleshooting MCP

Ajouter après le troubleshooting existant :

- **Port conflict** (`EADDRINUSE`) — changer `TD_WEB_SERVER_PORT` dans `.mcp.json` ou fermer les autres instances TD
- **TD absent** — normal, le serveur démarre en mode docs-only. Utiliser `get_health` pour vérifier la connexion
- **Config invalide** — vérifier que le chemin vers `dist/cli.js` existe : `node ./_mcp_server/dist/cli.js --help`
- **Vérifier la connexion** — appeler `get_health` (résultat immédiat) ou `wait_for_td` (attend jusqu'à 30s)

### 7. `README.md` — structure du projet

Ajouter `_mcp_server/` dans l'arborescence, mentionner explicitement que c'est un git submodule :

```
_mcp_server/              # serveur MCP Node.js (git submodule → GuiGPaP/touchdesigner-mcp)
```

### 8. `README.md` — section Développement

Déplacer `uv sync` et les commandes Python ici (au lieu des prérequis). Ajouter les commandes MCP server :

```bash
# Python (modules TD)
uv sync && uv run pytest

# MCP Server (Node.js)
cd _mcp_server && npm ci && npm test
```

## Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `.mcp.example.json` | Simplifié : TD seul, chemin relatif, env minimal |
| `README.md` | Prérequis, Quick Start 2 modes, config multi-client, tools avec Mode, troubleshooting MCP, structure, dev |

## Vérification

1. Vérifier que `_mcp_server/dist/cli.js` existe après build
2. Relire le README de bout en bout pour cohérence
3. Tester `cp .mcp.example.json .mcp.json` + relancer Claude Code → serveur détecté
