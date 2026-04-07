<!-- session_id: c6293e83-abf6-40c6-9c51-a544e4e3e759 -->
# Plan : Alignement bords + Modes Text Face & Cutout in Text

## Contexte

TDPretextNative a maintenant un bon alignement texte/silhouette (right-align sur les segments gauche de l'obstacle). L'utilisateur demande :
1. **Alignement bords écran** — le texte devrait aussi coller au bord gauche et droit de l'image (justify)
2. **Mode Text Face** — remplir la silhouette de la personne avec du texte coloré par les pixels vidéo
3. **Mode Cutout in Text** — texte dense sur tout l'écran, la vidéo de la personne "découpe" le texte

Inspiré du projet [fifteen42/pretext-video](https://github.com/fifteen42/pretext-video).

---

## Architecture existante (rappel)

```
text_source → atlas_script → atlas_top (4096x4096 texture)
                                  ↓
videodevin1 → nvbackground1 → ... → null_mask → select_mask
                                                      ↓
layout_engine (Execute DAT, onFrameEnd) → glyph_data (Script CHOP)
                                              ↓
                              render_geo (instancing) + text_glsl (GLSL MAT)
                                              ↓
                                         render_text → over1 → null_flow
```

**Preset actuel :** `displaced` (bitmap obstacle avoidance avec webcam)

---

## Fix 1 : Justify texte sur les bords gauche/droit de l'écran

### Logique

Quand une ligne n'a qu'un seul segment (pas d'obstacle), le texte est left-aligned. Pour le "justifier" aux deux bords, on distribue l'espace restant entre les mots.

**Algorithme (dans `layout_engine`) :**
- Si `num_segs == 1` et que la ligne n'est PAS la dernière : distribuer `(seg.w - line_w)` uniformément entre les espaces de la ligne
- Si `num_segs > 1` : garder le comportement actuel (right-align à gauche, left-align à droite)
- Dernière ligne du texte : toujours left-align (convention typographique)

**Implémentation :** Dans la boucle de placement des chars, calculer `extra_space = (seg.w - line_w) / num_spaces` et l'ajouter à chaque espace rencontré.

### Fichier modifié
- `/TDPretextNative/layout_engine` — ajouter justify dans la boucle de placement

---

## Feature 2 : Mode "Text Face"

### Principe
La silhouette de la personne (webcam + NVIDIA Background removal) est remplie de texte. Chaque caractère est coloré par le pixel vidéo à sa position. Les zones sombres ont plus d'opacité, les zones claires sont plus transparentes.

### Pipeline TD natif

```
videodevin1 → nvbackground1 → null_mask (masque alpha)
videodevin1 → null1 (vidéo brute, miroir)
                  ↓
layout_engine : pour chaque ligne Y, trouver les bounds de la personne dans le masque
              → placer le texte UNIQUEMENT dans les bounds de la personne
              → stocker (x, y, char) comme d'habitude
                  ↓
glyph_script : tx, ty, sx, sy, atlas UVs (identique)
                  ↓
text_frag (GLSL MAT) : MODIFIÉ pour sampler la vidéo à la position du char
              → luminance = dot(rgb, vec3(0.299, 0.587, 0.114))
              → alpha = pow(1.0 - luminance, 0.6) * mask_confidence
              → color = vidéo RGB * 0.4 (assombri)
```

### Changements nécessaires

**`layout_engine` :** Ajouter un mode `textface` :
- Au lieu de soustraire l'obstacle des segments, INVERSER : le texte ne va QUE dans l'obstacle
- Pour chaque Y : scanner le masque pour trouver les spans "personne" (alpha > 0.5)
- Utiliser ces spans comme segments disponibles (au lieu de les soustraire)
- Ajouter un `innerMargin` (fontSize * 0.3) pour du padding intérieur

**`text_frag` :** Ajouter un sampler `sVideo` (la vidéo webcam) + un uniform `uMode` :
- Mode 0 (displaced/editorial) : comportement actuel (couleur uniforme)
- Mode 1 (textface) : sampler la vidéo à la position écran du fragment, calculer luminance → alpha, colorer par les pixels vidéo assombris

**`text_vert` :** Passer la position écran normalisée au fragment shader pour le sampling vidéo.

**Nouveaux opérateurs :**
- Aucun nouveau TOP nécessaire — on réutilise `videodevin1` via le sampler du GLSL MAT

### Formule couleur (port de pretext-video)
```glsl
// Dans text_frag, mode textface :
vec2 screenUV = gl_FragCoord.xy / vec2(1920.0, 1080.0);
screenUV.x = 1.0 - screenUV.x;  // miroir selfie
vec3 videoRGB = texture(sVideo, screenUV).rgb;
float lum = dot(videoRGB, vec3(0.299, 0.587, 0.114));
float lumAlpha = pow(1.0 - lum, 0.6);
float alpha = max(0.05, lumAlpha * texel.a);
vec3 color = videoRGB * 0.4;
fragColor = TDOutputSwizzle(vec4(color, alpha));
```

---

## Feature 3 : Mode "Cutout in Text"

### Principe
Le texte dense couvre tout l'écran. La vidéo de la personne "coupe" à travers le texte, créant un effet silhouette.

### Pipeline TD natif

```
render_text (texte dense, plein écran, pas d'obstacle avoidance)
     ↓
multiply1 : render_text × (1 - mask_alpha)  → texte avec trou
     ↓
over1 : vidéo mirrored OVER texte troué
     ↓
null_flow
```

### Changements nécessaires

**`layout_engine` :** Mode `cutout` = pas d'obstacle avoidance du tout. Remplir tout l'écran de texte dense (un seul segment pleine largeur par ligne). Le texte est justify pour un effet dense.

**Compositing (existant !) :** Les opérateurs `multiply1`, `over1` existent déjà. Il suffit de les re-wirer :
- `multiply1` : `render_text` × `(1 - mask_alpha)` → texte avec trou en forme de personne
- `over1` : vidéo mirrored (avec un léger blur de 4px sur le masque pour edges douces) OVER le résultat

**Masque avec blur :** Ajouter un `blurTOP` sur le masque avant le multiply pour des edges douces (4px comme dans pretext-video).

**Nouveaux opérateurs :**
- `blur_mask` (blurTOP) — blur 4px sur le masque alpha pour edges douces
- Re-wiring de `multiply1` et `over1` selon le mode

---

## Feature 4 : Menu Preset dans le COMP

### Paramètre existant
`Preset` est déjà un custom par sur `/TDPretextNative` (valeur actuelle : `"displaced"`).

### Nouvelles valeurs
| Preset | Description |
|--------|-------------|
| `displaced` | Actuel — texte coule autour de la silhouette |
| `textface` | Texte remplit la silhouette, coloré par la vidéo |
| `cutout` | Texte dense plein écran, vidéo découpe la silhouette |
| `editorial` | Texte plein écran sans obstacle (pas de webcam) |

### Routage par preset
- **layout_engine** : `BITMAP_PRESETS = {'displaced'}` → ajouter `INSIDE_PRESETS = {'textface'}`, `NOBS_PRESETS = {'cutout', 'editorial'}`
- **text_frag** : uniform `uMode` = 0 (normal), 1 (textface) → piloté par le preset
- **Compositing** : `switch1`/`switch2` (déjà existants) routent le pipeline selon le preset

---

## Ordre d'implémentation

1. **Justify bords** — modifier `layout_engine` pour distribuer l'espace dans les lignes single-segment
2. **Mode cutout** — le plus simple : pas de layout change (juste dense text), compositing TOP existant
3. **Mode textface** — layout inversé (texte dans l'obstacle) + shader vidéo sampling
4. **Menu preset** — câbler le tout via le paramètre `Preset` existant

## Fichiers modifiés

| Opérateur | Modifications |
|-----------|--------------|
| `layout_engine` | Justify, mode textface (segments inversés), mode cutout (no obstacle) |
| `text_frag` | Sampler vidéo + luminance alpha pour textface |
| `text_vert` | Passer screen position au fragment |
| `text_glsl` (MAT) | Ajouter sampler `sVideo` |
| `over1` / `multiply1` | Re-wiring pour cutout |
| Nouveau : `blur_mask` | Blur 4px sur masque pour cutout edges douces |

## Vérification

1. **Justify :** les lignes sans obstacle remplissent toute la largeur, bords alignés
2. **Cutout :** texte dense + silhouette vidéo visible, edges douces
3. **Textface :** texte dans la silhouette, couleurs vidéo visibles, zones sombres = texte opaque
4. **Performance :** vérifier que les 3 modes restent < 16ms/frame (via Perform CHOP)
5. **Switching :** le menu Preset bascule proprement entre les modes
