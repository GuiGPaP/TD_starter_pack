<!-- session_id: 87cfca88-b886-4ab9-91af-161305f5b072 -->
# Preset "wordcloud" pour TDPretextNative

## Context

L'utilisateur veut reproduire l'effet de la librairie Python `word_cloud` (exemple "parrot") dans TDPretextNative, en utilisant des techniques pures TouchDesigner. L'image source sert de masque (forme du nuage) ET de source de couleur (chaque mot prend la couleur de l'image sous lui). Les mots sont dimensionnés par fréquence et placés en spirale avec détection de collision.

Ceci est fondamentalement différent des presets existants (editorial, displaced...) qui font du layout ligne-par-ligne à chaque frame. Le wordcloud fait un **placement par mot, calculé une seule fois** et caché jusqu'au changement d'inputs.

---

## Architecture du preset wordcloud

```
text_source / word_table_dat
         ↓
   [word_freq_parser] → mots triés par fréquence + font_size par mot
         ↓
   mask_top.numpyArray() → occupancy_map (numpy int32)
         ↓
   [spiral_placer] → pour chaque mot :
     1. Mesurer bbox (somme char widths * scale_factor)
     2. Choisir rotation (0° ou 90° selon Wcpreferhorizontal)
     3. Spirale d'Archimède depuis le centre → premier emplacement libre (integral image O(1))
     4. Marquer occupancy, sampler couleur depuis image source
     5. Éclater le mot en instances char avec offsets
         ↓
   comp.store('_layout_instances', [...])  ← 14 channels par char
         ↓
   glyph_data (Script CHOP) → instance_data_top (CHOP→TOP)
         ↓
   render_geo (instancing) → text_glsl (MAT avec rotation) → render_text (TOP)
```

---

## Phase 1 — Paramètres et Atlas

### 1.1 Nouveaux paramètres custom sur `/TDPretextNative`

| Paramètre | Type | Default | Description |
|-----------|------|---------|-------------|
| `Wcmaxfontsize` | Int | 80 | Taille max (mot le + fréquent) |
| `Wcminfontsize` | Int | 10 | Taille min (mots rares) |
| `Wcmaxwords` | Int | 200 | Nombre max de mots à placer |
| `Wcrelativescaling` | Float [0-1] | 0.5 | Variation de taille (0=uniforme, 1=linéaire avec fréquence) |
| `Wcpreferhorizontal` | Float [0-1] | 0.9 | Probabilité horizontal (0=tout vertical, 1=tout horizontal) |
| `Wcspiralstep` | Float | 2.0 | Pixels/radian dans la spirale (densité) |
| `Wccolorfromimage` | Toggle | True | Colorer depuis l'image source |
| `Wcmasktop` | TOP | (empty) | Image source = masque + couleur |
| `Wcinputmode` | Menu | `text` | `text` (auto-count) ou `table` (DAT fréquences) |
| `Wcwordtable` | DAT | (empty) | Référence au Table DAT (mode table) |
| `Wcoccupancyscale` | Float | 0.25 | Échelle de la carte d'occupation (0.25 = 1/4 résolution, plus rapide) |
| `Wcpadding` | Int | 2 | Pixels de marge entre les mots |

### 1.2 Entrée preset menu

Ajouter `'wordcloud'` au menu du paramètre `Preset`.

### 1.3 Atlas pour wordcloud

Quand `preset == 'wordcloud'` : forcer `font_size = Wcmaxfontsize` pour la génération d'atlas. Le charset doit être au minimum `ascii` (les word clouds sont typiquement en Latin). L'atlas est rendu à `Wcmaxfontsize * RENDER_SCALE (3x)`.

Les mots plus petits utilisent le **scaling d'instance** (sx, sy réduits) — le downscaling GPU est net.

**Fichier à modifier** : `atlas_top` (scriptTOP) — ajouter un branchement sur le preset pour utiliser `Wcmaxfontsize` au lieu de `Fontsize`.

---

## Phase 2 — Algorithme de placement (layout_engine)

### 2.1 Parsing des mots + fréquences

**Mode `text`** (auto-count) :
```python
from collections import Counter
words = text_source.text.split()
word_counts = Counter(words)
# Supprimer mots courts (< 2 chars) et stopwords optionnels
```

**Mode `table`** (DAT) :
```python
table = op(comp.par.Wcwordtable)
word_counts = {table[r, 'word'].val: float(table[r, 'weight'].val)
               for r in range(1, table.numRows)}
```

### 2.2 Mapping fréquence → font_size

```python
words_sorted = sorted(word_counts.items(), key=lambda x: -x[1])[:max_words]
max_count = words_sorted[0][1]
for word, count in words_sorted:
    ratio = (count / max_count) ** relative_scaling  # 0..1
    font_size = min_font_size + (max_font_size - min_font_size) * ratio
```

### 2.3 Lecture du masque + initialisation occupancy

```python
mask_np = mask_top.numpyArray()[::-1, :, :]  # Y-flip
mask_gray = np.mean(mask_np[:, :, :3], axis=2)
# Sous-échantillonnage pour performance
occ_h = int(mask_gray.shape[0] * occ_scale)
occ_w = int(mask_gray.shape[1] * occ_scale)
mask_small = cv2.resize(mask_gray, (occ_w, occ_h))  # ou scipy.ndimage.zoom

# Convention word_cloud : blanc (>0.95) = interdit, sombre = valide
occupancy = np.zeros((occ_h, occ_w), dtype=np.int32)
occupancy[mask_small > 0.95] = 1  # marquer zones interdites
```

**Note** : utiliser `np.int32` pour l'occupancy (pas uint8) car cumsum overflow.

### 2.4 Placement en spirale avec integral image

```python
def _integral_rect_sum(integral, x0, y0, x1, y1):
    """O(1) collision check via integral image."""
    s = integral[y1-1, x1-1]
    if x0 > 0: s -= integral[y1-1, x0-1]
    if y0 > 0: s -= integral[y0-1, x1-1]
    if x0 > 0 and y0 > 0: s += integral[y0-1, x0-1]
    return s

def _place_word(occupancy, bbox_w, bbox_h, spiral_step, padding):
    H, W = occupancy.shape
    cx, cy = W // 2, H // 2
    bw = bbox_w + padding * 2
    bh = bbox_h + padding * 2
    
    integral = np.cumsum(np.cumsum(occupancy, axis=0), axis=1)
    
    d_theta = 0.1  # pas angulaire
    max_theta = 100 * 2 * math.pi  # 100 tours max
    for theta in np.arange(0, max_theta, d_theta):
        x = int(cx + spiral_step * theta * math.cos(theta))
        y = int(cy + spiral_step * theta * math.sin(theta))
        
        x0, y0 = x - bw // 2, y - bh // 2
        x1, y1 = x0 + bw, y0 + bh
        if x0 < 0 or y0 < 0 or x1 >= W or y1 >= H:
            continue
        
        if _integral_rect_sum(integral, x0, y0, x1, y1) == 0:
            # Libre ! Marquer l'occupancy
            occupancy[y0:y1, x0:x1] = 1
            return (x, y)  # centre en coordonnées occ_scale
    
    return None  # pas de place
```

**Optimisation** : recalculer l'integral image toutes les ~10 placements (pas à chaque mot). Les 10 mots entre deux rebuilds sont vérifiés séquentiellement contre l'occupancy brute — léger surcoût mais évite 200 rebuilds de la matrice intégrale.

### 2.5 Éclatement mot → instances char

Pour chaque mot placé à `(cx, cy)` avec `font_size` et `rotation` :

```python
scale = font_size / max_font_size
# Coordonnées en espace render (remonter depuis occ_scale)
render_cx = cx / occ_scale
render_cy = cy / occ_scale

if not rotated:
    # Horizontal : chars alignés sur X
    word_w = sum(metrics[ch]['width_px'] * scale for ch in word)
    char_x = render_cx - word_w / 2  # centrer
    for ch in word:
        cw = metrics[ch]['width_px'] * scale
        ch_h = metrics[ch]['height_px'] * scale
        inst_cx = char_x + cw / 2
        inst_cy = render_cy
        instances.append((inst_cx, inst_cy, ch, scale, 0.0, cr, cg, cb))
        char_x += cw
else:
    # Vertical (90° CCW) : chars empilés sur Y
    word_w = sum(metrics[ch]['width_px'] * scale for ch in word)
    char_y = render_cy - word_w / 2  # centrer verticalement
    for ch in word:
        cw = metrics[ch]['width_px'] * scale
        inst_cx = render_cx
        inst_cy = char_y + cw / 2
        instances.append((inst_cx, inst_cy, ch, scale, math.pi/2, cr, cg, cb))
        char_y += cw
```

### 2.6 Sampling couleur depuis l'image

```python
if comp.par.Wccolorfromimage:
    color_img = mask_top.numpyArray()[::-1, :, :3]  # même image = masque + couleur
    # Sampler au centre du mot (coordonnées render → coordonnées image)
    img_y = min(int(render_cy), color_img.shape[0] - 1)
    img_x = min(int(render_cx), color_img.shape[1] - 1)
    cr, cg, cb = color_img[img_y, img_x]  # valeurs 0..1 (numpyArray retourne des floats)
else:
    cr, cg, cb = -1.0, 0.0, 0.0  # sentinel → shader utilise uTextColor
```

### 2.7 Cache (dirty flag)

```python
def _compute_wc_hash(comp):
    text_hash = hash(text_source.text)
    mask_hash = int(np.sum(mask_np) * 1000)
    par_hash = hash((comp.par.Wcmaxfontsize.eval(), comp.par.Wcminfontsize.eval(),
                     comp.par.Wcmaxwords.eval(), comp.par.Wcrelativescaling.eval(),
                     comp.par.Wcpreferhorizontal.eval()))
    return hash((text_hash, mask_hash, par_hash))

# Dans onFrameEnd :
if preset == 'wordcloud':
    h = _compute_wc_hash(comp)
    if h == comp.fetch('_wc_hash', None):
        return  # rien n'a changé, skip
    instances = _layout_wordcloud(...)
    comp.store('_layout_instances', instances)
    comp.store('_wc_hash', h)
```

---

## Phase 3 — Support rotation dans le GLSL

### 3.1 Nouveau channel `rz` dans glyph_data (Script CHOP)

Ajouter le channel `rz` (index 13) dans le Script CHOP. Le CHOP-to-TOP s'adapte automatiquement (suit le nombre de channels).

Format instance data étendu (14 channels) :
```
tx(0), ty(1), tz(2), sx(3), sy(4), sz(5),
atlas_u(6), atlas_v(7), atlas_w(8), atlas_h(9),
cr(10), cg(11), cb(12), rz(13)
```

### 3.2 Vertex shader modifié (`text_vert`)

TDDeform ne supporte pas la rotation per-instance. Pour le preset wordcloud, on bypass TDDeform et on fait la transformation manuellement :

```glsl
uniform sampler2D sInstanceData;
uniform int uUseRotation;  // 0 = standard, 1 = wordcloud

out vec2 vLocalUV;
flat out vec4 vAtlasRect;
flat out vec3 vInstanceColor;

void main()
{
    int id = TDInstanceID();
    vLocalUV = uv[0].st;

    // Atlas UV (commun à tous les presets)
    float au = texelFetch(sInstanceData, ivec2(id, 6), 0).r;
    float av = texelFetch(sInstanceData, ivec2(id, 7), 0).r;
    float aw = texelFetch(sInstanceData, ivec2(id, 8), 0).r;
    float ah = texelFetch(sInstanceData, ivec2(id, 9), 0).r;
    vAtlasRect = vec4(au, av, aw, ah);

    // Per-instance color
    vInstanceColor = vec3(
        texelFetch(sInstanceData, ivec2(id, 10), 0).r,
        texelFetch(sInstanceData, ivec2(id, 11), 0).r,
        texelFetch(sInstanceData, ivec2(id, 12), 0).r
    );

    if (uUseRotation == 1) {
        float tx_v = texelFetch(sInstanceData, ivec2(id, 0), 0).r;
        float ty_v = texelFetch(sInstanceData, ivec2(id, 1), 0).r;
        float sx_v = texelFetch(sInstanceData, ivec2(id, 3), 0).r;
        float sy_v = texelFetch(sInstanceData, ivec2(id, 4), 0).r;
        float rz   = texelFetch(sInstanceData, ivec2(id, 13), 0).r;

        // Scale unit quad, rotate, translate
        vec2 scaled = vec2(P.x * sx_v, P.y * sy_v);
        float c = cos(rz); float s = sin(rz);
        vec2 rotated = vec2(scaled.x*c - scaled.y*s,
                            scaled.x*s + scaled.y*c);
        vec4 worldPos = vec4(rotated.x + tx_v, rotated.y + ty_v, 0.0, 1.0);
        gl_Position = TDWorldToProj(worldPos);
    } else {
        // Chemin standard (editorial, displaced, etc.)
        vec4 worldPos = TDDeform(P);
        gl_Position = TDWorldToProj(worldPos);
    }
}
```

### 3.3 Fragment shader (`text_frag`)

Le fragment shader existant supporte déjà le per-instance color (sentinel cr=-1). On ajoute juste le varying `vInstanceColor` s'il n'est pas déjà là :

```glsl
uniform sampler2D sAtlas;
uniform vec4 uTextColor;

in vec2 vLocalUV;
flat in vec4 vAtlasRect;
flat in vec3 vInstanceColor;

layout(location = 0) out vec4 fragColor;

void main()
{
    vec2 atlasUV = vAtlasRect.xy + vLocalUV * vAtlasRect.zw;
    vec4 texel = texture(sAtlas, atlasUV);
    float alpha = texel.a * uTextColor.a;
    if (alpha < 0.01) discard;

    vec3 color = (vInstanceColor.r < 0.0) ? uTextColor.rgb : vInstanceColor;
    fragColor = TDOutputSwizzle(vec4(color, alpha));
}
```

### 3.4 Uniform `uUseRotation`

Expression sur le GLSL MAT :
```python
mat.par.vec2name = 'uUseRotation'
mat.par.vec2valuex.expr = "1 if parent().par.Preset == 'wordcloud' else 0"
```

---

## Phase 4 — Intégration preset

### 4.1 Dispatch dans layout_engine

Dans `onFrameEnd` du layout_engine :
```python
preset = str(comp.par.Preset)
if preset == 'wordcloud':
    _handle_wordcloud(comp)
    return
# ... code existant pour editorial, displaced, etc.
```

### 4.2 Preset dict

```python
'wordcloud': {
    'Fontsize': 80,
    'Atlascharset': 'ascii',
    'Wcmaxfontsize': 80,
    'Wcminfontsize': 10,
    'Wcmaxwords': 200,
    'Wcrelativescaling': 0.5,
    'Wcpreferhorizontal': 0.9,
    'Wcspiralstep': 2.0,
    'Wccolorfromimage': True,
    'Wcoccupancyscale': 0.25,
    'Wcpadding': 2,
}
```

### 4.3 Output routing

Le wordcloud sort directement du `render_text` — pas de compositing webcam/masque. Wirer via `output_switch` existant.

---

## Phase 5 — Vérification

1. **Atlas** : `get_dat_text` sur `glyph_metrics` → vérifier que les glyphes sont à `Wcmaxfontsize`
2. **Layout** : log le nombre de mots placés vs `Wcmaxwords`
3. **Collision** : debug output de l'occupancy map comme TOP → visuellement aucun overlap
4. **Masque** : aucun mot hors de la zone valide du masque
5. **Rotation** : screenshot via MCP → confirmer mix horizontal/vertical
6. **Couleur** : comparer les couleurs des mots avec l'image source à leurs positions
7. **Performance** : layout < 500ms pour 200 mots à 480x270 occupancy. Render < 1ms GPU
8. **Cache** : changer le texte → re-layout. Ne rien changer → aucun coût CPU (skip)
9. **Modes input** : tester texte brut ET table DAT

---

## Fichiers critiques à modifier

| Opérateur TD | Type | Modification |
|-------------|------|-------------|
| `/TDPretextNative` | COMP | Ajouter paramètres `Wc*`, `'wordcloud'` au menu Preset |
| `atlas_top` | scriptTOP | Brancher sur `Wcmaxfontsize` quand preset=wordcloud |
| `layout_engine` | executeDAT | Ajouter `_handle_wordcloud()` + algorithme spirale |
| `glyph_data` | scriptCHOP | Ajouter channel `rz` (index 13) |
| `text_vert` | textDAT | Shader vertex avec rotation conditionnelle |
| `text_frag` | textDAT | Shader fragment avec per-instance color |
| `text_glsl` | glslMAT | Ajouter uniform `uUseRotation` |

## Skill references à consulter pendant l'implémentation

- `.claude/skills/td-pretext/references/layout.md` — coord system, data flow, Script CHOP anti-patterns
- `.claude/skills/td-pretext/references/rendering.md` — GLSL MAT config, instance data texture format
- `.claude/skills/td-pretext/references/atlas.md` — atlas pipeline, metrics format, charset preloading

---

## Risques et mitigations

| Risque | Mitigation |
|--------|-----------|
| Integral image overflow (uint8) | Utiliser `np.int32` pour occupancy |
| Coord Y-flip mismatch | Même convention que presets existants : `ty = -(layout_y - h/2)` |
| Atlas rebuild quand on switch preset | Le charset_watcher détecte le changement |
| Mesure de mots imprécise (char-level) | Ajouter `Wcpadding` pixels de marge aux bboxes |
| Spirale lente pour petits mots en fin | Cap à 100 tours, skip les mots qui ne rentrent pas |
| TDDeform incompatible avec rotation | Bypass vers transform manuel dans le vertex shader |
