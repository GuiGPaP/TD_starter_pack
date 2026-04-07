<!-- session_id: 58b80131-f6b6-4175-b215-c70ab9d0c079 -->
# Plan: ASCII Grid via GLSL POP (remplace le Python per-instance)

## Context

Le preset ASCII hybride fonctionne (flow text dehors, ASCII grid dedans la silhouette) mais le pipeline Python `layout_engine → glyph_script (Script CHOP) → chopToTOP` est le bottleneck :
- **Script CHOP** : 3.4ms CPU per-frame pour écrire sample par sample
- **CHOP→TOP** : 187ms CPU (!!) pour la conversion
- **Limite 8000 instances** : avec cell_size=1, on sature immédiatement

Le user veut garder l'effet dense (beaucoup de chars dans la silhouette) mais sans la limite. **Solution : GLSL POP compute shader** pour la grille ASCII, entièrement sur GPU.

## Architecture cible

```
FLOW TEXT (dehors silhouette)          ASCII GRID (dedans silhouette)
─────────────────────────              ──────────────────────────────
layout_engine (Python)                 grid SOP (full screen grid)
    ↓                                      ↓
glyph_data (Script CHOP)              GLSL POP (compute shader)
    ↓                                  ├─ sampler: mask texture
instance_data_top (CHOP→TOP)           ├─ sampler: video texture
    ↓                                  ├─ sampler: atlas_lookup texture
render_geo_flow (Geometry COMP)        ├─ uniforms: cell_size, palette_len, tint
    ↓                                  └─ outputs: P, pscale, Cd, atlas UVs
text_glsl (GLSL MAT)                      ↓
    ↓                                  render_geo_ascii (Geometry COMP)
render_text (Render TOP)                   ↓
    ← ← ← ← ← ← both render here ← text_glsl_ascii (GLSL MAT)
```

Deux Geometry COMPs rendus dans le même Render TOP = un single pass, pas de merge nécessaire.

## Étape 1 — Atlas lookup texture

L'atlas 2D actuel est packed (shelf-packing). Le GLSL POP doit mapper `(char_index, scale_index)` → `(atlas_u, atlas_v, atlas_w, atlas_h)`.

**Solution** : petite texture lookup générée par `atlas_script` :
- Taille : `palette_len × 3` (palette chars × 3 scales)
- Format : RGBA32F, 4 canaux = (au, av, aw, ah)
- Pixel `(char_idx, scale_idx)` → atlas UV rect pour ce char à cette scale

**Modifications `atlas_script`** :
- Après le pack multi-taille existant, créer un numpy array `(3, palette_len, 4)` float32
- Pour chaque `(char, scale)` combo, stocker les atlas UVs normalisées
- Écrire dans un second Script TOP (`ascii_lookup_top`) via `copyNumpyArray`
- Ou stocker dans un DAT et convertir via chopToTOP

**Aussi** : ajouter les dimensions display (width_px, height_px) comme 2 canaux supplémentaires → format RGBA32F × 2 textures, ou une seule texture `palette_len × 3 × 2` (6 floats via 2 fetches).

Alternative plus simple : texture `palette_len × 3`, 2 pixels de large : pixel 0 = (au, av, aw, ah), pixel 1 = (disp_w, disp_h, 0, 0).

## Étape 2 — Grid SOP

Un simple Grid SOP qui couvre l'écran :
- Rows = `ceil(H / cell_size)`
- Columns = `ceil(W / cell_size)`
- Chaque point = centre d'une cellule potentielle
- Expression sur les params pour suivre `Asciicellsize` et résolution

Le grid fournit le point count fixe au GLSL POP. Les points hors silhouette seront rendus invisibles (pscale=0).

## Étape 3 — GLSL POP compute shader

**Opérateur** : GLSL POP (pas Advanced — on modifie un seul attribute class : point)

**Inputs/Uniforms** :
```glsl
uniform sampler2D sMask;        // silhouette mask (alpha)
uniform sampler2D sVideo;       // webcam color
uniform sampler2D sAtlasLookup; // palette_len × 3, atlas UV rects
uniform vec2 uResolution;       // (1920, 1080)
uniform float uCellSize;        // cell_size in pixels
uniform int uPaletteLen;        // nombre de chars dans la palette
uniform float uTintFactor;      // 0-1, intensité couleur vidéo
uniform int uUseColor;          // 0 or 1
uniform int uCols;              // grid columns
```

**Output attributes** : `P`, `Cd`, `pscale`, + custom `atlas_uv` (vec4)

**Algorithme** :
```glsl
void main() {
    const uint id = TDIndex();
    if (id >= TDNumElements()) return;
    
    // Grid position → pixel coords
    int col = int(id) % uCols;
    int row = int(id) / uCols;
    float px = (float(col) + 0.5) * uCellSize;
    float py = (float(row) + 0.5) * uCellSize;
    
    // Normalized UV for mask/video sampling
    vec2 uv = vec2(px / uResolution.x, py / uResolution.y);
    
    // Check mask — inside silhouette?
    float maskAlpha = texture(sMask, uv).a;
    if (maskAlpha < 0.25) {
        pscale[id] = 0.0;  // invisible
        P[id] = vec3(0.0);
        return;
    }
    
    // Sample video luminance
    vec3 rgb = texture(sVideo, uv).rgb;
    float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
    
    // Map luminance → char index (light=0, dark=palette_len-1)
    int charIdx = clamp(int((1.0 - lum) * float(uPaletteLen - 1)), 0, uPaletteLen - 1);
    
    // Map luminance → scale (0=small, 1=medium, 2=large)
    int scaleIdx = (lum > 0.66) ? 0 : (lum > 0.33) ? 1 : 2;
    
    // Lookup atlas UV rect
    vec4 atlasRect = texelFetch(sAtlasLookup, ivec2(charIdx, scaleIdx * 2), 0);
    vec4 dispSize = texelFetch(sAtlasLookup, ivec2(charIdx, scaleIdx * 2 + 1), 0);
    
    // Position (screen-space pixels)
    P[id] = vec3(px, py, 0.0);
    
    // Scale = display size of this char variant
    pscale[id] = dispSize.x;  // or use sx/sy if non-uniform
    
    // Atlas UV
    atlas_uv[id] = atlasRect;
    
    // Color
    if (uUseColor == 1) {
        Cd[id] = vec4(rgb * uTintFactor, 1.0);
    } else {
        Cd[id] = vec4(-1.0, -1.0, -1.0, 1.0);  // sentinel
    }
}
```

## Étape 4 — Geometry COMP pour ASCII (render_geo_ascii)

**Instancing depuis POP output** :
```python
geo.par.instancing = True
geo.par.instanceop = 'ascii_pop_null'  # null SOP après GLSL POP
geo.par.instancetx = 'P0'
geo.par.instancety = 'P1'  
geo.par.instancetz = 'P2'
geo.par.instancesx = 'pscale'  # ou attribut custom sx
geo.par.instancesy = 'pscale'  # ou sy
```

**Matériel** : même GLSL MAT que le flow (`text_glsl`) ou un variant qui lit `atlas_uv` depuis les attributs POP au lieu de `sInstanceData`.

**Note** : il faudra adapter le vertex shader pour lire atlas UV depuis les point attributes POP (via instance attributes) au lieu du CHOP→TOP texture.

## Étape 5 — Adapter le GLSL MAT pour POP

Deux options :
- **A)** Passer atlas_uv via l'instancing (custom instance attributes sur Geometry COMP)
- **B)** Écrire atlas_uv dans Cd.rgb (hack) et lire dans le shader

**Option A est propre** : Geometry COMP supporte des custom instance attributes via des noms de channels. On passe `atlas_u`, `atlas_v`, `atlas_w`, `atlas_h` comme 4 float instance attributes.

Le vertex shader ASCII lit les atlas UVs depuis les instance attributes (TDInstanceTexCoord ou custom) au lieu de texelFetch sur sInstanceData.

## Étape 6 — Retirer ASCII du Python layout_engine

- `layout_engine` : quand preset = 'ascii', ne génère QUE le flow text (dehors silhouette)
- Plus de `_layout_ascii_grid()` ni `_read_video_array()` dans le Python
- `glyph_data` Script CHOP ne gère que les instances flow (max ~2000, rapide)
- Le GLSL POP gère 50k+ points ASCII sur GPU sans problème

## Fichiers / opérateurs à modifier

| Opérateur | Action |
|-----------|--------|
| `atlas_script` | Ajouter génération de la texture lookup (palette×scales→atlas UV) |
| `layout_engine` | Retirer `_layout_ascii_grid`, ne garder que flow text pour preset ascii |
| `glyph_script` | Pas de changement (ne gère que flow text) |
| **Nouveau** `ascii_grid` (Grid SOP) | Grille couvrant l'écran |
| **Nouveau** `ascii_pop` (GLSL POP) | Compute shader : mask+video→P,Cd,pscale,atlas_uv |
| **Nouveau** `ascii_lookup_top` (Script TOP) | Texture lookup char→atlas UV |
| **Nouveau** `render_geo_ascii` (Geometry COMP) | Instancing depuis POP |
| `text_vert` / ou nouveau `ascii_vert` | Variante qui lit atlas UV depuis instance attributes |
| `render_text` | Ajouter render_geo_ascii comme geometry source |

## Performance attendue

| Composant | Avant (Python) | Après (POP) |
|-----------|---------------|-------------|
| ASCII grid compute | ~1-3ms CPU | <0.1ms GPU |
| CHOP→TOP (ASCII) | 187ms CPU (!!) | **éliminé** |
| Instance count | 8000 max | **100k+** facile |
| Flow text (inchangé) | ~3ms | ~3ms |
| **Total** | **~190ms** | **~3.5ms** |

## Vérification

1. Créer grid SOP, vérifier point count = ceil(W/cell) × ceil(H/cell)
2. Créer GLSL POP, vérifier compilation sans erreur
3. Vérifier que les points hors silhouette ont pscale=0 (invisibles)
4. Vérifier que les points dedans ont des atlas UVs corrects
5. Vérifier le rendu final : chars variés, couleurs, densité
6. Comparer perf avant/après via `get_performance`
7. Tester avec cell_size très petit (5-10px) pour valider la scalabilité
