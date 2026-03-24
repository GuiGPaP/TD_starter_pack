<!-- session_id: c3cba092-b4ad-467c-91f6-f19055c51c4f -->
# Portabilité — Commiter .mcp.json pour zero-friction onboarding

## Context

Le projet est déjà portable (aucun chemin hardcodé dans les fichiers commités). Mais `.mcp.json` est gitignored, ce qui oblige l'utilisateur à copier manuellement `.mcp.example.json`. Pour simplifier l'onboarding Claude Code à zero étape de config.

## Changements

### 1. Retirer `.mcp.json` du `.gitignore`

### 2. Créer `.mcp.json` identique à `.mcp.example.json`

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

Le chemin relatif est portable — Claude Code résout depuis la racine du projet.

### 3. Mettre à jour le README Quick Start

Retirer l'étape de copie `.mcp.example.json → .mcp.json` puisque le fichier est désormais inclus.

## Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `.gitignore` | Retirer `.mcp.json` |
| `.mcp.json` | Commiter (identique à .mcp.example.json) |
| `README.md` | Simplifier Quick Start (retirer l'étape de copie) |

## Vérification

1. `git clone` frais → `.mcp.json` présent
2. Claude Code détecte le serveur MCP sans config manuelle
