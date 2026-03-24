<!-- session_id: c3cba092-b4ad-467c-91f6-f19055c51c4f -->
# Catalogue local de projets TD — package, scan, search

## Context

Projets TD (.toe) en vrac sur le disque. Objectif : indexer, cataloguer, chercher via MCP.

## Principes

- **MVP .toe only** — pas de .tox arbitraires (nécessite TD ouvert)
- **Sidecars nommés explicitement** : `{nom}.td-catalog.json`, `{nom}.td-catalog.md`, `{nom}.td-catalog.png`
- **Sidecars toujours à côté du .toe** — pas de outputDir alternatif (cohérent avec scan)
- **Pas de redaction des paths** en sortie (utile pour l'utilisateur, redaction = audit log seulement)
- **Screenshot best-effort** — JSON+MD réussissent même sans PNG
- **Data layer propre** : schema Zod + loader + registry (pattern templates/)
- **schemaVersion** (format manifest) séparé de **projectVersion** (optionnel, user-defined)
- **Audit log** branché sur les écritures disque

## Data layer

### `src/features/catalog/types.ts`

```typescript
const projectManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  projectVersion: z.string().optional(),
  name: z.string(),
  file: z.string(),                    // nom du .toe
  tdVersion: z.string().optional(),
  created: z.string().optional(),      // ISO date
  modified: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).default([]),
  description: z.string().default(""),
  operators: z.record(z.string(), z.number()).optional(),  // { TOP: 12, CHOP: 5 }
  components: z.array(z.string()).optional(),
  thumbnail: z.string().optional(),    // nom du fichier .png (ou null)
});
```

### `src/features/catalog/loader.ts`

- `scanForProjects(rootDir, maxDepth)` — find `*.toe` recursively
- `loadManifest(toePath)` — load `{name}.td-catalog.json` sidecar if exists
- `loadAllManifests(rootDir, maxDepth)` — scan + load all

### `src/features/catalog/registry.ts`

```typescript
class ProjectCatalogRegistry {
  private entries: Map<string, ProjectManifest & { toePath: string }>;
  loadFromDir(rootDir, maxDepth): void;
  search(query, opts?): ProjectEntry[];
  getByPath(toePath): ProjectEntry | undefined;
  get size(): number;
}
```

### `src/features/catalog/index.ts` — barrel export

## Tools

### 1. `package_project` (live — TD requis)

Introspect le projet TD ouvert, génère les sidecars à côté du `.toe`.

**Params :** `tags?: string[]`, `author?: string`, `description?: string`, `detailLevel`, `responseFormat`

**Logique (Python via execPythonScript) :**
1. `td.project.name`, `td.project.folder` → nom et chemin
2. Parcours récursif `op('/project1').children` → comptage ops par famille
3. Liste des COMPs de premier niveau
4. Cherche un TOP avec output pour le screenshot → `.save(path)` (best-effort, warning si absent)
5. Écrit `{nom}.td-catalog.json` et `{nom}.td-catalog.md` via `open()`

**Audit :** passage par ExecAuditLog (le handler appelle execPythonScript en interne).

### 2. `scan_projects` (offline)

Scanne un dossier et liste les projets indexés / non indexés.

**Params :** `rootDir: string`, `maxDepth?: number` (défaut 5), `detailLevel`, `responseFormat`

**Logique :** pur TypeScript — `fs.readdirSync` récursif, cherche `*.toe`, vérifie si `{nom}.td-catalog.json` existe.

### 3. `search_projects` (offline)

Cherche dans les manifests catalogués.

**Params :** `query: string`, `rootDir: string`, `tags?: string[]`, `maxResults?: number`, `detailLevel`, `responseFormat`

**Logique :** TypeScript — charge les manifests via `ProjectCatalogRegistry`, score par nom/tags/description (même pattern operatorScorer).

## Fichiers

| Fichier | Type |
|---------|------|
| `src/features/catalog/types.ts` | **nouveau** — schema Zod |
| `src/features/catalog/loader.ts` | **nouveau** — scan filesystem + load manifests |
| `src/features/catalog/registry.ts` | **nouveau** — in-memory registry + search |
| `src/features/catalog/index.ts` | **nouveau** — barrel |
| `src/features/tools/handlers/projectCatalogTools.ts` | **nouveau** — 3 tools |
| `src/features/tools/presenter/projectCatalogFormatter.ts` | **nouveau** |
| `src/features/tools/presenter/index.ts` | modifier (exports) |
| `src/features/tools/metadata/touchDesignerToolMetadata.ts` | modifier (+3 entries) |
| `src/core/constants.ts` | modifier (+PACKAGE_PROJECT, +SCAN_PROJECTS, +SEARCH_PROJECTS) |
| `src/features/tools/register.ts` | modifier (+registerProjectCatalogTools) |
| `tests/unit/catalog/loader.test.ts` | **nouveau** |
| `tests/unit/catalog/registry.test.ts` | **nouveau** |

## Vérification

1. Ouvrir `starter_pack.toe` dans TD
2. `package_project(tags=["mcp","starter"])` → vérifie `starter_pack.td-catalog.json` + `.md` + `.png` (best-effort) créés à côté
3. `scan_projects(rootDir="C:/Users/.../Desktop")` → liste les projets trouvés
4. `search_projects(query="starter", rootDir="...")` → trouve le projet packagé
5. `npm test` — tous les tests passent
