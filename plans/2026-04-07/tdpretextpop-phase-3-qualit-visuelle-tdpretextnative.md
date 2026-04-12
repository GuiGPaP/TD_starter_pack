<!-- session_id: 54fc9980-16ad-4238-b538-a39e8217201e -->
# TDPretextPop — Phase 3: Qualité visuelle = TDPretextNative

## Context

TDPretextPop fonctionne à 60 FPS avec instancing POP, mais la qualité visuelle est faible :
- Glyphes petits et flous dans des tiles 128×128 (beaucoup d'espace vide)
- Pas de UV cropping → la texture mappe sur tout le tile, pas juste le glyphe
- constantMAT sans shader personnalisé → pas de contrôle UV

TDPretextNative utilise : RENDER_SCALE=3, GLSL MAT avec UV cropping, glyph_w_norm/glyph_h_norm.

## Objectif

Obtenir le même rendu que TDPretextNative : texte net, anti-aliasé, espacement proportionnel correct.

## Plan

### Étape 1 : Atlas haute qualité (RENDER_SCALE=3)

Recréer l'atlas avec des glyphes rendus à 3x :
- textTOP : `fontsizex = 64 * 3 = 192` dans un tile de `next_pow2(max_glyph_3x)` (~256×256)
- Chaque slice contient un glyphe centré, rendu à 3x
- Calculer `glyph_w_norm` et `glyph_h_norm` pour chaque glyphe : fraction du tile occupée
- Stocker ces métriques dans `comp.store('_glyph_metrics', {char: (w_norm, h_norm)})`

Script Python pour remplir l'atlas :
```python
for i in range(128):
    ch = chr(max(32, i))
    atlas_text.par.text = ch
    atlas_text.cook(force=True)
    # Mesurer le bounding box du glyphe dans le tile
    glyph_w_norm = glyph_pixel_width / SLICE_W
    glyph_h_norm = glyph_pixel_height / SLICE_H
    # Stocker dans metrics
    atlas_3d.par.replaceindex = i
    atlas_3d.par.replacesinglepulse.pulse()
```

### Étape 2 : GLSL MAT pour UV cropping

Remplacer `constantMAT` par un `glslMAT` avec :

**Vertex shader** : passe les métriques de glyphe au fragment shader
```glsl
// Lit glyph_w_norm et glyph_h_norm depuis les instance attributes
out float vGlyphW;
out float vGlyphH;
out float vSliceW;  // W coordinate pour texture2DArray

void main() {
    // TD standard vertex transform
    vec4 worldPos = TDDeform(P);
    gl_Position = TDWorldToProj(worldPos);
    
    // Pass glyph metrics to fragment
    vGlyphW = TDInstanceTexCoord(0).x;  // glyph_w_norm via instance tex U
    vGlyphH = TDInstanceTexCoord(0).y;  // glyph_h_norm via instance tex V  
    vSliceW = TDInstanceTexCoord(0).z;  // slice index via instance tex W
}
```

**Fragment shader** : crop UVs au bounding box du glyphe
```glsl
uniform sampler2DArray sAtlas;
uniform vec4 uTextColor;
in float vGlyphW;
in float vGlyphH;
in float vSliceW;

void main() {
    vec2 localUV = vUV.st;
    // Crop UV to glyph area within tile
    vec2 atlasUV = localUV * vec2(vGlyphW, vGlyphH);
    // Sample the correct slice
    vec4 texel = texture(sAtlas, vec3(atlasUV, vSliceW));
    float alpha = texel.a;
    if (alpha < 0.01) discard;
    TDAlphaTest(alpha);
    fragColor = TDOutputSwizzle(vec4(uTextColor.rgb * TDInstanceColor().rgb, alpha));
}
```

### Étape 3 : Instance data enrichi

Ajouter `glyph_w_norm` et `glyph_h_norm` comme attributs POP :
- spec_dat : ajouter colonnes `glyph_w` et `glyph_h`
- dattoPOP : ajouter attrs pour glyph_w, glyph_h
- Geometry COMP instancing : mapper vers instance texture coords (U=glyph_w, V=glyph_h, W=slice_index)

### Étape 4 : Espacement correct

Le layout_engine utilise déjà les char widths calibrées. Il faut s'assurer que :
- Les positions tx tiennent compte de la largeur display (char_widths_norm × font_size)
- L'instance scale X = charwidth (la largeur display, pas la taille du tile)
- L'instance scale Y = font_size × char_height_norm (hauteur proportionnelle)

### Étape 5 : Nettoyage

- Supprimer le constantMAT (remplacé par GLSL MAT)
- Supprimer l'obstacle_glsl POP (pas nécessaire avec l'approche instancée)
- Supprimer les ops de debug (_debug_dat, _perf, etc.)

## Vérification

1. Screenshot côte-à-côte TDPretextNative vs TDPretextPop
2. Texte net et anti-aliasé (pas de pixels flous)
3. Espacement proportionnel correct (pas d'espace entre lettres excessif)
4. FPS toujours ≥ 30 en mode bitmap obstacle
5. Tous les caractères visibles (y compris 'i', 'l')
