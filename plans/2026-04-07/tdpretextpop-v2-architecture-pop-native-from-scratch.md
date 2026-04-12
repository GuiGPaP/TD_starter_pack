<!-- session_id: dbf6f0c2-ce4e-484c-b125-e4817fabc856 -->
# TDPretextPop v2 — Architecture POP-Native from Scratch

## Context

TDPretextPop est un portage de la librairie [pretext](https://github.com/chenglou/pretext) sur TouchDesigner. Pretext est une librairie TS de mesure et layout de texte multilignes : elle calcule les line breaks et widths, le consommateur positionne les caracteres.

L'implementation actuelle utilise un pipeline `spec_dat → dattoPOP → poptoSOP → Geometry COMP (instancing quad + GLSL MAT + atlas texture2DArray)`. Le `poptoSOP` coute ~2ms/cook (165 secondes cumulees). On repart a 0 avec une architecture 100% POP-native, zero poptoSOP.

## Principes

1. **Zero poptoSOP** — POPs rendus directement dans le Geometry COMP (render flag)
2. **GPU-first** — minimiser le CPU, tout garder sur GPU
3. **Layout CPU on-change-only** — Python greedy line-breaking uniquement quand text/params changent (hash-based)
4. **Deux chemins de rendu** selon le preset

---

## Architecture

### Chemin A : Presets texte (displaced, textface, none)

```
text_source (textDAT)
     ↓
layout_engine.py (CPU, hash-based, on change only)
     ↓
spec_dat (tableDAT: text|tx|ty|fontsizex|fontsizey|fontcolor*|fontalpha)
     ↓
┌─ render_geo (Geometry COMP) ─────────────────────┐
│  textPOP (mode=specdat, specdat=spec_dat)         │
│       ↓                                           │
│  [optionnel] GLSL POP (obstacle alpha masking)    │
│       ↓                                           │
│  nullPOP ← render flag ON                         │
└───────────────────────────────────────────────────┘
     ↓
constantMAT → text_camera (ortho 1920) → render_text (renderTOP)
```

**Pourquoi c'est rapide :**
- `textPOP` genere du mesh vectoriel GPU-natif (resolution-independant)
- **Pas d'atlas** — zero VRAM pour les glyphes, zero rebuild
- **Pas de poptoSOP** — rendu POP direct (render flag)
- **Pas de Script CHOP** — zero overhead CHOP→TOP
- Layout Python ne cook que quand le hash change (pas chaque frame)
- Obstacle processing GPU-side via GLSL POP (Phase 2)

### Chemin B : Preset ASCII

```
videodevin1 (TOP) ──────────────────────────────┐
                                                 │
┌─ render_geo_ascii (Geometry COMP) ────────────┐│
│  Grid POP (static, cell_size grid)            ││
│       ↓                                       ││
│  GLSL POP compute shader:                     ││
│    - uniform sampler2D uVideo (= videodevin)  ││
│    - sample video at grid P → luminance       ││
│    - luminance → palette index → W (atlas)    ││
│    - set Color from video RGB + tint          ││
│    - alpha=0 pour spaces (discard)            ││
│       ↓                                       ││
│  GLSL Copy POP (stamp rectanglePOP per point) ││
│       ↓                                       ││
│  nullPOP_ascii ← render flag ON               ││
└───────────────────────────────────────────────┘│
     ↓                                           │
GLSL MAT (sample atlas texture2DArray via W)     │
     ↓                                           │
text_camera → render_text                        │
```

**Pourquoi c'est rapide :**
- **Zero Python par frame** — tout sur GPU
- Grid POP statique (cree une fois)
- GLSL POP compute : video sampling + luminance + palette en une passe GPU (~0.1ms)
- GLSL Copy POP : quads GPU-natifs, pas de conversion CPU
- 100k+ instances triviales sur GPU
- Atlas ne contient que ~10 chars ASCII (minimal VRAM)

---

## Ce qui est supprime (vs architecture actuelle)

| Operateur | Raison |
|-----------|--------|
| `dat_to_pop` (dattoPOP) | Remplace par textPOP specdat |
| `null_inst` (nullPOP) | Plus d'intermediaire |
| `inst_to_sop` (poptoSOP) | **Le bottleneck #1 elimine** |
| `atlas_text` (textTOP) | Plus d'atlas pour les presets texte |
| `atlas_3d` (texture3dTOP) | Atlas uniquement pour ASCII (plus petit) |
| `atlas_builder` (textDAT) | Rebuild seulement pour ASCII chars |
| `text_glsl_vertex/pixel` | Remplace par constantMAT (ou GLSL MAT simplifie pour ASCII) |
| `quad` (rectangleSOP) | Le textPOP genere son propre mesh |

## Ce qui est conserve

| Element | Notes |
|---------|-------|
| `layout_engine.py` | Meme algo greedy line-breaking, meme obstacle logic |
| `spec_dat` | Meme format, textPOP le lit en specdat |
| `frame_exec` | Hash-based change detection + bypass toggle |
| `text_source` | Input texte |
| `text_camera` | Ortho, meme config |
| `render_text` | RenderTOP, meme config |
| Webcam pipeline | videodevin → nvbackground → thresh → null_mask |
| Bypass conditionnel | Phase 1 deja implementee |

---

## Plan d'implementation

### Etape 1 : textPOP dans render_geo (presets texte)

1. Creer `textPOP` dans `render_geo` (mode=specdat, specdat=/TDPretextPop/spec_dat)
2. Creer `nullPOP` dans `render_geo`, render flag ON, connecte au textPOP
3. Retirer le `quad` (rectangleSOP) de render_geo
4. Changer le material de render_geo : `constantMAT` (pas besoin de GLSL custom pour du vector text)
5. Desactiver l'instancing sur render_geo (`instancing=False`)
6. Verifier que le rendu texte est correct (screenshot)
7. Si OK, bypasser/supprimer `dat_to_pop`, `null_inst`, `inst_to_sop`

**Calibration textPOP :** fontsizex en unites monde, orthowidth=1920 → 1 unit ≈ 1 pixel. Mesurer le ratio reel avec un caractere connu (M à fontsizex=14).

### Etape 2 : Preset ASCII via GLSL POP compute

1. Creer un second Geometry COMP `render_geo_ascii` (ou reutiliser avec switch)
2. Creer `Grid POP` (cols=1920/cellsize, rows=1080/(cellsize*1.5))
3. Creer `GLSL POP` compute shader :
   - Uniforms: `uVideo` (sampler2D), `uCanvasSize` (vec2), `uPaletteLen` (int), `uCellSize` (float), `uTint` (float), `uUseColor` (int)
   - Compute: sample video → luminance → palette index → W, Color, pscale
4. Creer `GLSL Copy POP` : stamp un rectanglePOP par point (quad texturable)
5. GLSL MAT avec atlas texture2DArray sampling (meme shader actuel simplifie)
6. Atlas reduit : seulement les chars de la palette ASCII (~10 slices)

### Etape 3 : Switch entre chemins

1. frame_exec switch entre render_geo (texte) et render_geo_ascii selon preset
2. Bypass le chemin inactif (render=False sur le Geometry COMP)
3. Conserver le bypass conditionnel de la chaine webcam/compositing (Phase 1)

### Etape 4 : Nettoyage

1. Supprimer les operateurs devenus inutiles (dat_to_pop, inst_to_sop, old atlas pipeline)
2. Mettre a jour le frame_exec
3. Verifier chaque preset visuellement
4. Profiling final

---

## Verification

| Test | Methode |
|------|---------|
| Rendu texte correct | `screenshot_operator` sur render_text pour chaque preset |
| 60 FPS stable | `get_performance` scope `/TDPretextPop` |
| Pas de poptoSOP | Verifier qu'aucun poptoSOP n'est actif |
| Obstacle avoidance | Screenshot displaced + textface |
| ASCII video | Screenshot ascii avec webcam |
| Memoire GPU | Comparer VRAM avant/apres (atlas_3d 86MB → elimine ou reduit) |

## Risques

1. **textPOP specdat peut avoir des limites** sur le nombre de chars ou le format exact des colonnes → verifier avec un test minimaliste d'abord
2. **Calibration fontsizex** — le ratio pixel/world peut varier par font → mesurer empiriquement
3. **GLSL Copy POP + GLSL MAT** pour ASCII est un setup nouveau → prototyper isolement

## Fichiers a modifier

| Fichier | Action |
|---------|--------|
| `/TDPretextPop/render_geo` (Geometry COMP) | Ajouter textPOP + nullPOP, retirer instancing |
| `/TDPretextPop/frame_exec` (executeDAT) | Switch chemins, nettoyage |
| `/TDPretextPop/layout_engine` (textDAT) | Garder tel quel (deja optimise numpy) |
| Nouveau: `render_geo_ascii` ou `ascii_glsl` | GLSL POP + Copy POP pour ASCII |
| Nouveau: `ascii_compute` (textDAT) | GLSL compute shader code |
| A supprimer: `dat_to_pop`, `null_inst`, `inst_to_sop` | Pipeline obsolete |
| A supprimer/reduire: `atlas_text`, `atlas_3d`, `atlas_builder` | Atlas seulement pour ASCII |
