<!-- session_id: 58b80131-f6b6-4175-b215-c70ab9d0c079 -->
# Plan: Nouveau Preset "Variable Typographic ASCII"

## Context

Le preset `displaced` actuel ne wrappe pas toujours correctement la silhouette (bug de sampling row/cache). Le user veut un nouveau preset **hybride** inspiré de [pretext-video](https://github.com/fifteen42/pretext-video) :

- **Intérieur silhouette** : grille ASCII art — chaque cellule sample la luminance vidéo → caractère de densité (` .:-=+*#%@`) + taille variable
- **Extérieur silhouette** : texte fluide qui coule autour (comme displaced, mais fixé)
- **Implémentation** : Native TD (étendre TDPretextNative), pas Web Render TOP

## Fichiers critiques

| Fichier | Rôle |
|---------|------|
| `.claude/skills/td-pretext/references/atlas.md` | Pattern atlas, shelf-packing, metrics table |
| `.claude/skills/td-pretext/references/layout.md` | Layout engine, bitmap spans, greedy breaking |
| `.claude/skills/td-pretext/references/rendering.md` | GLSL MAT, instancing, instance data texture (Nx10) |
| Operators dans `/TDPretextNative` via MCP | `atlas_script`, `layout_engine`, `glyph_data`, `text_vert`, `text_frag` |

## Étape 1 — Fix du wrapping displaced (bug existant)

**Problème** : le texte ne contourne pas toujours la silhouette.

**Causes probables** (à vérifier via MCP `get_dat_text` sur `layout_engine`) :
1. **Cache span fragile** : `int(np.sum(alpha) * 1000)` peut rester stable quand la silhouette bouge légèrement
2. **Row mapping imprécis** : `int(round((by / H) * num_rows))` — si `H` != hauteur réelle du mask, le mapping dérive
3. **Margin dilation** : `span_start * W - margin` — vérifier que span_start est bien normalisé (0-1)

**Fix** :
- Remplacer le hash par `hash(alpha.tobytes()[:8192])` ou un frame counter dirty flag
- Utiliser `alpha.shape[0]` au lieu de `H` pour le mapping row
- Ajouter un guard : si mask est vide ou résolution 0, skip bitmap mode

## Étape 2 — Atlas avec palette configurable + multi-taille

> **Note** : TD `textTOP` n'a pas de param `fontweight` numérique (juste `bold` toggle). On varie la **taille** par luminance.

### Palette configurable

La palette est un **paramètre string** sur le COMP — l'utilisateur y met ce qu'il veut :
- Densité ASCII classique : `" .:-=+*#%@"`
- Tous les ASCII imprimables : `" !\"#$%&'()*+,-./0-9:;<=>?@A-Z[\\]^_a-z{|}~"`
- Lettres seules : `"ABCDEFGHIJKLMNOPQRSTUVWXYZ"`
- Emojis : `"😀🔥💀⭐🌊🎵❤️🌸"` (si le font de TD les supporte)
- Mix custom : `".:*@#HELLO"`

Les chars sont triés par **densité visuelle** (du plus clair au plus sombre). L'utilisateur les ordonne dans le string — le premier char = luminance haute (clair), le dernier = luminance basse (sombre).

### Multi-taille

Chaque char de la palette est généré à 3 tailles dans l'atlas :
- `small` = 0.6× line_height
- `medium` = 1.0× line_height  
- `large` = 1.4× line_height

**Modifications `atlas_script`** :
```python
ASCII_SCALES = {'small': 0.6, 'medium': 1.0, 'large': 1.4}
```

- Lire la palette depuis `comp.par.Asciipalette.eval()` (paramètre custom string)
- S'assurer que tous les chars de la palette sont dans l'atlas (certains peuvent déjà exister du texte normal)
- Second pass : pour chaque scale × chaque char de la palette :
  - Ajuster `helper.par.fontsize` = base_size × scale × RENDER_SCALE
  - Mesurer + render + shelf-pack
  - Clé dans `glyph_metrics` : `char + '_' + scale_name` (ex: `@_large`, `🔥_small`)
- Stocker lookup rapide dans `comp.store('_ascii_metrics', dict)`

**Budget atlas** : même avec 95 chars ASCII × 3 tailles = 285 tiles × ~60×60px à 3x ≈ ~1000×1000px. Toujours confortable dans le 4096×4096.

## Étape 3 — Layout engine hybride

**Nouveau preset** : `ASCII_PRESETS = {'ascii'}`

**Nouvelle logique dans `onFrameEnd`** :

```
Pour chaque ligne Y (0 → H, step = line_height) :
│
├─ Extraire bitmap_spans pour cette row (existant)
├─ Calculer outside_segs = segments HORS silhouette (existant, displaced)
├─ Calculer inside_spans = spans DANS silhouette (inverse)
│
├─ OUTSIDE : greedy flow layout (existant _layout_line_fast)
│   → instances avec atlas normal, couleur uniforme
│
└─ INSIDE : grille ASCII
    ├─ Lire video_array = op('color').numpyArray()[::-1,:,:3]
    ├─ Pour chaque cellule (step = cell_size) dans inside_spans :
    │   ├─ Sample luminance au centre de la cellule
    │   ├─ luminance → char_idx dans ASCII_CHARS
    │   ├─ luminance → scale ('small'/'medium'/'large')
    │   ├─ Lookup atlas metrics pour (char, scale)
    │   ├─ Optionnel : tint color depuis RGB vidéo
    │   └─ Append instance (x, y, metrics, color)
    └─ cell_size = line_height (alignement vertical avec le flow)
```

**Video array** : lire `op('color')` (webcam colorée), cache par frame. Coût ~0.5ms à résolution mask (480×270 via `res_obstacle`).

**Mapping luminance** :
```python
palette = comp.par.Asciipalette.eval()  # ex: " .:-=+*#%@" ou "ABCXYZ🔥"
lum = 0.299*r + 0.587*g + 0.114*b  # 0..1
char_idx = int((1.0 - lum) * (len(palette) - 1))  # sombre → dernier char
char = palette[max(0, min(char_idx, len(palette) - 1))]
scale = 'small' if lum > 0.66 else 'medium' if lum > 0.33 else 'large'
```

## Étape 4 — Extension instance data (per-instance color)

**Actuellement** : instance data texture = Nx10 (tx,ty,tz,sx,sy,sz,au,av,aw,ah)

**Ajout** : 3 canaux couleur → Nx13 (+ cr@10, cg@11, cb@12)

**`glyph_data` Script CHOP** :
- Ajouter `scriptOp.appendChan('cr')`, `cg`, `cb`
- Pour les instances ASCII : `cr,cg,cb` = vidéo RGB × tint_factor (ex: 0.5)
- Pour les instances flow : `cr,cg,cb` = -1.0 (sentinel → shader utilise `uTextColor`)

**`chop_to_top`** : mise à jour automatique (suit le nombre de canaux CHOP).

## Étape 5 — GLSL shader updates

**`text_vert`** — ajouter :
```glsl
flat out vec3 vInstanceColor;
// ...
float cr = texelFetch(sInstanceData, ivec2(id, 10), 0).r;
float cg = texelFetch(sInstanceData, ivec2(id, 11), 0).r;
float cb = texelFetch(sInstanceData, ivec2(id, 12), 0).r;
vInstanceColor = vec3(cr, cg, cb);
```

**`text_frag`** — modifier le color final :
```glsl
flat in vec3 vInstanceColor;
// ...
vec3 col = (vInstanceColor.r < 0.0) ? uTextColor.rgb : vInstanceColor;
float alpha = texel.a * uTextColor.a;
if (alpha < 0.01) discard;
fragColor = TDOutputSwizzle(vec4(col, alpha));
```

## Étape 6 — Preset registration et compositing

- Ajouter `'ascii'` dans le dispatch du layout engine
- Compositing = même que displaced (index 0 dans `output_switch`)
- Custom parameters sur `/TDPretextNative` :
  - `Asciipalette` (string, default: `' .:-=+*#%@'`) — chars triés clair→sombre, n'importe quoi (ASCII, lettres, emojis)
  - `Asciitint` (float 0-1, default: 0.5) — intensité du tint vidéo sur les chars ASCII
- Valeurs preset :
  ```python
  'ascii': {
      'Fontsize': 24,
      'Lineheight': 28,
      'Padding': 20,
      'bitmapObstacle': True,
      'bitmapMargin': 8,
      'Minsegwidth': 40,
      'Asciipalette': ' .:-=+*#%@',
      'Asciitint': 0.5,
  }
  ```

## Budget performance

| Composant | Displaced actuel | ASCII estimé |
|-----------|-----------------|--------------|
| bitmap_spans | 0.03ms | 0.03ms |
| video_array read | — | ~0.5ms |
| layout outside | 2.7ms | ~1.5ms |
| layout inside (grid) | — | ~0.8ms |
| glyph_script | 1.2ms | ~1.5ms |
| GPU render | <0.5ms | <0.5ms |
| **Total** | **~4.5ms** | **~4.8ms** |

## Vérification

1. **MCP** : lire le code actuel de `layout_engine`, `atlas_script`, `text_vert`, `text_frag` via `get_dat_text`
2. **Fix wrapping** : modifier le cache hash + row mapping, tester avec webcam
3. **Multi-size atlas** : vérifier que les 27 tiles s'ajoutent correctement, inspecter `glyph_metrics` 
4. **Hybrid layout** : tester avec webcam — texte flow autour, ASCII grid dedans
5. **Video tint** : vérifier les couleurs dans le shader avec `take_screenshot`
6. **Performance** : `get_performance` pour valider < 5ms total
