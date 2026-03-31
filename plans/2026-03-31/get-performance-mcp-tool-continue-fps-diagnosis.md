<!-- session_id: 099e259a-9a19-4ca5-92d2-b016641e7be6 -->
# Fix get_performance MCP tool + continue FPS diagnosis

## Context

Steps 1-5 du plan précédent (async TDDocker) sont **déjà implémentés** et ThreadManager est résolu. Mais le user voit encore des drops à 45 FPS. L'outil MCP `get_performance` est cassé — il faut le fixer pour pouvoir diagnostiquer correctement.

## Bug dans get_performance

**Fichier :** `_mcp_server/src/features/tools/handlers/perfTools.ts` (ligne 38)

```python
for child in c.findChildren(type=performCHOP, depth=1):
```

`performCHOP` n'est pas défini dans le contexte `exec()` du MCP server. C'est un global TD disponible uniquement dans les textDATs inline, pas dans un `exec(script, namespace)`.

**Fix :** Utiliser le filtre par string : `c.findChildren(type=chopT, name='perform*')` ne marche pas non plus. La bonne approche : itérer et filtrer par `OPType`.

### Étape 1 — Corriger le PERF_SCRIPT

Remplacer le bloc performCHOP (lignes 33-48) par :

```python
    # Find any Perform CHOP in the project for real-time metrics
    for comp_path in [scope, '/']:
        c = op(comp_path)
        if not c or not c.isCOMP:
            continue
        for child in c.findChildren(depth=2):
            if child.OPType == 'perform' and child.isCHOP:
                chans = {}
                for ch in child.chans():
                    chans[ch.name] = round(ch[0], 3)
                result_data['global']['performCHOP'] = {
                    'path': child.path,
                    'channels': chans,
                }
                break
        if 'performCHOP' in result_data.get('global', {}):
            break
```

Changements :
- `type=performCHOP` → `child.OPType == 'perform' and child.isCHOP`
- Paths hardcodés → utilise `scope` puis `/` en fallback
- depth=1 → depth=2 pour trouver les Perform CHOP imbriqués

### Étape 2 — Build + test MCP

```bash
cd _mcp_server && npm run build && npm test
```

### Étape 3 — Utiliser get_performance pour diagnostiquer les drops à 45 FPS

Une fois l'outil fixé, lancer `get_performance` avec différents scopes pour identifier les opérateurs coûteux.

## Fichiers modifiés
- `_mcp_server/src/features/tools/handlers/perfTools.ts` — fix PERF_SCRIPT

## Vérification
1. `cd _mcp_server && npm run build && npm test`
2. MCP `get_performance` retourne des données sans erreur
3. Utiliser les résultats pour identifier la cause des drops à 45 FPS
