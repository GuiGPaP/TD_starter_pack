<!-- session_id: 36620acd-2faa-472b-9dca-2c1263868f5d -->
# Epic 7 — Clôture compartimentée

## Context

Epic 7 (MCP Resources + mode offline) est terminé côté code — PRs #51–#54 mergées dans `_mcp_server`. Les 6 issues (#50–#55) sont encore OPEN sur GitHub (`GuiGPaP/TD_starter_pack`). La clôture doit **prouver** que tout fonctionne, pas l'assumer.

### Gouvernance

- **Source canonique** : JSON dans `_mcp_server/data/td-knowledge/` (décision PR1)
- **Skills markdown** (`.claude/skills/td-python/references/`) : informatif, non bloquant, pas de contrat de synchro
- **Repo GitHub** : toutes les issues sont sur `GuiGPaP/TD_starter_pack`
- **PopMenu** : couvert comme membre de TDResources dans `tdresources.json`, pas un 5e module séparé
- **Corpus** : 4 modules Python (tdfunctions, tdjson, tdstoretools, tdresources) + 1 opérateur sample (glsl-top)

---

## Tâche 1 : Gate initiale offline

```bash
cd _mcp_server
npm run build        # compilation TS + copie data/
npm run lint         # biome + tsc --noEmit + ruff + prettier
npm run test:unit    # vitest unit seulement
```

**Note** : `npm run test` lance aussi les intégrations live (`touchDesignerClientAndWebServer.test.ts`) qui nécessitent TD sur `127.0.0.1:9981`. Ne PAS l'utiliser comme gate obligatoire.

---

## Tâche 2 : Fix données JSON

### 2a. `tdresources.json` — warning accès manquant

`content.warnings` ne contient pas le piège "accès via `op.TDResources` pas `import`". Ajouter :

```
"Access via op.TDResources — do NOT use 'import TDResources'. This is a singleton COMP, not a Python module."
```

### 2b. `tdresources.json` — ButtonPopMenu absent

La référence locale dit : "similar but attached to a button widget. Does not support submenus." (`.claude/skills/td-python/references/tdresources.md:31`). Ne PAS sur-spécifier au-delà de cette source.

Ajouter un membre dans `payload.members` :

```json
{
  "name": "ButtonPopMenu",
  "description": "Variant of PopMenu attached to a button widget. Does NOT support submenus.",
  "warnings": ["Does NOT support submenus"]
}
```

### 2c. Table de correspondance anti-hallucination (#55)

| Piège issue #55 | Wording dans JSON | Fichier | Statut |
|---|---|---|---|
| `op.TDResources` pas `import` | (à ajouter, 2a) | `tdresources.json` | **FIX** |
| `jsonToOp()` fail silencieux | `textToJSON and datToJSON return None on failure` | `tdjson.json` | **OK** — l'issue dit `jsonToOp()` mais le module réel utilise `textToJSON`/`datToJSON` |
| StorageManager collisions | `Two extensions with same class name... silently share/overwrite` | `tdstoretools.json` | **OK** |
| `createProperty()` modifie la classe | `Creates class-level property shared across ALL instances` | `tdfunctions.json` | **OK** |
| `tScript()` est lent | `Slow — creates/destroys a temporary DAT per call` | `tdfunctions.json` | **OK** |

**Fichier modifié** : `_mcp_server/data/td-knowledge/modules/tdresources.json`

---

## Tâche 3 : Vérifier capabilities `resources` (via test)

Le constructeur `touchDesignerServer.ts:45` déclare `capabilities: { logging: {}, prompts: {}, tools: {} }` — `resources` absent.

**Approche** : ajouter une assertion dans `resourcesTransport.test.ts` (tâche 5b) qui vérifie que la réponse `initialize` expose `capabilities.resources`. Le flux `initialize` existe déjà comme pattern dans `httpTransport.test.ts:69`.

- Si l'assertion passe → le SDK auto-déclare, documenter dans clôture
- Si l'assertion échoue → ajouter `resources: {}` dans `touchDesignerServer.ts:45`

**Fichier** : `_mcp_server/src/server/touchDesignerServer.ts` (si fix nécessaire)

---

## Tâche 4 : Retirer l'état `hybrid` mort

`serverMode.ts:3` définit `"docs-only" | "hybrid" | "live"` mais les transitions réelles sont `docs-only` ↔ `live` uniquement. `hybrid` n'est jamais atteint.

- Retirer `"hybrid"` du type `ServerModeValue`
- Grep pour vérifier qu'aucun autre fichier ne référence `"hybrid"` comme mode serveur
- Note : `_meta.source` dans FusionService utilise `"hybrid"` comme valeur de fusion (static+live merged) — c'est un concept différent du mode serveur, à ne pas confondre

**Fichier** : `_mcp_server/src/core/serverMode.ts`

---

## Tâche 5 : Tests manquants

### 5a. Test de contrat sur corpus réel

Nouveau test qui charge `data/td-knowledge/` via le vrai loader et valide :

**Modules** (kind `python-module`) :
- IDs attendus : `tdfunctions`, `tdjson`, `tdstoretools`, `tdresources`
- Chaque module a `content.warnings` non-vide
- Chaque module a `payload.members` non-vide

**Opérateurs** (kind `operator`) :
- ID attendu : `glsl-top`
- Charge et passe la validation Zod
- `kind` === `"operator"`

**Fichier** : `_mcp_server/tests/unit/resources/corpus.test.ts` (nouveau)

### 5b. Test E2E MCP resources offline

Assertion `initialize` (résout tâche 3) :
- La réponse `initialize` expose `capabilities.resources` (prouve que le SDK auto-déclare ou qu'on l'a ajouté)

Assertions exactes pour `resources/list` :
- Présence de `td://modules` (index statique)
- Présence de `td://operators` (index statique)
- Présence de `td://modules/tdfunctions` (template concret)
- Présence de `td://operators/glsl-top` (template concret)

Assertions pour `resources/read` offline (mode `docs-only`) :
- `td://modules/tdfunctions` → retourne contenu avec `kind: "python-module"`, `payload.canonicalName: "TDFunctions"`
- `td://operators/glsl-top` → retourne contenu avec `_meta.source: "static"` (pas de live enrichment)

**Fichier** : `_mcp_server/tests/integration/resourcesTransport.test.ts` (nouveau)

### 5c. Test négatif fail-soft

`resolveKnowledgePath()` a 3 fallbacks (`paths.ts:13-34`) : env var → dist/ → repo root. Un env var invalide ne suffit pas car les fallbacks filesystem trouveront le repo.

**Approche** : mocker `resolveKnowledgePath()` pour retourner `undefined`. Assertions :
- `registerResources()` s'exécute sans crash
- Les handlers sont enregistrés après le bloc path (registry vide mais handlers présents — `index.ts:36-37`)
- `td://modules` retourne une liste vide
- Un warning est loggé (`"Knowledge base path not found"`)

**Fichier** : `_mcp_server/tests/unit/resources/failsoft.test.ts` (nouveau)

---

## Tâche 6 : Gate finale offline

```bash
cd _mcp_server
npm run build
npm run lint
npm run test:unit    # inclut les nouveaux tests corpus, failsoft
```

Pour `resourcesTransport.test.ts` (intégration offline, pas besoin de TD) :
```bash
npx vitest run tests/integration/resourcesTransport.test.ts
```

**Gate live/manuelle** (optionnel, si TD lancé) :
```bash
npm run test         # tout, y compris intégrations live
```

---

## Tâche 7 : Commits et bump submodule

```bash
# Dans _mcp_server
git add -A && git commit  # message décrivant les fixes JSON + tests + hybrid cleanup

# Dans le repo parent
git add _mcp_server && git commit  # bump submodule
```

---

## Tâche 8 : Clôture issues GitHub

Toutes les commandes utilisent `--repo GuiGPaP/TD_starter_pack` explicitement :

```bash
gh issue close 51 --repo GuiGPaP/TD_starter_pack --comment "..."
gh issue close 52 --repo GuiGPaP/TD_starter_pack --comment "..."
# etc.
```

| Issue | Commentaire de clôture |
|---|---|
| #51 | Zod discriminated union (python-module + operator). 4 module JSONs + 1 operator JSON. Loader fail-soft. |
| #52 | Resources MCP : `td://modules`, `td://modules/{id}`, `td://operators`, `td://operators/{id}`. Tests E2E offline ajoutés. capabilities.resources vérifié. |
| #53 | ServerMode `docs-only` ↔ `live`. État `hybrid` retiré du type (jamais utilisé en transition). Fail-soft testé. |
| #54 | FusionService + EnrichmentCache (TTL 5min, invalidation on build change). `_meta.source` = `static`/`live`/`hybrid`. |
| #55 | 4 modules Python documentés (TDFunctions, TDJSON, TDStoreTools, TDResources). PopMenu couvert comme membre de TDResources (PopMenu.Open + ButtonPopMenu). Anti-hallucination : 5 pièges couverts. Note : issue mentionne `jsonToOp()` mais le module réel utilise `textToJSON`/`datToJSON`. Test de contrat sur corpus réel ajouté. |
| #50 | Epic 7 complete. Toutes sous-issues livrées. Gates : build + lint + test:unit + E2E resources offline. |

---

## Ordre d'exécution

```
1. Gate initiale (build, lint, test:unit)
2. Fix JSON (tdresources.json)
3. Capabilities check
4. Retirer hybrid
5. Tests (corpus, E2E resources, failsoft)
6. Gate finale
7. Commits
8. Clôture issues
```
