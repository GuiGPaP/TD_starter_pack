<!-- session_id: 6010ec0d-bd40-4517-ab69-a9875d2027ce -->
# Enrichir les skills TD avec dotContext MCP

## Context

Le MCP `touchdesigner-docs` (dotContext de dotsimulate) fournit la doc officielle TouchDesigner nettoyée/dédupliquée avec recherche sémantique. Deux tools : `search_touchdesigner_docs` et `get_full_touchdesigner_doc`. On peut maintenant croiser nos skills avec la doc officielle pour corriger/compléter.

## Skills à auditer

| Skill | Fichier | Domaine | Priorité |
|-------|---------|---------|----------|
| **td-glsl** | `.claude/skills/td-glsl/SKILL.md` | GLSL TOP pixel shaders | Haute — doc complète dispo |
| **td-glsl-vertex** | `.claude/skills/td-glsl-vertex/SKILL.md` | GLSL MAT vertex shaders | Haute |
| **td-pops** | `.claude/skills/td-pops/SKILL.md` | GLSL POP compute shaders | Haute |
| **td-guide** | `.claude/skills/td-guide/SKILL.md` | Opérateurs, réseau, Python MCP | Moyenne |
| **td-python** | `.claude/skills/td-python/SKILL.md` | TDFunctions, TDJSON, etc. | Basse |

## Plan par skill

### td-glsl
1. Fetch `Write_a_GLSL_TOP__content` (déjà fait) → comparer avec skill
2. Fetch `glslTOP` (operator doc) → paramètres complets
3. Enrichissements identifiés :
   - **GLSL version** : skill dit "3.30+" → doc dit "4.60, 3.30 removed due to Vulkan"
   - **Compute shaders** : absent du skill, mais documenté (TDImageStoreOutput, gl_GlobalInvocationID)
   - **3D Textures / 2D Arrays** : absent (uTDCurrentDepth, sTD3DInputs, sTD2DArrayInputs)
   - **Built-in functions** : manque TDPerlinNoise, TDSimplexNoise, TDHSVToRGB, TDRGBToHSV, TDDither, matrix helpers
   - **Atomic counters** : absent
   - **Specialization constants** : absent
   - **Multiple color buffers** : absent
   - **TDTexInfo struct** : absent (uTD2DInfos, uTDOutputInfo)
   - **Non-uniform sampler access** : absent (nonuniformEXT)
   - **Fetching Documentation** : remplacer Context7 par `touchdesigner-docs` MCP

### td-glsl-vertex
1. Fetch `Write_a_GLSL_Material__content` → vertex shader patterns
2. Fetch `glslMAT` → paramètres
3. Enrichissements attendus : TDDeform, TDWorldToProj, geometry attributes, instancing, output variables

### td-pops
1. Fetch POP-related docs → GLSL POP, GLSL Advanced POP
2. Enrichissements attendus : POP attributes, buffer access, compute dispatch

### td-guide
1. Mettre à jour la section "Fetching Documentation" → ajouter `touchdesigner-docs` MCP
2. Ajouter une règle : "utiliser `search_touchdesigner_docs` pour vérifier les noms de paramètres avant de les utiliser"

## Approche

Pour chaque skill :
1. **Fetch** la doc officielle via `get_full_touchdesigner_doc`
2. **Diff** avec le contenu actuel du skill
3. **Enrichir** uniquement ce qui manque (pas de réécriture complète)
4. **Mettre à jour** la section "Fetching Documentation" pour pointer vers `touchdesigner-docs`

## Vérification
- Les skills restent concis et actionables (pas de dump de doc)
- Les guardrails existantes sont préservées
- Les références aux tools MCP sont correctes
- Pas de régression dans les patterns recommandés
