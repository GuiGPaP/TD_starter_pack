<!-- session_id: a1dc57e3-f6c3-4b80-89ba-bda67d575526 -->
# Epic 7 — MCP Resources + mode offline — PR1 (#51 + #52)

## Context

Le serveur MCP n'expose que des **tools** (32 outils). Toute la documentation TD est servie via des tools nécessitant une connexion live — anti-pattern MCP. Les **resources** sont le mécanisme standard pour exposer du contenu read-only **offline**.

PR1 livre le minimum fonctionnel : schéma, corpus de 4 modules Python TD, registry, et 2 URIs resources (`td://modules`, `td://modules/{name}`). Pas de placeholders.

## Décisions structurantes (issues utilisateur)

1. **`kind` pas `family`** — le champ discriminant s'appelle `kind` (type d'entrée : `python-module`, `operator`, etc.). `family` est réservé au sens TD (TOP, CHOP...) dans les payloads discriminés.
2. **Pas de resources placeholders** — PR1 expose uniquement `td://modules` et `td://modules/{name}`. Les URIs `td://operators/*` et `td://patterns/*` arrivent quand il y a de vraies données.
3. **Source de vérité = JSON dans `_mcp_server/data/td-knowledge/`** — les markdown skills sont une source d'ingestion one-shot, pas maintenue en parallèle.
4. **CI = submodule CI verte (`_mcp_server/.github/workflows/`) + root CI verte après bump** — la root CI ne lance pas les tests submodule.
5. **Pas de `schema.json` en PR1** — Zod est la seule définition de schéma. Si JSON Schema est nécessaire plus tard, il sera généré depuis Zod (comme pour td-assets).
6. **Contrat MCP figé** — mimeType `application/json`, enveloppe versionnée. API SDK v1 branche confirmée (`@modelcontextprotocol/sdk@^1.27.1`).

---

## Étape 1 — Schéma Zod `TDKnowledgeEntry`

**Nouveau :** `_mcp_server/src/features/resources/types.ts`

```typescript
import { z } from "zod";

// Provenance
const provenanceSchema = z.object({
  source: z.enum(["skills-reference", "td-docs", "manual"]),
  confidence: z.enum(["high", "medium", "low"]),
  license: z.string(),
});

// Paramètre d'un module/fonction
const parameterSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  default: z.string().optional(),
  description: z.string(),
});

// Exemple de code
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

// Payload discriminé par kind
const pythonModulePayload = z.object({
  kind: z.literal("python-module"),
  canonicalName: z.string(),            // "TDFunctions", "TDJSON"
  accessPattern: z.string().optional(), // "import TDFunctions" ou "op.TDResources"
  members: z.array(moduleMemberSchema),
});

// Futur : operatorPayload, patternPayload, etc. — hors scope PR1

// Entrée complète
export const knowledgeEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string(),
  kind: z.enum(["python-module"]),      // PR1: un seul kind
  aliases: z.array(z.string()).optional(),
  content: z.object({
    summary: z.string(),
    warnings: z.array(z.string()).optional(),
  }),
  provenance: provenanceSchema,
  searchKeywords: z.array(z.string()),
  payload: pythonModulePayload,         // discriminé par kind
});

export type TDKnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
```

**Points clés :**
- `kind` discrimine le type d'entrée (pas `family`)
- `title` existe pour `getIndex()`
- `payload` est discriminé — PR1 n'a que `python-module`, extensible
- `payload.members[]` modélise les fonctions/classes avec signature, returns, warnings
- `payload.canonicalName` = nom exact du module dans TD (`"TDFunctions"`)

---

## Étape 2 — Corpus JSON (4 modules)

**Source one-shot :** `.claude/skills/td-python/references/*.md` (tdfunctions, tdjson, tdstoretools, tdresources)

**Destination (source canonique) :** `_mcp_server/data/td-knowledge/modules/`

```
data/td-knowledge/
  modules/
    tdfunctions.json
    tdjson.json
    tdstoretools.json
    tdresources.json
```

Chaque JSON est un `TDKnowledgeEntry` valide. Contenu extrait manuellement des markdown skills, focalisé sur :
- `payload.members[]` avec signatures, returns, notes
- `content.warnings[]` — zones anti-hallucination (silent failures, class-level mutations, etc.)
- `payload.accessPattern` — comment accéder au module (`"import TDFunctions"` vs `"op.TDResources"`)

Les markdown skills restent dans `.claude/skills/` pour l'usage Claude Code. Les JSON dans `data/td-knowledge/` sont la seule source pour le runtime MCP. Pas de maintenance parallèle : si les markdown évoluent, on relance l'ingestion manuellement.

---

## Étape 3 — Knowledge Registry

**Pattern suivi :** `src/features/templates/registry.ts` (AssetRegistry)

**Nouveau :** `_mcp_server/src/features/resources/registry.ts`

```typescript
class KnowledgeRegistry {
  private entries = new Map<string, TDKnowledgeEntry>();

  loadAll(basePath: string): void        // lit *.json récursivement, valide via Zod, skip invalides
  getById(id: string): TDKnowledgeEntry | undefined
  getByKind(kind: string): TDKnowledgeEntry[]
  search(query: string, maxResults?: number): TDKnowledgeEntry[]
  getIndex(): Array<{ id: string; title: string; kind: string }>  // résumés sans payload
}
```

**Nouveau :** `_mcp_server/src/features/resources/loader.ts`
- Suit le pattern de `templates/loader.ts` : lit JSON, valide Zod, typed return, fail-soft

**Nouveau :** `_mcp_server/src/features/resources/paths.ts`
- Résout `data/td-knowledge/` (+ override via `TD_MCP_KNOWLEDGE_PATH` env var pour tests/dev)

---

## Étape 4 — Handlers MCP Resources

**API SDK v1 confirmée** (`@modelcontextprotocol/sdk@^1.27.1`, branche v1.x) :

```typescript
// Ressource statique
server.registerResource(name, uri, { title, description, mimeType }, readCallback)
// readCallback: (uri: URL) => Promise<ReadResourceResult>

// Ressource dynamique (template)
server.registerResource(name, new ResourceTemplate(uriPattern, { list, complete? }),
  { title, description, mimeType }, readTemplateCallback)
// readTemplateCallback: (uri: URL, variables: Variables) => Promise<ReadResourceResult>
```

**ReadResourceResult** retourne : `{ contents: [{ uri: string, text: string }] }`

**Nouveau :** `_mcp_server/src/features/resources/handlers/knowledgeResources.ts`

| URI | Type | Handler |
|-----|------|---------|
| `td://modules` | statique | Retourne l'index des 4 modules |
| `td://modules/{name}` | template (ResourceTemplate) | Retourne le détail d'un module par id |

**Contrat de réponse (enveloppe versionnée) :**

```json
{
  "version": "1",
  "entries": [...]       // pour l'index
}
```

```json
{
  "version": "1",
  "entry": { ... }      // pour le détail (TDKnowledgeEntry complet)
}
```

mimeType : `application/json` pour les deux.

Le `list` callback du ResourceTemplate retourne la liste des modules connus pour permettre l'autocomplétion côté client. Le `complete` callback sur `{name}` retourne les ids matchant le prefix.

**Nouveau :** `_mcp_server/src/features/resources/index.ts`

```typescript
export function registerResources(server: McpServer, logger: ILogger): void {
    const registry = new KnowledgeRegistry(logger);
    registry.loadAll(resolveKnowledgePath());
    registerKnowledgeResources(server, logger, registry);
}
```

---

## Étape 5 — Constantes + wiring serveur

**Modifier :** `_mcp_server/src/core/constants.ts`
```typescript
export const RESOURCE_URIS = {
    MODULES_INDEX: "td://modules",
    MODULE_DETAIL: "td://modules/{name}",
} as const;
```

**Modifier :** `_mcp_server/src/server/touchDesignerServer.ts`

```typescript
// 1. Ajouter l'import
import { registerResources } from "../features/resources/index.js";

// 2. Mettre à jour l'interface
export interface TouchDesignerCapabilities {
    logging: Record<string, never>;
    prompts: Record<string, never>;
    resources: Record<string, never>;   // AJOUT
    tools: Record<string, never>;
}

// 3. Ajouter dans le constructeur (capabilities object)
capabilities: {
    logging: {},
    prompts: {},
    resources: {},   // AJOUT
    tools: {},
},

// 4. Appeler dans registerAllFeatures()
private registerAllFeatures(): void {
    registerPrompts(this.server, this.logger);
    registerResources(this.server, this.logger);   // AJOUT
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
- `search("tdfunctions")` matche sur id et aliases
- `getIndex()` retourne résumés sans payload

**Nouveau :** `_mcp_server/tests/unit/resources/knowledgeResources.test.ts`
- Mock McpServer, vérifier `registerResource` appelé pour `td://modules` et `td://modules/{name}`
- Read `td://modules` retourne JSON avec `version: "1"` et `entries[]`
- Read `td://modules/tdfunctions` retourne JSON avec `version: "1"` et `entry`
- Read `td://modules/nonexistent` retourne erreur propre

**Modifier :** `_mcp_server/tests/unit/touchDesignerServer.test.ts`
- Le mock `registerResources` existe déjà (ligne 10). Ajouter assertion qu'il est appelé.

---

## Étape 7 — Commit & CI

1. **Commit submodule** sur `td-starter-pack`
2. **Vérifier CI submodule** : `_mcp_server/.github/workflows/development.yml` passe (lint + test)
3. **Bump root** : `git add _mcp_server && git commit`
4. **Vérifier CI root** : `.github/workflows/ci.yml` passe (lint, typecheck, test, sync-check, generated-check)

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
```

**Modifiés (submodule) :**
```
src/core/constants.ts                    (+RESOURCE_URIS)
src/server/touchDesignerServer.ts        (+interface, +capabilities, +registerResources)
tests/unit/touchDesignerServer.test.ts   (+assertion registerResources called)
```

## Vérification

| Check | Commande |
|-------|----------|
| Lint TS | `cd _mcp_server && npm run lint` |
| Tests unit | `cd _mcp_server && npm test` |
| MCP inspector | `npm run dev` → list resources → `td://modules` visible |
| Module index | read `td://modules` → JSON `{ version: "1", entries: [{id, title, kind}...] }` |
| Module detail | read `td://modules/tdfunctions` → JSON complet avec members, warnings |
| Unknown module | read `td://modules/nonexistent` → erreur claire |
| Root CI | `just check` passe (sync-check OK car pas de changement Python) |
| Submodule CI | `_mcp_server` CI verte après push |

## Hors scope PR1

- #53 (state machine online/offline) — PR2
- #54 (enrichissement live) — PR3
- #55 (couverture complète modules) — 4 modules livrés en PR1, expansion incrémentale
- Resources `td://operators/*`, `td://patterns/*` — quand il y a des données
- `schema.json` — sera généré depuis Zod si nécessaire plus tard
