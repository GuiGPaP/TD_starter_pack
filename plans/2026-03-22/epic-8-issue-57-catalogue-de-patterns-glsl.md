<!-- session_id: 36620acd-2faa-472b-9dca-2c1263868f5d -->
# Epic 8 — Issue #57 : Catalogue de patterns GLSL

## Context

Epic 8 ajoute une bibliothèque de patterns GLSL déployables. Issue #57 est la fondation : définir le schéma Zod, créer les 16 fichiers JSON avec du vrai code GLSL, et valider via tests contrat. Aucun outil MCP ni endpoint — juste données + schéma + tests.

## Décisions de conception

### Validation GLSL

Les shaders TD utilisent des symboles propriétaires (`vUV`, `sTD2DInputs`, `TDOutputSwizzle`, `TDDeform`, `TDIndex`, `TDIn_P`, etc.) que `glslangValidator` standalone **ne peut pas valider** sans stubs/includes.

**Décision** : la validation GLSL n'est **pas** un critère de gate pour #57. Le code GLSL doit être fonctionnel *dans TouchDesigner*, pas validable par glslangValidator standalone. La validation automatisée viendra avec le tool `deploy_glsl_pattern` (#59) qui utilise le `validate_glsl_dat` existant (validation via TD lui-même ou via GLSL TOP connecté).

Le test contrat vérifie que `payload.code.glsl` est non-vide et est une string — pas qu'il compile.

### Convention vertex shader

Pour les patterns de type `"vertex"` (GLSL MAT) :
- `payload.code.vertexGlsl` = **vertex shader** (contient `TDDeform(P)`, `gl_Position`)
- `payload.code.glsl` = **fragment/pixel shader compagnon** (contient `fragColor`, `TDOutputSwizzle`)

Les deux sont obligatoires pour un pattern vertex. Le schema Zod rend `vertexGlsl` optionnel au niveau type (les pixel/compute n'en ont pas), mais le test contrat vérifie que tout pattern `type: "vertex"` a `vertexGlsl` non-vide.

### Utilities : snippets, pas shaders autonomes

Les patterns de type `"utility"` sont des **bibliothèques de fonctions** réutilisables (pas de `main()`). Elles ne sont pas validables en standalone. Le code est stocké dans `payload.code.glsl` comme pour les autres types.

`payload.setup.operators` pour les utilities est un tableau vide `[]` — elles n'ont pas de setup TD propre, elles sont incluses dans d'autres patterns.

### Sources de données corrigées

| Pattern | Source réelle |
|---|---|
| Pixel shaders | `.claude/skills/td-glsl/templates/*.glsl` |
| Vertex shaders | `.claude/skills/td-glsl-vertex/templates/*.glsl` (basic, displacement, instancing, lit) |
| Compute shaders | `.claude/skills/td-pops/templates/*.glsl` (basic-pop, copy-pop, advanced-pop, particle-sim) |

---

## Tâche 1 : Schéma Zod `glsl-pattern`

**Fichier** : `_mcp_server/src/features/resources/types.ts`

Ajouter après les schemas opérateur, avant le discriminated union :

```typescript
// ── GLSL pattern schemas ───────────────────────────────────────────

const glslUniformSchema = z.object({
  name: z.string(),
  type: z.enum(["float", "vec2", "vec3", "vec4", "int", "sampler2D"]),
  default: z.string().optional(),
  expression: z.string().optional(),
  page: z.string().optional(),
  description: z.string().optional(),
});

const glslOperatorSetupSchema = z.object({
  type: z.string(),
  family: z.string(),
  name: z.string(),
  role: z.enum(["primary", "auxiliary", "input"]).optional(),
  params: z.record(z.unknown()).optional(),
});

const glslConnectionSchema = z.object({
  from: z.string(),
  to: z.string(),
  inputIndex: z.number().int().optional(),
});

const glslSetupSchema = z.object({
  operators: z.array(glslOperatorSetupSchema),
  connections: z.array(glslConnectionSchema).optional(),
  uniforms: z.array(glslUniformSchema).optional(),
  resolution: z.object({ w: z.number(), h: z.number() }).optional(),
});

const glslCodeSchema = z.object({
  glsl: z.string(),
  vertexGlsl: z.string().optional(),
});

const glslPatternPayloadSchema = z.object({
  type: z.enum(["pixel", "vertex", "compute", "utility"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  code: glslCodeSchema,
  setup: glslSetupSchema,
  tags: z.array(z.string()).optional(),
  minVersion: z.string().optional(),
  estimatedGpuCost: z.enum(["low", "medium", "high"]).optional(),
});

const glslPatternEntrySchema = knowledgeEntryBaseSchema.extend({
  kind: z.literal("glsl-pattern"),
  payload: glslPatternPayloadSchema,
});
```

Modifier le discriminated union + exports :
```typescript
export const knowledgeEntrySchema = z.discriminatedUnion("kind", [
  pythonModuleEntrySchema,
  operatorEntrySchema,
  glslPatternEntrySchema,
]);

export type TDGlslPatternEntry = z.infer<typeof glslPatternEntrySchema>;
```

---

## Tâche 2 : Étendre le KnowledgeRegistry

**Fichier** : `_mcp_server/src/features/resources/registry.ts`

### 2a. `getGlslPatternIndex()`
```typescript
getGlslPatternIndex(): Array<{ id: string; title: string; kind: string }> {
  return [...this.entries.values()]
    .filter((e) => e.kind === "glsl-pattern")
    .map((e) => ({ id: e.id, kind: e.kind, title: e.title }));
}
```

### 2b. Étendre `matchesQuery()`
```typescript
} else if (entry.kind === "glsl-pattern") {
  haystacks.push(entry.payload.type);
  haystacks.push(entry.payload.difficulty);
  if (entry.payload.tags) {
    haystacks.push(...entry.payload.tags);
  }
}
```

---

## Tâche 3 : Créer les 16 fichiers JSON

**Répertoire** : `_mcp_server/data/td-knowledge/glsl-patterns/`

### Pixel shaders (6)
| ID | Difficulté | Source |
|---|---|---|
| `passthrough` | beginner | `td-glsl/templates/basic.glsl` |
| `generative-noise` | beginner | `td-glsl/templates/generative.glsl` |
| `feedback-decay` | intermediate | `td-glsl/templates/feedback.glsl` |
| `multi-blend` | intermediate | `td-glsl/templates/multi-input.glsl` |
| `raymarching-basic` | intermediate | Écrire (SDF sphere + plane) |
| `reaction-diffusion` | advanced | Écrire (Gray-Scott model) |

### Vertex shaders (4) — `code.vertexGlsl` + `code.glsl`
| ID | Difficulté | Source |
|---|---|---|
| `basic-uvs` | beginner | `td-glsl-vertex/templates/basic.glsl` |
| `displacement-noise` | intermediate | `td-glsl-vertex/templates/displacement.glsl` |
| `instancing-data` | intermediate | `td-glsl-vertex/templates/instancing.glsl` |
| `phong-normalmap` | advanced | `td-glsl-vertex/templates/lit.glsl` |

### Compute shaders (3)
| ID | Difficulté | Source |
|---|---|---|
| `point-offset` | beginner | `td-pops/templates/basic-pop.glsl` |
| `particle-forces` | intermediate | `td-pops/templates/particle-sim.glsl` |
| `copy-transforms` | intermediate | `td-pops/templates/copy-pop.glsl` |

### Utilities (3) — `setup.operators: []`, pas de `main()`
| ID | Difficulté | Contenu |
|---|---|---|
| `sdf-primitives` | intermediate | sphere, box, torus, boolean ops, smooth blend |
| `color-utils` | beginner | HSV↔RGB, cosine palettes, tonemapping |
| `math-utils` | beginner | rotation matrices, easing, hash, UV helpers |

---

## Tâche 4 : Tests

### 4a. Étendre `corpus.test.ts`

Ajouter un `describe("glsl-pattern entries", ...)` avec les assertions suivantes (ajoutées **après** les 16 fichiers, pas avant) :
- 16 IDs attendus présents
- Chaque pattern a `payload.code.glsl` non-vide (string.length > 0)
- Chaque pattern a `payload.type` valide
- Chaque pattern a `payload.difficulty` valide
- Chaque pattern `type === "vertex"` a `payload.code.vertexGlsl` non-vide
- Chaque pattern `type === "utility"` a `payload.setup.operators` vide (`[]`)
- Chaque pattern non-utility a `payload.setup.operators` non-vide

### 4b. Étendre `registry.test.ts`

- Helper `makeGlslPatternEntry()` (même pattern que `makeEntry()` existant)
- Test `getByKind("glsl-pattern")`
- Test `getGlslPatternIndex()`
- Test `search()` matche sur tags et type

---

## Tâche 5 : Gate finale

```bash
cd _mcp_server
npx tsc --noEmit                  # types compilent
npx biome check <nouveaux fichiers>  # lint sur fichiers modifiés/créés
npm run test:unit                  # tous tests passent
```

Assertion corpus : 16 glsl-patterns + 4 modules + 1 opérateur = 21 entries chargées sans warning.

---

## Ordre d'exécution

```
1. Schema Zod (types.ts) → tsc --noEmit
2. Registry (registry.ts) → tsc --noEmit
3. Premier pattern (passthrough.json) → loader valide via test ad-hoc
4. 15 patterns restants
5. Tests corpus (16 IDs, conventions vertex/utility) → test:unit
6. Tests registry (search, getGlslPatternIndex) → test:unit
7. Gate finale (tsc + biome + test:unit)
8. Commit submodule + bump parent
```

**Note** : les tests corpus (étape 5) sont ajoutés **après** les 16 fichiers pour éviter des échecs intermédiaires.
