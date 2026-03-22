<!-- session_id: 36620acd-2faa-472b-9dca-2c1263868f5d -->
# Epic 8 — Issue #60 : Garde-fous de déploiement GLSL

## Context

Issue #59 a livré le `deploy_glsl_pattern` avec dry-run, root blocking, rollback, et post-check basique. Issue #60 renforce les garde-fous.

## Décisions de scope

- **Snapshot before overwrite** : retiré du scope. Le script actuel short-circuite sur `already_exists`/`conflict` — il n'y a pas de chemin d'overwrite. Ajouter `force` + snapshot est un changement de contrat qui dépasse #60.
- **Warning "parent has existing nodes"** : retiré. Trop bruyant sur des paths normaux (`/project1`). Le conflict check sur le container name est suffisant.
- **Validation GLSL post-deploy** : pixel + vertex seulement. Les compute injectent dans un paramètre d'opérateur, pas un DAT — `validate_glsl_dat` ne s'applique pas.

## Ce qui reste pour #60

### 1. Script Python : remonter les paths des DATs GLSL

**Problème** : le script actuel ne retourne pas les paths des DATs shader dans `createdNodes` pour les patterns pixel (le DAT docké ou créé n'est pas ajouté au résultat).

**Fix dans `glslDeployScript.ts`** :
- Pour **pixel** : ajouter le `glsl_dat` dans `created_nodes` après résolution (docké ou créé)
- Pour **vertex** : déjà dans `created_nodes` (les 2 textDATs sont ajoutés)
- Ajouter un nouveau champ `shaderDatPaths` au résultat : liste des paths de DATs qui contiennent du code GLSL validable

### 2. Script Python : step tracking

Enrichir le script avec un tracking d'étapes :
```python
completed_steps = []
# After each major step:
completed_steps.append('create_container')
completed_steps.append('create_operators')
completed_steps.append('inject_code')
completed_steps.append('wire_connections')
```

En cas d'exception, le résultat inclut `completedSteps`, `failedStep`, `rollbackStatus`.

### 3. Handler : post-check `validate_glsl_dat`

**Fichier** : `glslPatternTools.ts`

Après le deploy réussi, deux post-checks non-bloquants (fail-soft via try/catch) :

**a. `getNodeErrors`** (existant, à enrichir) :
- Si erreurs détectées → `postCheckStatus = "warnings"`, `nodeErrorCount = N`
- Si appel échoue → ignorer silencieusement (comme aujourd'hui)

**b. `validateGlslDat`** (nouveau) :
- Si `deployResult.shaderDatPaths` présent et non-vide :
  - Pour chaque path, appeler `tdClient.validateGlslDat({ nodePath: path })`
  - Collecter dans `deployResult.glslValidation` (array d'objets `{ path, valid, errors }`)
  - Si des erreurs GLSL → `postCheckStatus = "warnings"`
- Si `validateGlslDat` échoue (transport, indisponible, résultat incomplet) → `glslValidation = [{ path, status: "skipped", reason: "..." }]`
- Le status principal reste `"deployed"` dans tous les cas — les post-checks sont informatifs

**Règle** : `postCheckStatus` passe à `"warnings"` si **soit** `getNodeErrors` **soit** `validateGlslDat` détecte des problèmes.

### 4. Formatter enrichi

**Fichier** : `glslPatternFormatter.ts`

`formatGlslDeployResult` affiche les nouveaux champs :
- `completedSteps` / `failedStep` si présents (failure)
- `rollbackStatus` si présent
- `glslValidation` : résumé par DAT (valid/errors)
- `postCheckStatus` : affiché si différent de `undefined`

### 5. Tests

#### 5a. `glslDeployScript.test.ts`
- Script contient `completed_steps` tracking
- Script contient `shaderDatPaths` dans le résultat
- Pour pixel : le DAT shader est dans `created_nodes`
- Résultat en cas d'exception contient `failedStep` et `rollbackStatus`

#### 5b. `glslPatternTools.test.ts`
- Post-check : si `shaderDatPaths` fourni, `validateGlslDat` est appelé (mock)
- `postCheckStatus` est `"warnings"` si validation échoue

#### 5c. `glslPatternFormatter.test.ts`
- `formatGlslDeployResult` affiche `completedSteps`/`failedStep` quand présents
- `formatGlslDeployResult` affiche `glslValidation` quand présent
- `formatGlslDeployResult` affiche `postCheckStatus` quand présent

---

## Fichiers modifiés

| Action | Fichier |
|---|---|
| Modifier | `_mcp_server/src/features/tools/glslDeployScript.ts` |
| Modifier | `_mcp_server/src/features/tools/handlers/glslPatternTools.ts` |
| Modifier | `_mcp_server/src/features/tools/presenter/glslPatternFormatter.ts` |
| Modifier | `_mcp_server/tests/unit/tools/glslDeployScript.test.ts` |
| Modifier | `_mcp_server/tests/unit/tools/glslPatternTools.test.ts` |
| Modifier | `_mcp_server/tests/unit/presenters/glslPatternFormatter.test.ts` |

## Ordre d'exécution

```
1. glslDeployScript.ts (step tracking, shaderDatPaths, pixel DAT in createdNodes)
2. glslPatternTools.ts (validate_glsl_dat post-check, postCheckStatus)
3. glslPatternFormatter.ts (enriched deploy result display)
4. Tests (deploy script, handler, formatter)
5. Gate finale (tsc + biome + test:unit)
6. Commit
7. Clôture #57-#60 + #56 (Epic 8)
```
