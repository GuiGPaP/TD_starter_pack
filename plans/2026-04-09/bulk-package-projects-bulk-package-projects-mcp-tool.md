<!-- session_id: adcce37d-e335-48cf-a49c-f194a43c2d5d -->
# Bulk Package Projects — `bulk_package_projects` MCP Tool

## Context

On veut pouvoir générer les 3 sidecars (`.td-catalog.json`, `.td-catalog.md`, `.td-catalog.png`) pour **tous les .toe d'une arborescence**, pas juste le projet ouvert. L'objectif final : recherche sémantique à l'échelle de l'Explorer Windows.

**Contrainte clé :** `package_project` exécute un script Python dans le projet TD ouvert. Pour packager un autre .toe, il faut d'abord l'ouvrir via `project.load()` — ce qui coupe la connexion HTTP le temps du chargement.

**Approche retenue : Orchestration TS-side (Approach B)** — le MCP server pilote la séquence : scan → load → poll → package → next.

## Fichiers à modifier

| Fichier | Action |
|---------|--------|
| `_mcp_server/src/core/constants.ts` | Ajouter `BULK_PACKAGE_PROJECTS` dans `TOOL_NAMES` |
| `_mcp_server/src/features/tools/handlers/projectCatalogTools.ts` | Ajouter schema + handler `bulk_package_projects` |
| `_mcp_server/src/features/tools/presenter/projectCatalogFormatter.ts` | Ajouter `formatBulkPackageResult()` |

## Implémentation

### Step 1 — Constante

Ajouter dans `TOOL_NAMES` :
```typescript
BULK_PACKAGE_PROJECTS: "bulk_package_projects",
```

### Step 2 — Schema Zod

```typescript
const bulkPackageSchema = z.object({
  ...detailOnlyFormattingSchema.shape,
  rootDir: z.string().describe("Root directory to scan for .toe files"),
  maxDepth: z.number().int().min(1).max(20).optional()
    .describe("Max directory depth (default: 5)"),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  skipAlreadyPackaged: z.boolean().optional()
    .describe("Skip .toe files that already have catalogs (default: true)"),
  loadTimeoutSeconds: z.number().int().min(5).max(120).optional()
    .describe("Seconds to wait for each project to load (default: 30)"),
  dryRun: z.boolean().optional()
    .describe("Just scan and report what would be packaged (default: false)"),
});
```

### Step 3 — Handler (pseudo-code)

```typescript
async function bulkPackageHandler(params) {
  // 1. Sauvegarder le chemin du projet actuel
  const original = await tdClient.execPythonScript({
    script: `result = {"path": project.save()}` // ou project.folder + project.name
  });

  // 2. Scanner les .toe
  const scan = scanForProjects(params.rootDir, params.maxDepth ?? 5);
  const targets = params.skipAlreadyPackaged !== false
    ? scan.notIndexed
    : [...scan.notIndexed, ...scan.indexed.map(e => e.toePath)];

  // 3. Mode dry-run → retourner la liste sans rien faire
  if (params.dryRun) return formatDryRunReport(targets, scan.indexed);

  // 4. Pour chaque .toe :
  const results = [];
  for (const toePath of targets) {
    try {
      // a. Envoyer project.load()
      await tdClient.execPythonScript({
        script: `project.load('${toePath.replace(/\\/g, '/')}')`
      }).catch(() => {}); // Attendu : connexion coupée

      // b. Attendre que TD revienne en ligne
      await sleep(2000); // Délai initial pour laisser TD décharger
      const online = await waitForTdOnline(tdClient, params.loadTimeoutSeconds ?? 30);
      if (!online) {
        results.push({ toePath, success: false, error: "Timeout loading project" });
        continue;
      }

      // c. Exécuter le script de packaging (réutiliser buildPackageScript)
      const pkgScript = buildPackageScript({
        author: params.author,
        description: '',
        tags: params.tags
      });
      const pkgResult = await tdClient.execPythonScript({ script: pkgScript });
      results.push({ toePath, success: true, result: pkgResult });

    } catch (error) {
      results.push({ toePath, success: false, error: String(error) });
    }
  }

  // 5. Recharger le projet original
  try {
    await tdClient.execPythonScript({
      script: `project.load('${original.path.replace(/\\/g, '/')}')`
    }).catch(() => {});
    await sleep(2000);
    await waitForTdOnline(tdClient, 30);
  } catch { /* best-effort */ }

  // 6. Retourner le rapport agrégé
  return formatBulkPackageResult(results, params);
}
```

### Step 4 — Polling helper

Extraire/réutiliser le pattern de `wait_for_td` :

```typescript
async function waitForTdOnline(
  tdClient: TouchDesignerClient,
  timeoutSeconds: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const health = await tdClient.healthProbe(2000);
    if (health.online) {
      await tdClient.invalidateAndProbe();
      return true;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}
```

### Step 5 — Formatter

```typescript
function formatBulkPackageResult(results, params): string {
  const ok = results.filter(r => r.success);
  const fail = results.filter(r => !r.success);
  // Rapport structuré : total, succès, échecs, warnings par projet
}
```

### Step 6 — Registration

Dans `registerProjectCatalogTools()`, ajouter l'appel `server.tool(...)` avec `withLiveGuard()`.

## Gestion d'erreurs

| Cas | Comportement |
|-----|-------------|
| `.toe` corrompu / impossible à charger | Timeout → log échec, passer au suivant |
| Pas de TOP pour thumbnail | Warning dans le résultat (déjà géré par `buildPackageScript`) |
| TD crash complet | Polling timeout → rapport partiel des résultats obtenus |
| N timeouts consécutifs (3+) | Abort du batch, retourner ce qui a été fait |
| `project.load()` coupe la connexion HTTP | Attendu — AxiosError catché, puis polling |

## Invocation

```
bulk_package_projects(
  rootDir: "C:/Users/guill/Documents/TouchDesigner",
  skipAlreadyPackaged: true,
  dryRun: false,
  author: "GuiGPaP",
  tags: ["starter-pack"]
)
```

## Vérification

1. `npm run build` — compilation TS sans erreur
2. `npm test` — tests existants passent
3. Test dry-run : appeler avec `dryRun: true` sur un dossier contenant plusieurs .toe
4. Test live : appeler sur 2-3 .toe, vérifier que les 3 sidecars sont générés pour chacun
5. Vérifier que le projet original est rechargé à la fin
