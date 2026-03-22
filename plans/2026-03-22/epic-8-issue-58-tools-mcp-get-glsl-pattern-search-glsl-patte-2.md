<!-- session_id: 36620acd-2faa-472b-9dca-2c1263868f5d -->
# Epic 8 — Issue #58 : Tools MCP get_glsl_pattern + search_glsl_patterns

## Context

Issue #57 a livré le catalogue (16 patterns JSON + schema Zod + registry). Issue #58 ajoute deux outils MCP read-only/offline pour interroger le catalogue. Suit le pattern exact de `assetTools.ts` (search/get).

## Problème de plumbing

Le `KnowledgeRegistry` est créé dans `registerResources()` (`resources/index.ts:17`) mais n'est pas passé à `registerTools()`. Il faut modifier la chaîne pour partager le registry.

**Approche** : `registerResources()` retourne le `KnowledgeRegistry` → `registerAllFeatures()` le passe à `registerTools()`.

---

## Tâche 1 : Plumbing du KnowledgeRegistry

### 1a. `_mcp_server/src/features/resources/index.ts`

Modifier `registerResources()` pour retourner le registry :
```typescript
export function registerResources(...): KnowledgeRegistry {
  const registry = new KnowledgeRegistry(logger);
  // ... existing code ...
  return registry;
}
```

### 1b. `_mcp_server/src/server/touchDesignerServer.ts`

Capturer le registry et le passer aux tools :
```typescript
private registerAllFeatures(): void {
  registerPrompts(this.server, this.logger);
  const knowledgeRegistry = registerResources(this.server, this.logger, this.tdClient, this.serverMode);
  registerTools(this.server, this.logger, this.tdClient, this.serverMode, knowledgeRegistry);
}
```

### 1c. `_mcp_server/src/features/tools/register.ts`

Ajouter le paramètre `knowledgeRegistry` :
```typescript
export function registerTools(
  server: McpServer,
  logger: ILogger,
  tdClient: TouchDesignerClient,
  serverMode: ServerMode,
  knowledgeRegistry: KnowledgeRegistry,
): void {
  registerTdTools(server, logger, tdClient, serverMode);
  // ... existing asset registry code ...
  registerGlslPatternTools(server, logger, knowledgeRegistry, serverMode);
}
```

---

## Tâche 2 : Constants + Metadata

### 2a. Constants
**Fichier** : `_mcp_server/src/core/constants.ts`

Ajouter dans `TOOL_NAMES` :
```typescript
GET_GLSL_PATTERN: "get_glsl_pattern",
SEARCH_GLSL_PATTERNS: "search_glsl_patterns",
```

### 2b. Tool metadata
**Fichier** : `_mcp_server/src/features/tools/metadata/touchDesignerToolMetadata.ts`

Ajouter 2 entrées dans `TOUCH_DESIGNER_TOOL_METADATA` avant le `]` final (line 1400), suivant le pattern des asset tools (category: `"helpers"`, parameters, returns, example). Nécessaire pour que `describe_td_tools` les expose.

---

## Tâche 3 : Formatter

**Fichier** : `_mcp_server/src/features/tools/presenter/glslPatternFormatter.ts` (nouveau)

Deux fonctions suivant le pattern de `templateFormatter.ts` :

### `formatGlslPatternDetail(entry, options)`
- Construit un objet `structured` à partir de l'entry
- Les flags `includeCode` et `includeSetup` s'appliquent **au payload structuré** (pas seulement au texte markdown) : si `includeCode === false`, `structured.code` est omis ; idem pour `setup`
- Le texte markdown affiche titre + summary + type + difficulty + warnings + code (si includeCode) + setup (si includeSetup)
- Passe `structured` à `finalizeFormattedText()` qui le sérialise tel quel en JSON/YAML

### `formatGlslPatternSearchResults(entries, options)`
- Liste compacte : id | title | type | difficulty | summary
- `structured` = tableau d'objets allégés (id, title, type, difficulty, summary)
- Utilise `finalizeFormattedText()`

**Fichier** : `_mcp_server/src/features/tools/presenter/index.ts`
- Ajouter exports pour les deux fonctions

---

## Tâche 4 : Tool handler

**Fichier** : `_mcp_server/src/features/tools/handlers/glslPatternTools.ts` (nouveau)

Suit exactement le pattern `assetTools.ts` :

### `search_glsl_patterns`

Schema (extend `detailOnlyFormattingSchema`) :
```typescript
{
  query: z.string().min(1).optional(),
  type: z.enum(["pixel", "vertex", "compute", "utility"]).optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  tags: z.array(z.string()).optional(),
  maxResults: z.number().int().min(1).max(50).optional(),  // default 10 in handler
}
```

Handler (filtrage local, **pas** `registry.search()` qui est global et non filtrable par kind) :
1. `registry.getByKind("glsl-pattern")` → pool initial
2. Si `type` fourni, filtre `payload.type === type`
3. Si `difficulty` fourni, filtre `payload.difficulty === difficulty`
4. Si `tags` fourni, filtre les entries dont `payload.tags` intersecte
5. Si `query` fourni, filtre par text match local sur : `id`, `title`, `aliases`, `content.summary`, `searchKeywords`, `payload.tags`, `payload.type`, `payload.difficulty`
6. `maxResults` défaut = 10 dans le handler (pas via Zod `.default()`)
7. Slice à `maxResults`
8. Formate via `formatGlslPatternSearchResults()`

Test dédié : recherche par id exact et par alias retourne le bon pattern.

### `get_glsl_pattern`

Schema (extend `detailOnlyFormattingSchema`, comme `get_td_asset`) :
```typescript
detailOnlyFormattingSchema.extend({
  id: z.string().min(1),
  includeSetup: z.boolean().default(true).optional(),
  includeCode: z.boolean().default(true).optional(),
})
```

Handler :
1. `registry.getById(id)` → vérifie kind === "glsl-pattern"
2. Si pas trouvé, retourne erreur
3. Formate via `formatGlslPatternDetail()`
4. Option pour omettre code/setup (réponse allégée)

### Registration function

```typescript
export function registerGlslPatternTools(
  server: McpServer,
  logger: ILogger,
  registry: KnowledgeRegistry,
  serverMode: ServerMode,
): void { ... }
```

---

## Tâche 5 : Tests

### 5a. `_mcp_server/tests/unit/tools/glslPatternTools.test.ts` (nouveau)

- Mock `KnowledgeRegistry` avec des entries fabriquées
- `get_glsl_pattern` : retourne entry connue, erreur pour ID inconnu, erreur pour kind != glsl-pattern
- `search_glsl_patterns` : filtre par type, difficulty, tags, query
- `search_glsl_patterns` : respecte maxResults
- `search_glsl_patterns` : retourne vide si pas de match

### 5b. `_mcp_server/tests/unit/presenters/glslPatternFormatter.test.ts` (nouveau)

- `formatGlslPatternDetail` : contient title, summary, code, setup en markdown
- `formatGlslPatternDetail` avec `includeCode: false` : structured ET texte omettent le code
- `formatGlslPatternDetail` avec `includeSetup: false` : structured ET texte omettent le setup
- `formatGlslPatternDetail` avec `responseFormat: "json"` : retourne JSON structuré sans code si `includeCode: false`
- `formatGlslPatternSearchResults` : contient entries avec id/title/type

### 5d. Test metadata

- Vérifier que `TOUCH_DESIGNER_TOOL_METADATA` contient des entrées avec `tool` === `TOOL_NAMES.GET_GLSL_PATTERN` et `TOOL_NAMES.SEARCH_GLSL_PATTERNS`

### 5c. `_mcp_server/tests/unit/touchDesignerServer.test.ts` (modifier)

Test de régression pour le plumbing KnowledgeRegistry :
- Mock `registerResources` pour retourner un sentinel (objet mock)
- Vérifier que `registerTools` est appelé avec ce même sentinel en 5e argument

---

## Tâche 6 : Gate finale

```bash
cd _mcp_server
npx tsc --noEmit
npx biome check <fichiers modifiés/créés>
npm run test:unit
```

---

## Fichiers modifiés/créés

| Action | Fichier |
|---|---|
| Modifier | `_mcp_server/src/features/resources/index.ts` (return registry) |
| Modifier | `_mcp_server/src/server/touchDesignerServer.ts` (pass registry) |
| Modifier | `_mcp_server/src/features/tools/register.ts` (accept + pass registry) |
| Modifier | `_mcp_server/src/core/constants.ts` (2 new TOOL_NAMES) |
| Modifier | `_mcp_server/src/features/tools/metadata/touchDesignerToolMetadata.ts` (2 metadata entries) |
| Modifier | `_mcp_server/tests/unit/touchDesignerServer.test.ts` (plumbing regression test) |
| Modifier | `_mcp_server/src/features/tools/presenter/index.ts` (exports) |
| Créer | `_mcp_server/src/features/tools/handlers/glslPatternTools.ts` |
| Créer | `_mcp_server/src/features/tools/presenter/glslPatternFormatter.ts` |
| Créer | `_mcp_server/tests/unit/tools/glslPatternTools.test.ts` |
| Créer | `_mcp_server/tests/unit/presenters/glslPatternFormatter.test.ts` |

## Ordre d'exécution

```
1. Plumbing (resources/index.ts → touchDesignerServer.ts → register.ts) → tsc
2. Constants (constants.ts) → tsc
3. Formatter (glslPatternFormatter.ts + presenter/index.ts) → tsc + biome
4. Tool handler (glslPatternTools.ts) → tsc + biome
5. Tests → test:unit
6. Gate finale
7. Commit submodule + bump parent
```
