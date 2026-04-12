<!-- session_id: 709faa1f-4f19-45d9-af2b-d667c4f7a662 -->
# Plan : Optimisation Performance TDPretextNative

## Contexte

TDPretextNative tourne à 60fps mais avec des coûts cachés importants :
- **Atlas 4096x4096 float32 = 256MB GPU** pour ~46 glyphes qui n'occupent qu'une seule rangée de pixels
- **glyph_data Script CHOP** : ~1.7ms/frame en boucle Python per-sample (13 canaux x 8000 samples)
- **Layout engine** : readback GPU->CPU de `select_color` à 1920x1080 pour le preset ASCII
- **Compositing** : TOPs qui cookent inutilement selon le preset actif

L'objectif est un 60fps constant et robuste. On traite les optimisations **une par une**, en commençant par le plus gros goulot.

---

## Phase 1 : Atlas -> Texture 2D Array (le plus gros changement architectural)

### Pourquoi changer d'architecture

L'atlas 2D actuel est fondamentalement inadapté :
- 4096x4096 float32 = **256MB** pour ~46 glyphes
- Shelf-packing séquentiel via `atlas_helper.cook(force=True)` = **291ms** de rebuild
- UV normalisés complexes (`atlas_u/v/w/h` par glyphe) + risque de bleeding entre glyphes
- Le projet a déjà un pattern documenté pour les Texture 2D Array dans `td-pops/references/POP-TEXT-INSTANCING.md`

### Architecture cible : `sampler2DArray`

Chaque glyphe = **un slice** dans une Texture 2D Array. Le shader utilise `texture(sFontArray, vec3(uv, sliceIndex))` au lieu du lookup UV rect actuel.

**Dimensionnement des slices :**
- Taille uniforme par slice : la plus grande cellule du set de caractères
- Pour le texte normal (RENDER_SCALE=3, font_size=20) : glyphe max ~56x84px -> slice **64x128** (power of 2)
- Pour l'ASCII multi-scale (large) : glyphe max ~115x114px -> slice **128x128**
- On prend **128x128** pour uniformiser

**Nombre de slices :**
- Texte normal : ~18 chars uniques -> 18 slices
- Avec ASCII multi-scale : +27 (9 chars x 3 tailles) -> 45 slices
- Marge : **64 slices** allouées (extensible)

**Mémoire : 64 slices x 128x128 x RGBA8 = ~4MB** (vs 256MB actuellement = **64x réduction**)

### Fichiers modifiés

#### 1. `atlas_script` (textDAT dans `/TDPretextNative/atlas_script`)
- Remplacer la génération numpy 2D par un array 3D : `np.zeros((num_slices, SLICE_H, SLICE_W, 4), dtype=np.float32)`
- Chaque char rendu dans son propre slice (centré, padded)
- `scriptOp.copyNumpyArray(atlas_3d)` -> sort en Texture 2D Array automatiquement
- Plus besoin de shelf-packing, plus de `cursor_x/cursor_y`
- Les metrics changent : au lieu de `atlas_u/v/w/h`, on stocke `slice_index` + `glyph_w/glyph_h` (taille réelle dans le slice)
- Format de sortie : **RGBA 8-bit** au lieu de float32 (texte = blanc sur transparent, 8-bit suffit)

#### 2. `glyph_metrics` (tableDAT)
- Nouveau schema : `char | width_px | height_px | slice_index | glyph_w_norm | glyph_h_norm`
- `glyph_w_norm` / `glyph_h_norm` = taille du glyphe en fraction du slice (ex: 56/128 = 0.4375)
- `slice_index` = entier (0, 1, 2...)

#### 3. `glyph_script` (textDAT - Script CHOP callback)
- Remplacer les 4 canaux `atlas_u/v/w/h` par 3 canaux : `slice_idx`, `glyph_w`, `glyph_h`
- Passe de 13 canaux à **12 canaux** (gain mineur sur le per-sample write)
- Le channel `slice_idx` est un entier (cast to float dans le CHOP)

#### 4. `text_vert` (vertex shader)
- Remplacer le lookup `texelFetch(sInstanceData, ivec2(id, 6..9))` des 4 UV rect par :
  - `float sliceIdx = texelFetch(sInstanceData, ivec2(id, 6), 0).r;`
  - `float glyphW = texelFetch(sInstanceData, ivec2(id, 7), 0).r;`
  - `float glyphH = texelFetch(sInstanceData, ivec2(id, 8), 0).r;`
- Passer `vSliceIdx`, `vGlyphSize` au fragment shader

#### 5. `text_frag` (fragment shader)
- Remplacer `texture(sAtlas, atlasUV)` par :
```glsl
vec2 glyphUV = vLocalUV * vGlyphSize;  // scale UV to actual glyph area
vec4 texel = texture(sFontArray, vec3(glyphUV, vSliceIdx));
```
- Déclarer le sampler via le mécanisme TD : connecter la Texture 2D Array comme sampler dans le GLSL MAT
- TD auto-déclare `sTD2DArrayInputs[0]` quand l'input est une Texture 2D Array

#### 6. `text_glsl` (GLSL MAT)
- Mettre à jour le sampler : remplacer `sAtlas` (uniform sampler2D) par l'input Texture 2D Array
- Connecter `atlas_top` (qui sort maintenant en 2D Array) sur le bon slot

#### 7. `instance_data_top` (CHOP to TOP)
- Passe de 13 à 12 canaux -> texture 2649x12 au lieu de 2649x13

#### 8. `layout_engine` (executeDAT)
- Mettre à jour les lookups de metrics pour utiliser `slice_index` au lieu de `atlas_u/v/w/h`
- Le format des instances dans `_layout_instances` change

### Risques
- **Moyen** : c'est le changement le plus invasif (atlas + shader + metrics + CHOP)
- Le pattern Texture 2D Array est prouvé dans le projet (POP-TEXT-INSTANCING)
- Contrainte : tous les slices doivent avoir la même taille -> padding pour petits glyphes (`.`, `,`)

### Vérification
1. `screenshot_operator` sur `atlas_top` -> doit montrer des slices individuels (pas une seule rangée)
2. `screenshot_operator` sur `render_text` -> texte identique visuellement
3. Vérifier la mémoire GPU de `atlas_top` : doit être ~4MB au lieu de 256MB
4. Tester les 5 presets : editorial, displaced, textface, cutout, ASCII
5. Mesurer le temps de rebuild atlas (doit être plus rapide sans shelf-packing séquentiel)

### Impact estimé
- **VRAM** : 256MB -> ~4MB (64x réduction)
- **Rebuild atlas** : 291ms -> ~50-100ms (moins de pixels à écrire)
- **Shader** : légèrement plus simple (pas de UV rect math)

---

## Phase 2 : Downscale le readback vidéo pour ASCII

### Problème
`layout_engine._read_video_array()` lit `select_color` à 1920x1080 via `numpyArray()` = ~6.2MB/frame de readback GPU->CPU. Le preset ASCII n'a besoin que de ~69x39 cellules de luminance.

### Solution
Ajouter un `Resolution TOP` (nommé `res_color`) entre la source couleur et le readback, à **160x90** (même résolution que `res_obstacle`).

### Fichiers modifiés
- Créer l'opérateur `res_color` (Resolution TOP, 160x90, input = `select_color`)
- `layout_engine` : `_read_video_array()` lit depuis `op('/TDPretextNative/res_color')` au lieu de `select_color`
- Ajuster les coordonnées de sampling : `video_col = int((cx / W) * small_w)` etc.

### Risques
- **Faible** : la luminance à la résolution d'une cellule ASCII ne nécessite pas de précision pixel
- Légère différence visuelle possible (transitions plus douces) -> probablement meilleur

### Vérification
1. Comparer le preset ASCII avant/après visuellement
2. Mesurer le temps du `numpyArray()` call (~1.2ms -> ~0.05ms attendu)

### Impact : ~1.2ms/frame économisé sur le preset ASCII

---

## Phase 3 : Optimiser glyph_data Script CHOP

### Problème
~1.7ms/frame pour écrire 13 canaux x N samples en boucle Python. `copyNumpyArray()` n'existe pas sur Script CHOP. Le bulk write `chan.numpyArray()[:] =` est un anti-pattern documenté.

### Stratégies (cumulables)

**A. Réduire MAX_INSTANCES** : 8000 -> adaptatif par preset (~500-2000). Gain proportionnel.

**B. Cacher les méthodes __setitem__** :
```python
_set_tx = chans['tx'].__setitem__
for i in range(n):
    _set_tx(i, instances[i][0])
```
Élimine le lookup d'attribut par itération (~15-20% gain).

**C. Delta update** : ne réécrire que les samples qui ont changé entre frames (utile pour editorial/cutout statiques).

### Fichiers modifiés
- `glyph_script` (textDAT)
- `layout_engine` (pour stocker `_max_instances` adaptatif)

### Risques : **Faible** (optimisations Python pures, même output)

### Vérification
1. Perform CHOP : mesurer `glyph_script` cook time
2. Régression visuelle sur tous les presets

### Impact : ~1.7ms -> ~0.4-0.6ms/frame

---

## Phase 4 : Compositing conditionnel

### Problème
`thresh1`, `multiply1`, `level1`, `over1` cookent à 1920x1080 même pour les presets qui ne les utilisent pas.

### Solution
Toggler `par.bypass` via expressions basées sur le preset actif :
```python
# Sur multiply1, level1 etc. :
par.bypass.expr = "0 if parent().par.Preset in ('displaced','cutout','textface','ascii') else 1"
```

### Fichiers modifiés
- Configuration des paramètres `bypass` sur `thresh1`, `multiply1`, `level1`, `over1`, `text_cutout`, `cutout_comp`

### Risques : **Moyen** (possible glitch d'1 frame lors du changement de preset)

### Vérification
1. Switcher rapidement entre presets -> pas de frames noires
2. Perform CHOP : les TOPs bypassés montrent 0ms

### Impact : ~0.5-1ms/frame économisé sur les presets qui n'utilisent pas la chaîne

---

## Ordre d'exécution

| # | Phase | Effort | Risque | Impact |
|---|-------|--------|--------|--------|
| 1 | Texture 2D Array | ~2h | Moyen | 256MB -> 4MB VRAM |
| 2 | Downscale readback | ~30min | Faible | -1.2ms/frame (ASCII) |
| 3 | Optimize Script CHOP | ~1h | Faible | -1.2ms/frame |
| 4 | Compositing conditionnel | ~1h | Moyen | -0.5-1ms/frame |

Budget total estimé après les 4 phases : **~1-2ms/frame** (vs ~4.5ms actuellement), bien sous les 16.6ms pour 60fps constant.
