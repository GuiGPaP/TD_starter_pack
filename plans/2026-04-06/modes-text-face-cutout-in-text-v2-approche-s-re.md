<!-- session_id: c6293e83-abf6-40c6-9c51-a544e4e3e759 -->
# Plan : Modes Text Face & Cutout in Text (v2 — approche sûre)

## Contexte

Les 3 fixes de base sont **FAITS** :
- Justify sur tous les segments (bords écran + bords silhouette)
- `math.ceil` dans l'atlas
- `dither=false` sur render_text

La première tentative d'ajouter les modes textface/cutout a **cassé le réseau** en créant/connectant des opérateurs via MCP. Cette fois, l'approche est plus conservatrice : on ne modifie **que** le contenu des DATs et les paramètres — pas de création/connexion d'opérateurs via script.

Inspiré de [fifteen42/pretext-video](https://github.com/fifteen42/pretext-video) et des tutos POP text instancing (référencés dans `td-pops/references/POP-TEXT-INSTANCING.md`).

---

## Ce qui doit être fait manuellement par l'utilisateur (réseau)

Avant l'implémentation code, l'utilisateur doit créer et connecter ces opérateurs dans TD :

### Pour le mode Cutout :
1. Créer `blurTOP` nommé `blur_mask` → connecter `select_mask` en input
2. Créer `levelTOP` nommé `invert_mask` → connecter `blur_mask` en input, activer `Invert`
3. Connecter `multiply1` : input 0 = `render_text`, input 1 = `invert_mask`
4. Créer `multiplyTOP` nommé `video_masked` → input 0 = `null1` (vidéo), input 1 = `blur_mask`
5. Créer `overTOP` nommé `cutout_over` → input 0 = `video_masked`, input 1 = `multiply1`
6. Connecter `switch1` : input 0 = `over1` (normal), input 1 = `cutout_over`
7. Connecter `null_flow` à `switch1`

### Pour le mode TextFace :
Pas de nouveaux opérateurs nécessaires — tout se fait dans le shader et le layout engine.

### Paramètres à ajouter sur text_glsl MAT :
1. Sampler 2 : `sVideo` → `/TDPretextNative/null1`, filter = linear
2. Vec 2 : `uMode` → expression : `1 if parent().par.Preset == 'textface' else 0`
3. Vec 3 : `uResolution` → `1920, 1080`

### Expression sur switch1 :
`switch1.par.index` expression : `1 if parent().par.Preset == 'cutout' else 0`

---

## Ce que Claude fait (code uniquement — via set_dat_text + update_parameters)

### Étape 1 : Layout engine — ajouter modes textface et cutout

**Fichier :** `/TDPretextNative/layout_engine` (via `set_dat_text`)

Ajouts au code existant :
- `INSIDE_PRESETS = {'textface'}` — texte uniquement DANS la silhouette
- `NOBS_PRESETS = {'cutout', 'editorial'}` — texte dense sans obstacle
- Nouvelle fonction `_build_segments_inside()` — inverse de `_build_segments_bitmap` : retourne les spans "personne" comme segments disponibles (avec inner_margin)
- Dans `onFrameEnd` : router vers la bonne fonction selon le preset

```python
INSIDE_PRESETS = {'textface'}
NOBS_PRESETS = {'cutout', 'editorial'}

def _build_segments_inside(by, W, H, spans, inner_margin, min_seg):
    """Return segments INSIDE the person silhouette."""
    if not spans:
        return []
    num_rows = len(spans)
    row = int(round((by / H) * num_rows))
    if row < 0 or row >= num_rows or spans[row] is None:
        return []
    segs = []
    for sp in spans[row]:
        left = sp[0] * W + inner_margin
        right = sp[1] * W - inner_margin
        if right - left >= min_seg:
            segs.append({'x': left, 'w': right - left})
    return segs
```

### Étape 2 : Fragment shader — mode textface

**Fichier :** `/TDPretextNative/text_frag` (via `set_dat_text`)

```glsl
uniform sampler2D sAtlas;
uniform sampler2D sVideo;
uniform vec4 uTextColor;
uniform int uMode;       // 0 = normal, 1 = textface
uniform vec2 uResolution;

in vec2 vLocalUV;
flat in vec4 vAtlasRect;

layout(location = 0) out vec4 fragColor;

void main()
{
    vec2 atlasUV = vAtlasRect.xy + vLocalUV * vAtlasRect.zw;
    vec4 texel = texture(sAtlas, atlasUV);
    float glyphAlpha = texel.a;
    if (glyphAlpha < 0.01) discard;

    if (uMode == 1) {
        // TextFace: color by video, luminance-based alpha
        vec2 screenUV = gl_FragCoord.xy / uResolution;
        screenUV.x = 1.0 - screenUV.x;  // mirror selfie
        vec3 videoRGB = texture(sVideo, screenUV).rgb;
        float lum = dot(videoRGB, vec3(0.299, 0.587, 0.114));
        float lumAlpha = pow(1.0 - lum, 0.6);
        float alpha = max(0.05, lumAlpha * glyphAlpha);
        fragColor = TDOutputSwizzle(vec4(videoRGB * 0.4, alpha));
    } else {
        float alpha = glyphAlpha * uTextColor.a;
        fragColor = TDOutputSwizzle(vec4(uTextColor.rgb, alpha));
    }
}
```

### Étape 3 : Paramètres render_text et blur_mask

**Via `update_td_node_parameters` :**
- `blur_mask.par.size = 4`, `blur_mask.par.type = 'gaussian'`
- `invert_mask.par.invert = True`

---

## Workflow d'implémentation

1. **L'utilisateur** crée les opérateurs et connexions manuellement dans TD (section ci-dessus)
2. **L'utilisateur** confirme quand c'est prêt
3. **Claude** applique le code (layout_engine, text_frag) via `set_dat_text`
4. **Claude** configure les paramètres via `update_td_node_parameters`
5. **Test** : basculer le preset displaced → cutout → textface → editorial

## Vérification

1. **Cutout :** texte dense plein écran + silhouette vidéo visible avec edges douces
2. **TextFace :** texte uniquement dans la silhouette, coloré par la vidéo (sombre = opaque)
3. **Displaced :** inchangé — texte justified autour de la silhouette
4. **Editorial :** texte dense justified sans webcam
5. **Performance :** < 16ms/frame pour les 4 modes
