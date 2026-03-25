<!-- session_id: 73b14bee-e14e-46ba-81af-511bccb406ad -->
# Issue #80 — Index et recherche dans la Palette TouchDesigner (301 .tox)

## Context

La Palette TD (`app.installFolder/Samples/Palette/`) contient ~301 `.tox` dans 17 categories. Aucun moyen actuel de les chercher ou charger via MCP. L'objectif : 3 nouveaux tools (`index_palette`, `search_palette`, `load_palette_component`) suivant les patterns existants du catalog et des assets.

## Architecture : nouveau feature module `palette/`

Nouveau module `_mcp_server/src/features/palette/` (pas d'extension du catalog ni des templates — le data model est different).

## Fichiers a creer

### 1. `src/features/palette/types.ts`
Zod schemas :
- `paletteEntrySchema` : name, category, toxPath, relativePath, author, version?, tags[], description, help?, operators? (record<family,count>), topLevelChildren?
- `paletteIndexSchema` : schemaVersion "1.0", tdVersion, tdBuild?, paletteRoot, indexedAt (ISO), entryCount, entries[]
- Types inferred : `PaletteEntry`, `PaletteIndex`

### 2. `src/features/palette/paths.ts`
- `resolveIndexCacheDir()` : cross-platform (Windows `%APPDATA%/td-mcp/palette/`, macOS `~/Library/Application Support/td-mcp/palette/`, Linux `$XDG_CONFIG_HOME/td-mcp/palette/`)
- `indexFilePathFor(tdVersion)` : retourne `palette-index-{tdVersion}.json`
- Env var override : `TD_MCP_PALETTE_INDEX_PATH`
- Pattern a suivre : `src/features/templates/paths.ts`

### 3. `src/features/palette/persistence.ts`
- `readIndex(filePath): PaletteIndex | null` — JSON parse + Zod safeParse, fail-soft
- `writeIndex(filePath, index): void` — atomic write (temp + rename), mkdir -p si besoin

### 4. `src/features/palette/registry.ts`
- `PaletteRegistry` classe avec Map<name, PaletteEntry>
- `loadFromIndex(index)`, `getAll()`, `getByName()`, `getByCategory()`, `search(query, opts?)`
- Scoring identique au pattern `catalog/registry.ts` : name exact 150, starts-with 120, contains 100, category match 80, tag exact 80, description 40, tag partial 30, child op 20

### 5. `src/features/palette/scripts.ts`
- `buildIndexPaletteScript()` : Python script qui tourne dans TD
  - Decouvre `palette_root` via `app.installFolder + '/Samples/Palette'`
  - Walk les sous-dossiers, pour chaque `.tox` : `loadTox()` dans un container temp, extrait Help/Tags/Author/Version, compte les ops par famille, `destroy()` apres
  - Try/except par .tox (fail-soft, on garde l'entree filesystem-only)
  - Retourne JSON complet dans `result`
- `buildLoadPaletteScript(toxPath, parentPath, name)` : charge un .tox dans le projet

### 6. `src/features/palette/index.ts` — barrel exports

### 7. `src/features/tools/handlers/paletteTools.ts`
`registerPaletteTools(server, logger, tdClient, serverMode, auditLog)` :

**`index_palette`** (live, withLiveGuard)
- Params : `{ force?: boolean, detailLevel?, responseFormat? }`
- Check cache (version TD via `tdClient.getTdInfo()`), si valide et pas `force` → retourne resume
- Sinon execute `buildIndexPaletteScript()` via `tdClient.execPythonScript()`
- Parse, valide, persiste, charge dans registry
- Mode `safe-write` pour le script (pas de write, que du read + loadTox + destroy)

**`search_palette`** (offline, pas de guard)
- Params : `{ query, category?, tags?, maxResults?, detailLevel?, responseFormat? }`
- Charge l'index persiste, cree PaletteRegistry, search
- Erreur claire si pas d'index → "run index_palette first"

**`load_palette_component`** (live, withLiveGuard)
- Params : `{ name, parentPath, componentName?, detailLevel?, responseFormat? }`
- Lookup .tox path dans l'index (ou construction directe si pas d'index)
- Execute `buildLoadPaletteScript()` via `tdClient.execPythonScript()`

### 8. `src/features/tools/presenter/paletteFormatter.ts`
- `formatIndexResult(index, opts)` : resume (count, categories, timing)
- `formatPaletteSearchResults(query, results, opts)` : name, category, tags, description
- `formatLoadResult(result, opts)` : status, path, name

## Fichiers a modifier

| Fichier | Modification |
|---------|-------------|
| `src/core/constants.ts` | Ajouter `INDEX_PALETTE`, `SEARCH_PALETTE`, `LOAD_PALETTE_COMPONENT` dans TOOL_NAMES |
| `src/features/tools/register.ts` | Import + appel `registerPaletteTools(server, logger, tdClient, serverMode, auditLog)` |

## Script Python — points cles

- **Decouverte du path** : `app.installFolder` (jamais hardcode)
- **loadTox** : `op('/project1').loadTox(tox_path)` retourne le COMP charge → introspection → `destroy()`
- **Mode exec** : `safe-write` suffit (loadTox + destroy sont des operations safe-write)
- **Timeout** : 301 .tox peut prendre 30-60s. Verifier le timeout actuel de `execPythonScript`. Si insuffisant, option batch (filesystem-only scan rapide, introspection en second pass)
- **Robustesse** : try/except par .tox, l'entree filesystem-only reste utile meme sans introspection

## Invalidation de l'index

- Nom du fichier contient la version TD (`palette-index-2024.11000.json`)
- Changement de version = nouvel index automatique
- `force: true` pour re-indexer manuellement

## Sequence d'implementation

1. Types + paths + persistence (zero dep TD, testable)
2. Registry + scoring (zero dep TD, testable)
3. Python scripts (buildIndexPaletteScript, buildLoadPaletteScript)
4. Formatters
5. Tool handlers + registration + constants
6. Tests unitaires (registry, persistence, scripts, formatters)
7. Test integration manuel avec TD live

## Verification

- `npm run build` dans `_mcp_server/` — compilation TS OK
- `npm run lint` — pas d'erreurs
- `npm test` — tests unitaires passent
- Test manuel : connecter a TD, appeler `index_palette` → verifier le JSON persiste, `search_palette "bloom"` → resultats pertinents, `load_palette_component` → composant charge dans le projet
