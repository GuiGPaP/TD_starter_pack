<!-- session_id: 36620acd-2faa-472b-9dca-2c1263868f5d -->
# Epic 8 — Issue #59 : deploy_glsl_pattern

## Context

Issues #57 (catalogue) et #58 (get/search tools) sont livrées. Issue #59 ajoute un outil MCP `deploy_glsl_pattern` qui crée des opérateurs TD, injecte le code GLSL, câble les connexions et configure les uniforms. Intègre les garde-fous essentiels de #60 (dry-run, root blocking, rollback, post-check).

## Fix préalable : schema connexions

Le schema Zod `glslConnectionSchema` a `inputIndex` mais les données réelles utilisent `fromOutput` + `toInput`. Le schema doit être corrigé pour refléter les données.

---

## Tâche 1 : Fix schema connexions

**Fichier** : `_mcp_server/src/features/resources/types.ts`

Remplacer :
```typescript
const glslConnectionSchema = z.object({
  from: z.string(),
  inputIndex: z.number().int().optional(),
  to: z.string(),
});
```
Par :
```typescript
const glslConnectionSchema = z.object({
  from: z.string(),
  fromOutput: z.number().int().default(0),
  to: z.string(),
  toInput: z.number().int().default(0),
});
```

Vérifier que les 16 patterns JSON passent toujours la validation Zod (corpus.test.ts).

---

## Tâche 2 : Plumbing — ajouter `tdClient` à `registerGlslPatternTools`

**Fichiers** :
- `_mcp_server/src/features/tools/handlers/glslPatternTools.ts` — ajouter `tdClient: TouchDesignerClient` au 3e param
- `_mcp_server/src/features/tools/register.ts` — passer `tdClient` à `registerGlslPatternTools`

---

## Tâche 3 : Constant + Metadata

**Fichier** : `_mcp_server/src/core/constants.ts`
- Ajouter `DEPLOY_GLSL_PATTERN: "deploy_glsl_pattern"` dans TOOL_NAMES

**Fichier** : `_mcp_server/src/features/tools/metadata/touchDesignerToolMetadata.ts`
- Ajouter 1 entrée metadata (category: "helpers", params: id, parentPath, name, dryRun)

---

## Tâche 4 : Script de déploiement Python

**Fichier** : `_mcp_server/src/features/tools/glslDeployScript.ts` (nouveau)

Fonction `generateGlslDeployScript(pattern, options)` qui génère un script Python.

Le script Python doit :

### 4a. Validation
- Vérifier que `parent_path` existe et n'est pas `"/"`
- Vérifier que le type de pattern n'est pas `"utility"` (non déployable)

### 4b. Création du conteneur
```python
container = parent_op.create(baseCOMP, container_name)
container.tags.add('mcp-glsl-pattern')
container.store('mcp_pattern_id', pattern_id)
container.store('mcp_deployed_at', ...)
```

### 4c. Création des opérateurs (selon `setup.operators`)
Pour chaque opérateur du spec :
```python
node = container.create(<TDOpType>, node_name)
```

Mapping des types de patterns vers les classes TD :
| Pattern type | Spec type | TD class |
|---|---|---|
| pixel | `glslTOP` | `glslmultiTOP` (has auto-docked DAT) |
| pixel | `feedbackTOP` | `feedbackTOP` |
| vertex | `glslMAT` | `glslMAT` |
| compute | `glslPOP` | (check TD actual class name) |
| compute | `glslCopyPOP` | (check TD actual class name) |

**Important** : les noms exacts des classes TD doivent être vérifiés. Ne PAS deviner — utiliser les noms confirmés dans les skills references.

### 4d. Injection du code GLSL

**Pixel (GLSL TOP)** :
- Le GLSL TOP a un DAT auto-docké. Accéder via `node.par.dat` ou le DAT enfant.
- `setText` sur le DAT docké avec `pattern.code.glsl`

**Vertex (GLSL MAT)** :
- GLSL MAT a des paramètres pour vertex DAT et pixel DAT sur la page Load
- Créer 2 Text DATs, setText avec `vertexGlsl` et `glsl`
- Connecter via `node.par.vertexdat` et `node.par.pixeldat`

**Compute (GLSL POP)** :
- Le code est dans un paramètre `glsl` du POP, pas dans un DAT séparé
- `node.par.glsl = pattern.code.glsl`

### 4e. Connexions
```python
for conn in connections:
    src = container.op(conn['from'])
    dst = container.op(conn['to'])
    src.outputConnectors[conn['fromOutput']].connect(dst.inputConnectors[conn['toInput']])
```

### 4f. Uniforms
Pour le nœud primary (GLSL TOP ou GLSL MAT) :
```python
# Configure uniform expressions on Vectors/Colors pages
node.par.<page_param_name>.expr = expression
```

**Problème** : les uniforms TD sont configurés via des paramètres nommés (vectorname0, vectorvalue0, etc.) pas via le nom de l'uniform directement. Ceci nécessite une connaissance précise de l'API TD pour les paramètres de la page Vectors.

### 4g. Rollback sur erreur
```python
except Exception as e:
    try:
        container.destroy()
    except:
        pass
    result['status'] = 'rolled_back'
```

### 4h. Résultat JSON
```json
{
  "status": "deployed|dry_run|rolled_back|error",
  "patternId": "...",
  "path": "...",
  "createdNodes": [{"name": "...", "type": "...", "path": "..."}],
  "message": "..."
}
```

---

## Tâche 5 : Handler deploy_glsl_pattern

**Fichier** : `_mcp_server/src/features/tools/handlers/glslPatternTools.ts`

Schema (extend `detailOnlyFormattingSchema`) :
```typescript
{
  id: z.string().min(1),
  parentPath: z.string().min(2).refine(v => v !== "/", "Cannot deploy to root"),
  name: z.string().min(1).optional(),  // custom container name
  dryRun: z.boolean().optional(),
}
```

Handler flow :
1. Résoudre le pattern depuis le registry
2. Rejeter si `type === "utility"` (non déployable)
3. Si `dryRun` → retourner le plan sans exécuter
4. Générer le script Python via `generateGlslDeployScript()`
5. Exécuter via `tdClient.execPythonScript()`
6. Parser le résultat JSON
7. Post-check : `tdClient.getNodeErrors()` sur le container
8. Formatter et retourner

---

## Tâche 6 : Formatter deploy

**Fichier** : `_mcp_server/src/features/tools/presenter/glslPatternFormatter.ts`

Ajouter `formatGlslDeployResult(result, options)` :
- Status + path + created nodes + message
- Warnings si post-check a trouvé des erreurs

---

## Tâche 7 : Tests

### 7a. `_mcp_server/tests/unit/tools/glslDeployScript.test.ts` (nouveau)
- Script généré contient le bon pattern ID
- Script contient les noms d'opérateurs du spec
- Script contient le code GLSL (escaped)
- Script contient les connexions
- Script bloque le path "/"
- Script rejette les patterns utility

### 7b. Étendre `glslPatternTools.test.ts`
- `deploy_glsl_pattern` : dry-run retourne plan
- `deploy_glsl_pattern` : erreur pour pattern inconnu
- `deploy_glsl_pattern` : erreur pour utility pattern
- `deploy_glsl_pattern` : erreur pour root path "/"

---

## Tâche 8 : Gate finale

```bash
cd _mcp_server
npx tsc --noEmit
npx biome check <fichiers>
npm run test:unit
```

---

## Risque majeur : API TD pour GLSL operators

Le plus gros risque est de **deviner les noms de paramètres TD** pour la configuration des uniforms et du code. Les skills mentionnent des patterns d'usage mais pas les noms exacts des paramètres API.

**Mitigation** : générer un script Python conservateur qui :
1. Crée les opérateurs et injecte le code (fiable)
2. Tente de configurer les uniforms en best-effort
3. Documente les uniforms dans le résultat même si la config auto échoue

Le déploiement complet avec uniforms sera affiné quand on pourra tester contre un TD live.

---

## Fichiers modifiés/créés

| Action | Fichier |
|---|---|
| Modifier | `_mcp_server/src/features/resources/types.ts` (fix connexions schema) |
| Modifier | `_mcp_server/src/core/constants.ts` (+1 TOOL_NAME) |
| Modifier | `_mcp_server/src/features/tools/metadata/touchDesignerToolMetadata.ts` (+1 entry) |
| Modifier | `_mcp_server/src/features/tools/handlers/glslPatternTools.ts` (+deploy handler, +tdClient param) |
| Modifier | `_mcp_server/src/features/tools/register.ts` (pass tdClient) |
| Modifier | `_mcp_server/src/features/tools/presenter/glslPatternFormatter.ts` (+deploy formatter) |
| Modifier | `_mcp_server/src/features/tools/presenter/index.ts` (+export) |
| Créer | `_mcp_server/src/features/tools/glslDeployScript.ts` |
| Créer | `_mcp_server/tests/unit/tools/glslDeployScript.test.ts` |
| Modifier | `_mcp_server/tests/unit/tools/glslPatternTools.test.ts` (+deploy tests) |

## Ordre d'exécution

```
1. Fix schema connexions (types.ts) → corpus.test.ts passe
2. Plumbing tdClient → tsc
3. Constants + metadata → tsc
4. Deploy script generator (glslDeployScript.ts) → tsc + tests
5. Handler + formatter → tsc + biome
6. Tests deploy → test:unit
7. Gate finale
8. Commit
```
