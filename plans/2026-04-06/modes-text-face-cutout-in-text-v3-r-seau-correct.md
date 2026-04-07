<!-- session_id: c6293e83-abf6-40c6-9c51-a544e4e3e759 -->
# Plan : Modes Text Face & Cutout in Text (v3 — réseau correct)

## Contexte

Fixes de base FAITS : justify tous segments, math.ceil atlas, dither=false.

## Réseau actuel (vérifié)

```
videodevin1 → nvbackground1 → switch1(cam/movie) → mask_alpha → thresh1 → res_obstacle → null_mask
moviefilein1 → transform1 →┘                                       │                         ↓
                           └→ switch2(cam/movie) → color ─┐        │                    select_mask
videodevin1 ───────────────┘                               ↓       │                         ↓
                                                      multiply1 ←──┘                    blur_mask → invert_mask (libre)
                                                      (thresh × color)
                                                           ↓
                                                      color_mask → level1 (brightness 0.37)
                                                                       ↓
render_text → null_flow → over1 (in0=texte, in1=silhouette colorée)
```

**Rôles :**
- `switch1/2` : sélection webcam vs moviefilein (pas des modes)
- `multiply1` : silhouette thresholdée × vidéo couleur = silhouette colorée
- `level1` : ajuste la luminosité de la silhouette colorée
- `over1` : silhouette colorée PAR DESSUS le texte
- `select_mask → blur_mask → invert_mask` : existent, invert_mask libre en sortie

---

## Mode Displaced (actuel — pas de changement)

Texte justified autour de la silhouette + silhouette colorée par dessus. Fonctionne.

---

## Mode Cutout

**Objectif :** texte dense plein écran, la vidéo de la personne découpe le texte.

**Approche :** On ne touche PAS au pipeline mask/multiply existant. On ajoute un chemin parallèle qui utilise `invert_mask` (déjà connecté à blur_mask, sortie libre).

**Modifications réseau (user) :**
1. Créer `multiplyTOP` `text_cutout` : in0=`render_text`, in1=`invert_mask` → texte avec trou
2. Créer `overTOP` `cutout_comp` : in0=`color_mask`, in1=`text_cutout` → vidéo dans le trou, texte autour
3. Créer `switchTOP` `output_switch` : in0=`over1` (displaced), in1=`cutout_comp` (cutout)
4. Reconnecter `null_flow` : déconnecter de `over1`, connecter à `output_switch` en sortie
5. Actuellement `null_flow` est input de `over1` — il faut interposer : `render_text → over1.in0` directement (pas via null_flow)

**Hmm, problème :** `null_flow` est actuellement entre `render_text` et `over1`. Si on le déplace en sortie finale, il faut réorganiser.

**Approche simplifiée — garder null_flow en sortie :**
1. Déconnecter `null_flow` de `render_text`
2. Créer `switchTOP` `output_switch`
3. `render_text → over1.in0` (connexion directe, remplace null_flow)
4. `output_switch` : in0=`over1` (displaced), in1=`cutout_comp` (cutout)
5. `output_switch → null_flow`

**Mieux — utiliser `over1` pour les deux modes avec des inputs switchés :**

En fait, pour le cutout, on veut vidéo colorée DANS le trou du texte. C'est exactement :
- `over1.in0` = texte avec trou (text_cutout)
- `over1.in1` = silhouette colorée (level1)
...ce qui est juste l'inverse du mode displaced !

**Approche la plus simple — switcher les inputs de over1 :**

Non, c'est fragile. Utilisons un switch en sortie.

**Plan final pour Cutout (réseau user) :**
1. Reconnecter `over1.in0` : `render_text` directement (au lieu de via null_flow)
2. Créer `multiplyTOP` `text_cutout` : in0=`render_text`, in1=`invert_mask`
3. Créer `overTOP` `cutout_comp` : in0=`text_cutout`, in1=`level1`
4. Créer `switchTOP` `output_switch` : in0=`over1`, in1=`cutout_comp`
5. `output_switch → null_flow`
6. Expression sur `output_switch.par.index` : `{'cutout':1}.get(parent().par.Preset.eval(), 0)`

**Code (Claude) :**
- `layout_engine` : mode `cutout` = `NOBS_PRESETS`, texte dense justified plein écran sans obstacle

---

## Mode TextFace

**Objectif :** texte uniquement dans la silhouette, coloré par les pixels vidéo.

**Pas de changement réseau nécessaire.** Tout se fait dans :
1. `layout_engine` : mode `textface` → texte uniquement DANS les spans de la personne (inverse de displaced)
2. `text_frag` shader : sampler la vidéo à la position du fragment, luminance → alpha

**Code (Claude) :**

### layout_engine — `_build_segments_inside()`
```python
INSIDE_PRESETS = {'textface'}

def _build_segments_inside(by, W, H, spans, inner_margin, min_seg):
    """Segments INSIDE the person (inverse of bitmap subtract)."""
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

### text_frag — video sampling
```glsl
uniform sampler2D sVideo;
uniform int uMode;       // 0=normal, 1=textface
uniform vec2 uResolution;

// In main(), after atlas lookup:
if (uMode == 1) {
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    screenUV.x = 1.0 - screenUV.x;
    vec3 videoRGB = texture(sVideo, screenUV).rgb;
    float lum = dot(videoRGB, vec3(0.299, 0.587, 0.114));
    float lumAlpha = pow(1.0 - lum, 0.6);
    float alpha = max(0.05, lumAlpha * glyphAlpha);
    fragColor = TDOutputSwizzle(vec4(videoRGB * 0.4, alpha));
}
```

**Paramètres text_glsl MAT (user) :**
- Sampler 2 : `sVideo` → `/TDPretextNative/color` (vidéo couleur, pas null1)
- Vec 2 : `uMode` → expression `1 if parent().par.Preset == 'textface' else 0`
- Vec 3 : `uResolution` → `1920, 1080`

**Note :** On pointe sVideo vers `color` (pas `null1`) car `color` est déjà la vidéo couleur switchée (cam ou movie) via `switch2`.

---

## Mode TextFace — compositing

En mode textface, `over1` reçoit toujours `render_text` en in0 et `level1` en in1. Mais `level1` montre la silhouette colorée pleine — on ne veut pas ça par dessus le textface. 

**Solution :** L'`output_switch` route vers `render_text` directement pour textface (pas besoin de over1).

**output_switch :**
- in0 = `over1` (displaced — texte + silhouette par dessus)
- in1 = `cutout_comp` (cutout — texte troué + vidéo dedans)
- in2 = `render_text` (textface — juste le texte coloré par la vidéo, fond noir)

Expression : `{'cutout':1, 'textface':2}.get(parent().par.Preset.eval(), 0)`

---

## Résumé des actions

### User (réseau TD) :
1. Reconnecter `over1.in0` ← `render_text` (au lieu de null_flow)
2. Créer `multiplyTOP` `text_cutout` : in0=`render_text`, in1=`invert_mask`
3. Créer `overTOP` `cutout_comp` : in0=`text_cutout`, in1=`level1`
4. Créer `switchTOP` `output_switch` : in0=`over1`, in1=`cutout_comp`, in2=`render_text`
5. Connecter `output_switch → null_flow`
6. Sur `text_glsl` MAT : ajouter sampler `sVideo`→`color`, vec `uMode`, vec `uResolution`
7. Expressions : `output_switch.index`, `text_glsl.vec2valuex` (uMode)

### Claude (code DAT) :
1. `layout_engine` : ajouter INSIDE_PRESETS, NOBS_PRESETS, `_build_segments_inside()`
2. `text_frag` : ajouter mode textface avec video sampling

## Vérification
1. **Displaced :** inchangé — texte justified + silhouette colorée
2. **Cutout :** texte dense, silhouette vidéo visible dans le trou
3. **TextFace :** texte dans la silhouette seulement, coloré par vidéo
4. **Editorial :** texte dense, pas de webcam
5. Switching entre les 4 modes via Preset
