<!-- session_id: 6010ec0d-bd40-4517-ab69-a9875d2027ce -->
# Import bulk doc TD officielle → knowledge base

## Context

Notre knowledge base a 22 opérateurs manuels. dotsimulate expose ~629 opérateurs via `search_touchdesigner_docs` + `get_full_touchdesigner_doc`. On veut importer cette doc dans notre format `operator` kind pour que nos tools (`search_operators`, `compare_operators`) soient complets.

## Dimensionnement

| Famille | Opérateurs | doc_id pattern |
|---------|-----------|----------------|
| TOP | 166 | `noiseTOP`, `feedbackTOP`, etc. |
| CHOP | 189 | `noiseCHOP`, `mathCHOP`, etc. |
| POP | ~120 | `noisePOP`, `glslPOP`, etc. |
| MAT | 22 | `glslMAT`, `phongMAT`, etc. |
| SOP | ~100 | `circleSOP`, `sphereSOP`, etc. |
| DAT | ~60 | `textDAT`, `tableDAT`, etc. |
| COMP | ~30 | `baseCOMP`, `geometryCOMP`, etc. |
| **Total** | **~687** | |

## Approche : script d'import automatisé

### Étape 1 — Créer un script TypeScript d'import

Fichier : `_mcp_server/scripts/importDotsimulateOps.ts`

Le script :
1. Appelle `search_touchdesigner_docs` par famille pour récupérer les `doc_id` des opérateurs
2. Pour chaque `doc_id` de type `operator_unique`, appelle `get_full_touchdesigner_doc`
3. Parse le contenu markdown : extrait les paramètres (nom, type interne, description)
4. Génère un JSON au format `operator` kind schema existant
5. Écrit dans `data/td-knowledge/operators/<id>.json`

### Problème : les appels MCP sont côté client

Le script doit appeler le MCP dotsimulate directement via HTTP (pas via le SDK MCP). On a le Bearer token. C'est un simple `fetch()` avec le protocol JSON-RPC.

### Étape 2 — Script Python alternatif (plus simple)

Plutôt qu'un script TS, un simple script Python/Node qui :
1. POST au endpoint dotsimulate avec `tools/call` JSON-RPC
2. Parse les résultats
3. Génère les JSON

### Étape 3 — Approche pragmatique : batches MCP manuels

Plutôt qu'un script, on peut faire l'import directement depuis Claude Code :
1. Fetch les category pages → extraire les doc_ids d'opérateurs
2. Par batch de 5-10, fetch les full docs
3. Un subagent convertit chaque doc en JSON operator schema
4. Écrit les fichiers

**Contrainte :** ~700 appels MCP = beaucoup de round-trips. Le plus efficace serait un script qui fait tout en une passe.

## Plan retenu : script Node.js d'import

### Fichier : `_mcp_server/scripts/importTdDocs.ts`

```typescript
// 1. Fetch category pages to get all operator doc_ids
// 2. For each operator doc_id, fetch full doc
// 3. Parse markdown parameters into structured JSON
// 4. Write to data/td-knowledge/operators/
```

### Parsing des paramètres
Le format dotsimulate est cohérent :
```
**Parameter Name** (`paramInternalName`) - Type: ParType
Description text.
```

Regex : `/\*\*(.+?)\*\*\s*\(`(.+?)`\)\s*-\s*Type:\s*(\w+)\n(.+?)(?=\n\n|\*\*|$)/gs`

### Schema de sortie (operator kind existant)
```json
{
  "id": "noise-top",
  "title": "Noise TOP",
  "kind": "operator",
  "aliases": [],
  "searchKeywords": ["noise", "random", "perlin", "simplex"],
  "content": { "summary": "..." },
  "provenance": { "source": "td-docs", "confidence": "high", "license": "MIT" },
  "payload": {
    "opType": "noiseTOP",
    "opFamily": "TOP",
    "parameters": [
      { "name": "type", "label": "Type", "style": "Menu", "description": "..." },
      { "name": "seed", "label": "Seed", "style": "Float", "description": "..." }
    ],
    "versions": {}
  }
}
```

### Gestion des 22 existants
Les 22 opérateurs déjà dans notre base (avec `examples`) seront **enrichis** (ajout des params manquants, descriptions) sans écraser les `examples` existants.

## Fichiers impactés
- `_mcp_server/scripts/importTdDocs.ts` — **Nouveau** — script d'import
- `_mcp_server/data/td-knowledge/operators/*.json` — ~700 fichiers (22 enrichis + ~650 nouveaux)

## Vérification
- `npm run build && npm test` — corpus test doit passer avec les nouveaux fichiers
- `search_operators` avec query "noise" retourne le Noise TOP enrichi
- `search_operators` avec query "audio" retourne les Audio CHOPs (nouveaux)
- Total des opérateurs dans la registry >> 22
