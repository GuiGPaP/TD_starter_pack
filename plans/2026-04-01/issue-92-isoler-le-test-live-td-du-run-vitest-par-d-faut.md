<!-- session_id: cf8f92a2-af4f-4364-87ce-265e198618f7 -->
# Issue #92 — Isoler le test live TD du run Vitest par défaut

## Context

`npx vitest run` échoue si TouchDesigner n'est pas lancé, à cause du test d'intégration live `touchDesignerClientAndWebServer.test.ts`. Ce n'est pas une régression — c'est une précondition d'environnement. On isole ce test pour que le run standard soit vert par défaut.

## Plan

### 1. Renommer le fichier test
`_mcp_server/tests/integration/touchDesignerClientAndWebServer.test.ts`
→ `_mcp_server/tests/integration/touchDesignerClientAndWebServer.live.test.ts`

### 2. Exclure `*.live.test.*` du run par défaut
**Fichier:** `_mcp_server/vitest.config.ts`

Ajouter `exclude` au bloc `test`:
```ts
exclude: ["**/*.live.test.{js,mjs,cjs,ts,mts,cts}"],
```

### 3. Créer une config Vitest dédiée pour le live
**Fichier (nouveau):** `_mcp_server/vitest.live.config.ts`

Vitest applique `exclude` avant le filtrage par chemin — donc le script live ne peut pas simplement pointer le fichier `.live.test.ts` avec la config par défaut. On crée une config séparée qui réutilise la base mais sans l'exclude:

```ts
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["tests/integration/**/*.live.test.ts"],
      exclude: [],
    },
  }),
);
```

### 4. Ajouter le script npm dédié
**Fichier:** `_mcp_server/package.json`

Ajouter dans `scripts`:
```json
"test:integration:live": "vitest run --config vitest.live.config.ts"
```

Note: `run-p test:*` ne matchera pas `test:integration:live` car le glob `test:*` ne descend qu'un niveau — il matche `test:unit` et `test:integration` mais pas `test:integration:live`.

### 5. Rendre le test plus robuste
**Fichier:** `_mcp_server/tests/integration/touchDesignerClientAndWebServer.live.test.ts`

- Lire `TD_WEB_SERVER_HOST` / `TD_WEB_SERVER_PORT` depuis `process.env` avec fallback `http://127.0.0.1` / `9981` (ne plus écraser systématiquement)
- Extraire helpers: `getLiveTdConfig()`, `ensureSandbox()`, `cleanupSandbox()`
- `beforeAll`: preflight `getTdInfo()` → si échec, `throw` avec message explicite orienté environnement
- Sandbox idempotente: `ensureSandbox()` tente de supprimer `/project1/test_base_comp` si elle existe déjà avant de la recréer (un run interrompu ne casse pas le suivant)
- `afterAll`: ne tente la suppression que si la sandbox a été créée (flag `sandboxCreated`)

### 6. Mettre à jour la doc
**Fichier:** `_mcp_server/AGENTS.md`

Ligne 17, ajouter `npm run test:integration:live` dans la liste des commandes de test.

## Fichiers modifiés

1. `_mcp_server/tests/integration/touchDesignerClientAndWebServer.test.ts` → renommé `.live.test.ts` + refacto robustesse
2. `_mcp_server/vitest.config.ts` — ajout exclude
3. `_mcp_server/vitest.live.config.ts` — **nouveau**, config dédiée live
4. `_mcp_server/package.json` — ajout script `test:integration:live`
5. `_mcp_server/AGENTS.md` — mention du script live

## Vérification

```bash
cd _mcp_server
# Run standard — doit passer sans TD
npx vitest run
# Run live — doit collecter le fichier live
npm run test:integration:live -- --dry-run 2>&1 | head
```
