<!-- session_id: 6010ec0d-bd40-4517-ab69-a9875d2027ce -->
# Introspection toolkits — enrichir les données knowledge base

## Context

POPx est un toolkit tiers pour TouchDesigner (61 opérateurs custom, ~2500+ paramètres). Le projet TD est ouvert avec POPx à `/POPX_1_2_1`. Les toolkit JSON stubs dans `_mcp_server/data/td-knowledge/toolkits/` sont vides — il faut les peupler avec des données d'introspection réelles.

## Découverte

- **Chemin :** `/POPX_1_2_1`
- **Structure :** `/POPX_1_2_1/custom_operators/` contient les 61 opérateurs exposés
- **Types :** Majoritairement `geometryCOMP`, quelques `annotateCOMP`, 1 `lightCOMP`
- **Params custom :** de 5 (`popxto`) à 133 (`path_tracer`)
- **detect_toolkits** ne les trouve pas au chemin par défaut — `detectionPaths` à mettre à jour

## Plan d'introspection

### Étape 1 — Script d'introspection complet
Exécuter un script Python via `execute_python_script` qui pour chaque opérateur custom :
- Liste tous les `customPars` avec `name`, `label`, `style`, `default`, `min`, `max`, `menuNames`, `menuLabels`
- Regroupe par `page`
- Capture le `OPType` et `family`

Le script retourne un JSON structuré qu'on peut directement transformer en fichier toolkit.

### Étape 2 — Générer le JSON enrichi
Écrire `_mcp_server/data/td-knowledge/toolkits/popx.json` avec :
- L'inventaire complet des 61 opérateurs
- Paramètres custom par opérateur (name, label, style, default, page)
- Catégorisation (generators, filters, modifiers, falloffs, etc.)
- `detectionPaths: ["/POPX_1_2_1"]`

### Étape 3 — Mettre à jour le stub `popx.json` existant
Remplacer le stub actuel par les données introspectées.

### Étape 4 — Vérifier
- `npm run build && npm test` — le JSON doit être validé par le schema `toolkit`
- `detect_toolkits` avec `rootPath: /` devrait trouver POPx
- `search_toolkits` avec query "popx" retourne l'entrée enrichie

## Fichiers impactés
- `_mcp_server/data/td-knowledge/toolkits/popx.json` — enrichi (gitignored, local only)

## Phase 2 — Introspection des 55 exemples POPx → templates

### Architecture discoverable
```
_mcp_server/data/td-knowledge/toolkits/popx-examples/
  popx-aim.json
  popx-dlg.json
  popx-flow-interactive.json
  popx-soft-body-inflate.json
  ...  (55 fichiers)
```

Chaque fichier = 1 template `kind: "template"`, auto-découvert par le loader.
Cherchable via `search_network_templates`, déployable via `deploy_network_template`.
Le tout dans `toolkits/` → gitignored (propriétaire).

### Workflow d'introspection
Pour chaque des 55 exemples :
1. Charger via `op('/EXAMPLE_LOADER').par.Example = name; .par.Reload.pulse()`
2. Attendre le cook (problème synchrone — voir ci-dessous)
3. Introspecter `/EXAMPLE_LOADER/example/` :
   - Opérateurs utilisés → `payload.operators[]`
   - Connexions → `payload.connections[]`
   - Paramètres non-default → `payload.parameters{}`
   - Description (textDAT `description`) → `content.summary`
4. Écrire le JSON template dans `popx-examples/`

### Contrainte synchrone
`execute_python_script` est synchrone — pas de `delayFrames`.
**Solution :** script TD-side qui écrit un DAT avec les résultats après chargement complet, puis on lit le DAT. Ou : appels MCP séquentiels (1 par exemple, avec un court délai entre chaque).

### Schema template (existant, à réutiliser)
```json
{
  "id": "popx-dlg",
  "title": "POPx Example: DLG (Diffusion Limited Growth)",
  "kind": "template",
  "payload": {
    "category": "popx-example",
    "difficulty": "intermediate",
    "tags": ["popx", "dlg", "generative"],
    "operators": [{"name": "dlg1", "opType": "geometryCOMP", "family": "COMP", ...}],
    "connections": [{"from": "pointgen1", "to": "dlg1", "toInput": 0}],
    "parameters": {"dlg1": {"Iterations": 100, ...}}
  }
}
```

## Phase 3 — Introspection T3D

### Découverte
- **Chemin :** `/T3D_1_12_7`
- **Opérateurs :** `/T3D_1_12_7/T3D_operators/` — 49 opérateurs custom (baseCOMP + quelques geometryCOMP)
- **Pas d'example loader** — exemples dans des `.toe` séparés (`custom OP/T3D_1_12_7/T3D_1_12_7.toe`)
- **Domaine :** 3D textures volumétriques (noise, SDF, fluid, fractal, metaball, etc.)

### Étapes — DONE
1. **Introspection params** — 41 opérateurs, 1254 params → `data/introspection/t3d.json`
2. **Enrichir `t3d.json`** — Inventaire complet, `detectionPaths: ["/T3D_1_12_7"]`, confidence high
3. **Templates exemples** — 6 scènes T3D dans `/project1` introspectées → `data/td-knowledge/toolkits/t3d-examples/`

### Fichiers
- `data/introspection/t3d.json` — introspection brute (gitignored)
- `data/td-knowledge/toolkits/t3d.json` — toolkit entry enrichie (gitignored)
- `data/td-knowledge/toolkits/t3d-examples/*.json` — 6 templates scènes (gitignored)

## Notes
- Les données sont propriétaires (Patreon) — ne pas commit les paramètres/structure interne
- Tous les fichiers sont gitignorés, ils restent locaux uniquement
- Les opérateurs POPx sont des COMPs, pas une vraie famille POP — le prefix est conceptuel
- T3D n'a pas d'example loader, donc pas de templates auto-générés
