<!-- session_id: 499a8431-6c09-4e65-afe8-7b867ebd5ba9 -->
# Plan: Nouveau preset "displaced" pour TDPretext

## Context

Le réseau TDPretext a **deux chaînes parallèles** :

1. **Chaîne texte** : `webrender_flow` (HTML Pretext) → `null_flow`
2. **Chaîne vidéo** : `videodevin1` (webcam) → `nvbackground1` (bg removal NVIDIA) → `thresh1` → `multiply1` → `null_mask` (silhouette)

L'objectif est d'utiliser la silhouette vidéo comme **obstacle bitmap** envoyé à Pretext côté JS, pour que le texte coule autour de la forme captée par la webcam — **entièrement dans le canvas HTML**, sans opérateur de displacement TD.

## Approche

Le preset "displaced" active le mode **bitmap obstacle** : `obstacle_bridge` lit `null_mask` frame par frame, extrait les spans opaques par ligne, et les envoie au canvas via `window.updateObstacleSpans()`. Côté JS, Pretext utilise ces spans pour exclure des zones du layout texte — le texte coule autour de la silhouette.

## Architecture du flux

```
videodevin1 (webcam)
    → nvbackground1 (NVIDIA BG removal)
    → thresh1 (seuil alpha)
    → multiply1
    → null_mask ─── obstacle_bridge (Execute DAT, onFrameEnd) ──→ executeJavaScript
                         │                                           │
                         │  numpyArray() → scan rows → spans         │
                         │  normalisés [startX, endX] par ligne      │
                         │                                           ▼
                         │                              window.updateObstacleSpans(rows)
                         │                                           │
text_source ─→ inject_text ──→ webrender_flow ◄──────────────────────┘
                                    │             Pretext layout exclut les spans
                                    ▼
                                null_flow (sortie)
```

## Mécanisme détaillé

### obstacle_bridge (Execute DAT)
- **Actif uniquement** quand `Preset == 'displaced'` (guard en début de `_send_obstacle_spans`)
- Lit `null_mask.numpyArray()` — matrice RGBA du masque silhouette
- Pour chaque ligne (Y flippé car numpyArray row 0 = haut, TD texture Y=0 = bas) :
  - Scanne le canal alpha, détecte les runs contigus où `alpha > 0.25`
  - Produit des spans normalisés `[startX/w, endX/w]`
- Envoie le tableau JSON de spans via `wr.executeJavaScript('window.updateObstacleSpans(...)')`
- Gère aussi la détection de reload page (re-push config + texte après 90 frames)

### par_to_webrender (Parameter Execute DAT)
- `BITMAP_PRESETS = {'displaced'}` — identifie les presets en mode bitmap
- Quand preset = displaced, `_push_config()` envoie `bitmapObstacle: true` et `bitmapMargin: 12` au JS
- Désactive les obstacles circulaires (`Pointerradius: 0`, `Numobstacles: 0`, `Orbopacity: 0`)

### Preset "displaced" — valeurs
```python
'displaced': {
    'Fontfamily': 'Segoe UI',
    'Fontsize': 28,
    'Fontweight': '400',
    'Lineheight': 42,
    'Textcolorr': 0.95, 'Textcolorg': 0.95, 'Textcolorb': 0.98, 'Textcolora': 0.92,
    'Bgcolorr': 0.0, 'Bgcolorg': 0.0, 'Bgcolorb': 0.0,
    'Padding': 40,
    'Pointerradius': 0,
    'Minsegwidth': 80,
    'Numobstacles': 0,
    'Obstacleradius': 0,
    'Shadowblur': 8,
    'Orbopacity': 0,
},
```
Fond noir, texte blanc quasi-opaque, aucun obstacle circulaire/orb — la silhouette bitmap fait le travail.

## Opérateurs impliqués (vérifiés via MCP)

| Opérateur | Type | Rôle |
|-----------|------|------|
| `/TDPretext` | containerCOMP | Custom pars (Preset, Font*, Textcolor*, etc.) |
| `/TDPretext/webrender_flow` | webrenderTOP | Rendu HTML Pretext |
| `/TDPretext/null_flow` | nullTOP | Sortie texte rendu |
| `/TDPretext/null_mask` | nullTOP | Sortie silhouette vidéo |
| `/TDPretext/obstacle_bridge` | executeDAT | Envoie spans bitmap de null_mask au JS |
| `/TDPretext/par_to_webrender` | parameterexecuteDAT | Push config/presets au JS |
| `/TDPretext/inject_text` | datexecuteDAT | Injecte texte dans le canvas |
| `/TDPretext/mouse_to_webrender` | chopexecuteDAT | Envoie position souris au JS |
| `/TDPretext/videodevin1` | videodeviceinTOP | Webcam |
| `/TDPretext/nvbackground1` | nvidiabackgroundTOP | BG removal |
| `/TDPretext/thresh1` | thresholdTOP | Seuil alpha |
| `/TDPretext/multiply1` | multiplyTOP | Silhouette × vidéo |

## Vérification

1. Preset "Displaced" sélectionné → style texte (fond noir, pas d'orbs, shadow blur 8)
2. `obstacle_bridge` envoie les spans de `null_mask` au canvas chaque frame
3. Le texte coule autour de la silhouette webcam — visible dans `null_flow`
4. Les autres presets (editorial, poster, kinetic, textstring) ne sont pas affectés
5. **Aucun Displace TOP** — tout le displacement est côté JS/Pretext via `buildSegments()`
