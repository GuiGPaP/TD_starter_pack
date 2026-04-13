<!-- session_id: 0a3937d6-5e5a-4251-9267-3b387a24a32a -->
# Plan: #87 — Auto-enrichir les operator examples depuis snippets data

## Context

405 opérateurs sont documentés dans `_mcp_server/data/td-knowledge/operators/`, mais seulement 22 (5.4%) ont des `examples` structurés. Les 483 snippets extraits dans #105 contiennent des données réelles (paramètres récurrents, fréquences, valeurs top) qui peuvent auto-générer des exemples de haute qualité pour 314 opérateurs (77%).

## Approche

### 1. Script Node.js d'enrichissement

**Fichier:** `_mcp_server/scripts/enrichOperatorExamples.ts`

Le script :
1. Charge `snippets_data/snippets_analysis.json` (paramètres récurrents par opType)
2. Charge `snippets_data/snippets_index.json` (readMePreview par snippet)
3. Pour chaque fichier operator JSON **sans** `examples` :
   - Trouve le match opType dans snippets_analysis
   - Sélectionne les 2-3 paramètres les plus fréquents (frequency ≥30%)
   - Génère 2-3 exemples Python :
     - Exemple "set": configurer les params avec les valeurs top
     - Exemple "get/read": lire une valeur depuis l'opérateur
     - Exemple "common pattern" (si readMe disponible)
   - Écrit le champ `examples` dans le fichier JSON
4. Rapport : combien d'opérateurs enrichis, combien ignorés (pas de snippet match)

### 2. Schéma des exemples générés

```json
{
  "label": "Set noise parameters",
  "language": "python",
  "code": "n = op('noise1')\nn.par.type = 'sparse'\nn.par.amp = 0.5",
  "context": "textport",
  "description": "Common pattern from 45 real Derivative examples"
}
```

Schema existant : `_mcp_server/src/features/resources/types.ts:82-97`

### 3. Ne PAS toucher les 22 opérateurs qui ont déjà des exemples manuels

Les exemples existants sont de meilleure qualité (écrits à la main). On enrichit uniquement les fichiers sans `examples`.

## Fichiers impactés

| Action | Fichier |
|--------|---------|
| Créer | `_mcp_server/scripts/enrichOperatorExamples.ts` |
| Modifier | ~314 fichiers `_mcp_server/data/td-knowledge/operators/*.json` |
| Lire | `snippets_data/snippets_analysis.json` (source) |
| Lire | `snippets_data/snippets_index.json` (source) |

## Vérification

1. `npm run build` — compile
2. `npm test` — tests passent
3. Vérifier 5-10 fichiers enrichis manuellement (exemples cohérents, code valide)
4. Compter avant/après : `grep -rl '"examples"' data/td-knowledge/operators/ | wc -l`
5. Vérifier que les 22 existants n'ont pas été modifiés
