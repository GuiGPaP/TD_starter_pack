<!-- session_id: 6010ec0d-bd40-4517-ab69-a9875d2027ce -->
# Conversion submodule → mono-repo

## Context

`_mcp_server/` est un submodule pointant vers `GuiGPaP/touchdesigner-mcp` (branche `td-starter-pack`). 15 commits non pushés sur `feat/issue-54-fusion-static-live`. L'utilisateur veut un mono-repo pur : plus de submodule, le code MCP server vit directement dans le repo parent.

## Étapes

### 1. Push submodule (préserver l'historique distant)
```bash
cd _mcp_server && git push origin feat/issue-54-fusion-static-live
```
Assure que les commits existent sur le remote avant suppression.

### 2. Sauvegarder le contenu + les fichiers non trackés
```bash
# Copier le contenu (sans .git/) dans un dossier temp
cp -r _mcp_server /tmp/_mcp_server_backup
rm -rf /tmp/_mcp_server_backup/.git
# Copier aussi les toolkit data non trackés
```

### 3. Supprimer le submodule proprement
```bash
git submodule deinit -f _mcp_server
git rm -f _mcp_server
rm -rf .git/modules/_mcp_server
```
Cela supprime aussi `.gitmodules` (ou la section dedans).

### 4. Restaurer le contenu comme dossier normal
```bash
cp -r /tmp/_mcp_server_backup _mcp_server
```

### 5. Mettre à jour .gitignore
- Ajouter `_mcp_server/data/td-knowledge/toolkits/` au .gitignore racine
- Vérifier que le `.gitignore` du MCP server (qui ignore `src/gen/`) est toujours actif

### 6. Git add + commit
```bash
git add _mcp_server/ .gitignore
git commit -m "refactor: convert _mcp_server submodule to mono-repo"
```

### 7. Nettoyer
- Supprimer `/tmp/_mcp_server_backup`
- Vérifier `npm run build && npm test` dans `_mcp_server/`

## Vérification
- `git submodule status` → rien
- `cat .gitmodules` → n'existe plus
- `ls _mcp_server/src/` → code présent
- `npm run build && npm test` dans `_mcp_server/` → tout passe
- `_mcp_server/data/td-knowledge/toolkits/` → existe sur disque, ignoré par git
