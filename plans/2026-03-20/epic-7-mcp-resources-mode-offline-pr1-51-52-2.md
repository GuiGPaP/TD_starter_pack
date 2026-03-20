<!-- session_id: a1dc57e3-f6c3-4b80-89ba-bda67d575526 -->
# Epic 7 — MCP Resources + mode offline — PR1 (#51 + #52)

## Context

Le serveur MCP n'expose que des **tools** (32 outils). Toute la documentation TD passe par des tools nécessitant une connexion live — anti-pattern MCP. Les **resources** sont le mécanisme standard pour exposer du contenu read-only **offline**.

PR1 livre le minimum fonctionnel : schéma Zod, corpus de 4 modules Python TD, registry, et 2 URIs resources (`td://modules`, `td://modules/{id}`). Pas de placeholders.

## Décisions structurantes

1. **URI `td://modules/{id}`** — pas `{name}`. L'id est le slug kebab-case (`tdfunctions`), le nom canonique (`TDFunctions`) est une propriété métier du payload.
2. **`kind` au niveau racine uniquement** — pas de duplication dans le payload. Le payload est non-taggé en PR1 (un seul kind `python-module`, le discriminant est au niveau de l'entrée).
3. **Pas de resources placeholders** — seuls `td://modules` et `td://modules/{id}` en PR1.
4. **Source de vérité = JSON dans `_mcp_server/data/td-knowledge/`** — skills markdown = ingestion one-shot.
5. **Pas de `schema.json`** — Zod est la seule définition. JSON Schema généré depuis Zod si nécessaire plus tard.
6. **Capabilities auto-gérées** — le SDK enregistre `resources: { listChanged: true }` automatiquement au premier `registerResource()` (vérifié dans `mcp.js:339`). Pas besoin de toucher le constructeur capabilities. On met à jour `TouchDesignerCapabilities` pour documentation mais on ne change PAS l'objet capabilities passé à `McpServer`.
7. **Erreur MCP pour module inconnu** — `throw new McpError(ErrorCode.InvalidParams, ...)`, pas d'enveloppe "succès avec erreur".
8. **Tests : `npm run test:unit`** pour la boucle locale, `npm test` pour CI (unit + integration).

---

## Étape 1 — Schéma Zod

**Nouveau :** `_mcp_server/src/features/resources/types.ts`

```typescript
import { z } from "zod";

const provenanceSchema = z.object({
  source: z.enum(["skills-reference", "td-docs", "manual"]),
  confidence: z.enum(["high", "medium", "low"]),
  license: z.string(),
});

const parameterSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  default: z.string().optional(),
  description: z.string(),
});

const exampleSchema = z.object({
  code: z.string(),
  label: z.string().optional(),
  language: z.string().default("python"),
});

// Membre d'un module (fonction, classe, constante)
const moduleMemberSchema = z.object({
  name: z.string(),
  signature: z.string().optional(),
  returns: z.string().optional(),
  description: z.string(),
  parameters: z.array(parameterSchema).optional(),
  examples: z.array(exampleSchema).optional(),
  warnings: z.array(z.string()).optional(),
});

// Payload spécifique python-module (non taggé — kind est au niveau racine)
const pythonModulePayloadSchema = z.object({
  canonicalName: z.string(),            // "TDFunctions", "TDJSON"
  accessPattern: z.string().optional(), // "import TDFunctions" ou "op.TDResources"
  members: z.array(moduleMemberSchema),
});

export const knowledgeEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string(),                    // affiché dans getIndex()
  kind: z.literal("python-module"),     // PR1: un seul kind, extensible via z.enum() plus tard
  aliases: z.array(z.string()).optional(),
  content: z.object({
    summary: z.string(),
    warnings: z.array(z.string()).optional(),
  }),
  provenance: provenanceSchema,
  searchKeywords: z.array(z.string()),
  payload: pythonModulePayloadSchema,   // non taggé, discriminé par kind au niveau racine
});

export type TDKnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
```

**Points clés :**
- `kind` au niveau racine uniquement, pas dans payload
- `title` existe pour `getIndex()`
- `payload.canonicalName` = nom exact du module dans TD
- `payload.members[]` modélise les fonctions avec signature, returns, warnings anti-hallucination

---

## Étape 2 — Corpus JSON (4 modules)

**Source one-shot :** `.claude/skills/td-python/references/*.md`

**Destination (source canonique) :** `_mcp_server/data/td-knowledge/modules/`

```
data/td-knowledge/modules/
  tdfunctions.json      ← depuis tdfunctions.md
  tdjson.json            ← depuis tdjson.md
  tdstoretools.json      ← depuis tdstoretools.md
  tdresources.json       ← depuis tdresources.md
```

Conversion manuelle — les markdown sont bien structurés (tables, code blocks, warnings) mais pas assez uniformes pour un parsing 100% automatique. Les JSON sont curated et committés. Les markdown skills restent pour l'usage Claude Code, pas maintenus en parallèle.

---

## Étape 3 — Knowledge Registry

**Pattern suivi :** `src/features/templates/registry.ts` (AssetRegistry)

**Nouveau :** `_mcp_server/src/features/resources/registry.ts`

```typescript
class KnowledgeRegistry {
  private entries = new Map<string, TDKnowledgeEntry>();

  loadAll(basePath: string): void
    // lit *.json récursivement depuis basePath, valide via knowledgeEntrySchema, skip invalides + log warning

  getById(id: string): TDKnowledgeEntry | undefined

  getByKind(kind: string): TDKnowledgeEntry[]

  search(query: string, maxResults?: number): TDKnowledgeEntry[]
    // match sur: id, aliases, searchKeywords, content.summary,
    // payload.canonicalName, payload.members[].name

  getIndex(): Array<{ id: string; title: string; kind: string }>
    // résumés sans payload ni content complet
}
```

**Nouveau :** `_mcp_server/src/features/resources/loader.ts`
- Pattern de `templates/loader.ts` : lit JSON, valide Zod, typed return, fail-soft

**Nouveau :** `_mcp_server/src/features/resources/paths.ts`
- Résout `data/td-knowledge/` (pattern de `templates/paths.ts`)
- Env override : `TD_MCP_KNOWLEDGE_PATH`
- Fallback dist puis dev (comme `resolveBuiltinAssetsPath`)
- Test unitaire dédié

---

## Étape 4 — Handlers MCP Resources

**API SDK v1** (`@modelcontextprotocol/sdk@^1.27.1`, branche v1.x) — vérifié dans le source :

```typescript
// Statique
server.registerResource(name: string, uri: string, metadata: ResourceMetadata, readCallback)
// readCallback: (uri: URL, extra) => ReadResourceResult

// Template
server.registerResource(name: string, template: ResourceTemplate, metadata: ResourceMetadata, readCallback)
// readCallback: (uri: URL, variables: Variables, extra) => ReadResourceResult
// ResourceTemplate: new ResourceTemplate(uriPattern, { list: ListCallback | undefined, complete?: { [var]: CompleteCallback } })
```

**Nouveau :** `_mcp_server/src/features/resources/handlers/knowledgeResources.ts`

| URI | Type | Description |
|-----|------|-------------|
| `td://modules` | statique | Index des 4 modules (`{ id, title, kind }[]`) |
| `td://modules/{id}` | ResourceTemplate | Détail complet d'un module |

**Contrat de réponse :**

```typescript
// ReadResourceResult retourne { contents: [{ uri: string, text: string }] }
// Le text est du JSON stringifié avec une enveloppe versionnée :

// Index
{ "version": "1", "entries": [{ "id": "tdfunctions", "title": "TDFunctions", "kind": "python-module" }, ...] }

// Détail
{ "version": "1", "entry": { /* TDKnowledgeEntry complet */ } }
```

mimeType : `application/json`

**ResourceTemplate pour `td://modules/{id}` :**
```typescript
new ResourceTemplate("td://modules/{id}", {
  list: async () => ({
    resources: registry.getIndex().map(e => ({
      uri: `td://modules/${e.id}`,
      name: e.title,
      mimeType: "application/json",
    }))
  }),
  // pas de complete callback en PR1 — simple et correct
})
```

**Module inconnu → erreur MCP :**
```typescript
const entry = registry.getById(variables.id as string);
if (!entry) {
  throw new McpError(ErrorCode.InvalidParams, `Module "${variables.id}" not found`);
}
```

**Nouveau :** `_mcp_server/src/features/resources/index.ts`

```typescript
export function registerResources(server: McpServer, logger: ILogger): void {
    const registry = new KnowledgeRegistry(logger);
    const path = resolveKnowledgePath(import.meta.url);
    if (path) {
        registry.loadAll(path);
    } else {
        logger.sendLog({
            data: "Knowledge base path not found — resources will be empty. Check TD_MCP_KNOWLEDGE_PATH or verify data/td-knowledge/ exists.",
            level: "warning",
            logger: "registerResources",
        });
    }
    registerKnowledgeResources(server, logger, registry);
}
```

---

## Étape 5 — Constantes + wiring serveur

**Modifier :** `_mcp_server/src/core/constants.ts`
```typescript
export const RESOURCE_URIS = {
    MODULES_INDEX: "td://modules",
    MODULE_DETAIL: "td://modules/{id}",
} as const;
```

**Modifier :** `_mcp_server/src/server/touchDesignerServer.ts`

```diff
+ import { registerResources } from "../features/resources/index.js";

  export interface TouchDesignerCapabilities {
      logging: Record<string, never>;
      prompts: Record<string, never>;
+     resources: Record<string, never>;
      tools: Record<string, never>;
  }

- // NE PAS ajouter resources: {} dans le constructeur capabilities
- // Le SDK l'enregistre automatiquement au premier registerResource()

  private registerAllFeatures(): void {
      registerPrompts(this.server, this.logger);
+     registerResources(this.server, this.logger);
      registerTools(this.server, this.logger, this.tdClient);
  }
```

---

## Étape 6 — Tests

**Nouveau :** `_mcp_server/tests/unit/resources/registry.test.ts`
- `loadAll()` avec fixtures JSON valides → entries chargées
- `loadAll()` avec JSON invalide → skip + log warning (fail-soft)
- `getById()` retourne l'entrée ou undefined
- `getByKind("python-module")` retourne les 4 modules
- `search("createProperty")` matche sur `payload.members[].name`
- `search("TDFunctions")` matche sur `payload.canonicalName`
- `getIndex()` retourne résumés sans payload

**Nouveau :** `_mcp_server/tests/unit/resources/knowledgeResources.test.ts`
- Mock McpServer avec `registerResource` mocké (compléter le mock existant dans touchDesignerServer.test.ts)
- Vérifier `registerResource` appelé pour `td://modules` (statique) et `td://modules/{id}` (template)
- Read `td://modules` retourne JSON valide avec `version: "1"` et `entries[]`
- Read `td://modules/tdfunctions` retourne JSON valide avec `version: "1"` et `entry` complet
- Read `td://modules/nonexistent` → `McpError` avec `ErrorCode.InvalidParams`

**Nouveau :** `_mcp_server/tests/unit/resources/paths.test.ts`
- `resolveKnowledgePath()` trouve le chemin en mode dev (repo root `data/td-knowledge/`)
- `resolveKnowledgePath()` trouve le chemin en mode dist (simule `import.meta.url` de type `dist/features/.../paths.js`)
- `resolveKnowledgePath()` respecte env override `TD_MCP_KNOWLEDGE_PATH`
- Retourne undefined si aucun chemin valide

**Modifier :** `_mcp_server/tests/unit/touchDesignerServer.test.ts`
- Assertion que `registerResources` est appelé (le mock existe déjà ligne 10)

---

## Étape 7 — Commit & CI

1. **Commit submodule** sur `td-starter-pack`
2. **Pousser et vérifier CI submodule** (`_mcp_server/.github/workflows/development.yml`)
3. **Bump root** : `git add _mcp_server && git commit`
4. **Pousser et vérifier CI root** (`.github/workflows/ci.yml`)

---

## Fichiers

**Nouveaux (submodule) :**
```
src/features/resources/
  index.ts
  types.ts
  registry.ts
  loader.ts
  paths.ts
  handlers/knowledgeResources.ts

data/td-knowledge/modules/
  tdfunctions.json
  tdjson.json
  tdstoretools.json
  tdresources.json

tests/unit/resources/
  registry.test.ts
  knowledgeResources.test.ts
  paths.test.ts
```

**Modifiés (submodule) :**
```
src/core/constants.ts                    (+RESOURCE_URIS)
src/server/touchDesignerServer.ts        (+interface resources, +import, +registerResources call)
tests/unit/touchDesignerServer.test.ts   (+assertion registerResources called)
```

## Vérification

| Check | Commande | Notes |
|-------|----------|-------|
| Lint TS | `cd _mcp_server && npm run lint` | |
| Tests unit (boucle locale) | `cd _mcp_server && npm run test:unit` | |
| Tests complets (manuelle) | `cd _mcp_server && npm test` | CI submodule ne lance que test:unit |
| MCP inspector | `cd _mcp_server && npm run build && npm run dev` | **build d'abord** sinon dist/data stale |
| Module index | read `td://modules` → `{ version: "1", entries: [{id, title, kind}...] }` | |
| Module detail | read `td://modules/tdfunctions` → JSON complet avec payload.members, content.warnings | |
| Module inconnu | read `td://modules/nonexistent` → McpError InvalidParams | |
| CI submodule | push → CI verte (lint + test:unit) | |
| CI root | bump + push → CI verte | |

## Hors scope PR1

- #53 (state machine online/offline) — PR2
- #54 (enrichissement live) — PR3
- #55 (couverture complète modules) — 4 modules livrés en PR1, expansion incrémentale
- Resources `td://operators/*`, `td://patterns/*` — quand il y a des données
- `schema.json` — généré depuis Zod si nécessaire
- Complete callback sur `{id}` — nice-to-have, pas en PR1
