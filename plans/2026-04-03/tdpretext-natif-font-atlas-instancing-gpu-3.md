<!-- session_id: 783dc15b-9c9d-4893-9ea9-dc58c8d22242 -->
# Plan : TDPretext natif — Font Atlas + Instancing GPU

## Contexte

TDPretext utilise un Web Render TOP + Pretext.js pour le text layout avec obstacle avoidance. Le pipeline Chromium introduit **22 frames de latence** (compensé par un cache TOP hack). L'objectif est de remplacer ça par un rendu 100% TD natif pour éliminer la latence et maximiser les FPS.

**Skills utilisés :** td-guide (geometry-comp, rendering, python-env), td-glsl (pixel patterns), td-glsl-vertex (instancing patterns, varyings), pretext (algorithme de layout).

---

## Architecture

```
TEXT/FONT CHANGE (rare)                  CHAQUE FRAME (60fps)
=======================                  ====================

text_source DAT                          panel1 CHOP (mouse)
     |                                        |
     v                                        v
[atlas_generator] ──> atlas_top (texture)  null_mask TOP (bitmap obstacle)
  (Script TOP)            |                    |
  + glyph_metrics DAT     |                    |
                          v                    v
glyph_metrics ────> [layout_engine] (Execute DAT onFrameEnd)
  (table DAT)         - lit panel1 pour pointer
                      - lit null_mask pour bitmap spans
                      - lit glyph_metrics pour largeurs mots
                      - écrit glyph_data CHOP
                              |
                              v
                      glyph_data CHOP ──> render_geo (Geometry COMP)
                              |               - rectangle SOP (quad unitaire)
                              |               - instancing depuis glyph_data
                              |               - text_glsl MAT
                         atlas_top ──────> text_glsl (sampler sAtlas)
                                              |
                                              v
                                         text_camera (ortho)
                                              |
                                              v
                                         render_text TOP
                                              |
         orb_glsl TOP ──> comp_orbs ──> over1 ──> null_flow
                                          ^
                                          |
                                     bg_color TOP
```

---

## Phase 1 : Atlas System

### Font Atlas (word-level, pas glyph-level)

**Pourquoi word-level :** texte latin uniquement, ~50-200 mots uniques, évite les problèmes de kerning. Identique à Pretext qui mesure des segments entiers.

**Opérateurs à créer :**

| Opérateur | Type | Rôle |
|-----------|------|------|
| `atlas_helper` | textTOP | Rend chaque mot individuellement (cook on-demand) |
| `atlas_top` | scriptTOP | Pack les mots rendus en une seule texture atlas 2048x2048 |
| `atlas_script` | textDAT | Script Python du Script TOP |
| `glyph_metrics` | tableDAT | Lookup : mot → UV atlas + dimensions pixel |

**Mesure des mots :** `textTOP.evalTextSize(word)` pour chaque mot unique. Plus fiable que PIL/GDI car utilise le même moteur de rendu que l'atlas.

**Algorithme de packing :** Shelf-packing simple (gauche-à-droite, ligne-par-ligne). Déclenché uniquement au changement de texte/font.

**Colonnes de `glyph_metrics` :**
```
word | width_px | height_px | atlas_u | atlas_v | atlas_w | atlas_h
```

---

## Phase 2 : Layout Engine (Python, chaque frame)

**Opérateur :** `layout_engine` (executeDAT, `onFrameEnd`)

**Port de l'algo Pretext en Python (~50 lignes) :**
1. Lire les largeurs de mots depuis `glyph_metrics` (caché en Python dict)
2. Construire les obstacles (cercles animés + pointer lerp OU bitmap spans)
3. Pour chaque ligne Y : calculer segments disponibles (identique à `buildSegments` / `buildSegmentsBitmap` du HTML)
4. Greedy line break : accumuler mots jusqu'à dépasser la largeur du segment
5. Écrire positions dans `glyph_data` Script CHOP

**Budget perf :** <0.2ms validé (pur math Python sur ~200 mots)

**Opérateurs de sortie :**

| Opérateur | Type | Rôle |
|-----------|------|------|
| `glyph_data` | scriptCHOP | N samples × channels: `tx, ty, atlas_u, atlas_v, atlas_w, atlas_h, word_w, word_h` |
| `glyph_script` | textDAT | Script Python du Script CHOP |

**Pré-allocation :** 500 samples max, zéros pour les inutilisés (évite les recooks CHOP).

---

## Phase 3 : GPU Rendering (Instancing)

**Opérateurs à créer :**

| Opérateur | Type | Rôle |
|-----------|------|------|
| `quad_sop` | rectangleSOP | Quad unitaire 1x1 (base des instances) |
| `render_geo` | geometryCOMP | Instancing depuis `glyph_data`, material `text_glsl` |
| `text_glsl` | glslMAT | Vertex + Pixel shaders |
| `text_vert` | textDAT | Vertex shader |
| `text_frag` | textDAT | Fragment shader |
| `text_camera` | cameraCOMP | Projection orthographique, width = résolution |
| `render_text` | renderTOP | Output texture texte |

### Vertex Shader (`text_vert`)

```glsl
// Instance data via TDDeform (handles tx,ty from CHOP instancing)
// Atlas UV passed as custom instance attributes
flat out vec4 vAtlasRect;  // u, v, w, h dans l'atlas
out vec2 vLocalUV;          // UV local du quad (0-1)

void main() {
    int id = TDInstanceID();
    // TDDeform handles position + scale from CHOP instance channels
    vec4 worldPos = TDDeform(P);
    
    // Pass local quad UV for atlas sampling
    vLocalUV = uv[0].st;
    
    // Atlas rect passed via instance texture or custom attributes
    // (configured via Geometry COMP instance texture parameters)
    
    gl_Position = TDWorldToProj(worldPos);
}
```

### Pixel Shader (`text_frag`)

```glsl
uniform sampler2D sAtlas;
uniform vec4 uTextColor;

flat in vec4 vAtlasRect;
in vec2 vLocalUV;

layout(location = 0) out vec4 fragColor;

void main() {
    // Map local UV → atlas sub-rect
    vec2 atlasUV = vAtlasRect.xy + vLocalUV * vAtlasRect.zw;
    vec4 texel = texture(sAtlas, atlasUV);
    
    // Atlas = white text on transparent bg
    fragColor = TDOutputSwizzle(vec4(uTextColor.rgb, texel.a * uTextColor.a));
}
```

### Camera ortho

```python
cam.par.projection = 'orthographic'
cam.par.orthowidth = 1920  # = render resolution width
cam.par.tz = 1  # regarder vers -Z
```

---

## Phase 4 : Intégration

### `/TDPretext` reste intact — nouveau COMP à la racine

**Le COMP existant `/TDPretext` n'est PAS modifié.** On crée un nouveau COMP `/TDPretextNative` à la racine du projet TD, qui contient tout le nouveau système.

**Opérateurs dans `/TDPretextNative` :**
- Tout le pipeline atlas + layout + rendering (phases 1-3)
- Ses propres `panel1`, `text_source`, `viewer_panel`
- Son propre pipeline webcam/masque (ou des select TOPs pointant vers ceux de `/TDPretext`)
- `over1`, `null_flow` en sortie

### Compositing interne à `/TDPretextNative`

```
bg_color (constant TOP, couleur preset) ─┐
render_text (instanced text) ─────────────┼──> over1 ──> null_flow
orb_glsl (orbes décoratives) ─────────────┘
```

**Pas de cache TOP** — tout est synchrone, zéro latence.

### Orbes

`orb_glsl` (GLSL TOP) : dessine les gradients radiaux aux positions des obstacles. Données d'entrée : CHOP avec positions/rayons des orbes, passées en uniforms.

### Inputs webcam/masque

Deux options :
- **Select TOPs** pointant vers `/TDPretext/null_mask`, `/TDPretext/null1` etc.
- **Duplication** du pipeline webcam dans le nouveau COMP (plus autonome)

Recommandé : Select TOPs pour éviter la duplication de la webcam.

---

## Phase 5 : Preset textstring

Le preset `textstring` utilise une simulation physique par lettre (HTML séparé). **Options :**
- **A (recommandé initial) :** Garder le Web Render TOP uniquement pour ce preset
- **B (futur) :** Implémenter la physique par lettre en TD (CHOP + instancing)

---

## Ordre d'implémentation

1. **Atlas system** (Phase 1) — le plus risqué, valider d'abord
2. **Layout engine** (Phase 2) — port Python, vérifiable par comparaison avec Web Render
3. **GPU rendering** (Phase 3) — GLSL MAT + instancing + camera ortho
4. **Intégration** (Phase 4) — rewire `over1`, nouveau `par_handler`, supprimer le superflu
5. **Text shadow** — Blur TOP sur une copie du render_text, composite sous le texte sharp
6. **Preset textstring** — décision séparée

## Vérification

- **Atlas :** inspecter visuellement la texture atlas dans le node viewer
- **Layout :** comparer les positions de mots côte-à-côte avec le Web Render TOP (screenshot diff)
- **Rendu :** comparer le render final avec/sans Web Render
- **Latence :** vérifier la disparition du décalage masque/texte en mode displaced
- **FPS :** Perform CHOP avant/après, vérifier le gain
- **Presets :** tester les 5 presets, vérifier les transitions

## Amélioration : passer de word-level à character-level layout

### Problème
Notre layout ne coupe qu'aux espaces. Pretext coupe au niveau graphème (mid-word). Résultat : quand un obstacle laisse un segment étroit, on le saute au lieu de le remplir → trous visibles.

### Solution : character-level atlas + layout

**Phase A — Atlas character-level :**
- Au lieu de rendre chaque mot entier, rendre chaque **caractère unique** (a-z, A-Z, 0-9, ponctuation)
- ~80 glyphes au lieu de ~200 mots → atlas plus petit, plus rapide
- Stocker `char → {width_px, atlas_u, atlas_v, atlas_w, atlas_h}` dans glyph_metrics

**Phase B — Layout character-level :**
- Pré-calculer les largeurs de chaque caractère (table lookup)
- Greedy layout : accumuler caractère par caractère, pas mot par mot
- Couper à n'importe quelle position quand le segment est plein
- Préférer couper aux espaces (word boundary) quand possible, sinon couper mid-word
- C'est exactement l'algo de Pretext : `layoutNextLine` marche segment par segment

**Phase C — Rendu character-level :**
- Chaque instance = un caractère (pas un mot)
- Plus d'instances (~500 chars vs ~90 mots) mais toujours un seul draw call GPU
- Le vertex shader ne change pas (même principe : position + atlas UV par instance)

### Impact
- ~500 instances au lieu de ~90 → encore bien dans le budget GPU
- Layout plus fin autour des obstacles
- Pas de trous visibles
- Plus proche du rendu Pretext original

### Fichiers modifiés
- `atlas_script` textDAT — passer de word-level à char-level atlas
- `layout_engine` textDAT — passer de word-level à char-level greedy breaking
- `glyph_script` textDAT — adapter pour char instances
- `glyph_metrics` tableDAT — colonnes inchangées, contenu = chars au lieu de words

---

## Fichiers critiques (référence, en lecture seule)

| Source | Contient |
|--------|----------|
| `TDpretext/web/flow_demo.html` | Algos à porter : buildSegments, buildSegmentsBitmap, greedy layout, orb SEEDS |
| `/TDPretext/par_to_webrender` DAT | PRESETS dict, PAGE_MAP, config mapping |
| `/TDPretext/obstacle_bridge` DAT | Bitmap span extraction depuis numpyArray |
| `/TDPretext/text_source` DAT | Texte par défaut |

**`/TDPretext` reste intact** — le nouveau COMP `/TDPretextNative` est créé à la racine, indépendant.
