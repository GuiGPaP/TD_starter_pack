<!-- session_id: f9a8bf97-3bf4-43cd-a578-95c98346d1b7 -->
# Plan: Fix TDPretext — Performance, Resize Reset, Text Editing

## Context

TDPretext utilise un Web Render TOP (`webrender_flow`) pour afficher du texte qui coule autour d'obstacles (cercles ou bitmap). 3 bugs rapportés :
1. **Latence souris** — decalage entre le mouvement du masque/pointeur et le rendu
2. **Resize reset** — redimensionner revient au 1er template (config + texte reviennent aux defaults HTML)
3. **Pas de modification texte via le comp** — aucun paramètre texte sur `/TDPretext`

---

## Bug 1 : Latence souris

### Cause racine
Deux sources de latence cumulées :
- `mouse_to_webrender` utilise `wr.interactMouse(u, v)` → passe par le pipeline événementiel Chromium (IPC), alors que `window.setPointer(x, y)` existe déjà dans le HTML mais n'est PAS utilisé
- `lerp(current, target, 0.1)` dans `flow_page` → seulement 10% de convergence par frame = ~23 frames (380ms) pour atteindre 90% de la cible

### Fix

**A. `/TDPretext/mouse_to_webrender`** — utiliser `executeJavaScript` + `setPointer()` pour la position, garder `interactMouse` uniquement pour les clics :

```python
def onValueChange(channel, sampleIndex, val, prev):
    global _prev_left
    panel = op('panel1')
    wr = op('webrender_flow')
    if wr is None or wr.width == 0 or wr.height == 0:
        return
    try:
        u = panel['u'].eval()
        v = panel['v'].eval()
        left_down = bool(panel['lselect'].eval())
        px = u * wr.width
        py = (1.0 - v) * wr.height  # TD v=0 en bas, HTML y=0 en haut
        wr.executeJavaScript(f'window.setPointer({px},{py})')
        if left_down and not _prev_left:
            wr.interactMouse(u, v, leftClick=1, left=True)
        elif not left_down and _prev_left:
            wr.interactMouse(u, v, left=False)
        _prev_left = left_down
    except:
        pass
```

**B. `/TDPretext/flow_page`** — augmenter le lerp de 0.1 à 0.5 (2 lignes dans `render()`) :
```javascript
pointerVisualX = lerp(pointerVisualX, pointerX, 0.5);
pointerVisualY = lerp(pointerVisualY, pointerY, 0.5);
```
(0.5 → 90% en ~3 frames = 50ms. Reste un léger smoothing organique.)

---

## Bug 2 : Resize reset au 1er template

### Cause racine
- `webrender_flow` a `outputresolution: parpanel` → quand le conteneur resize, la résolution change → Chromium reload la page depuis le DAT
- Le JS state reset : `CFG` revient aux defaults hardcodés, `text` revient au texte par défaut
- Aucun mécanisme pour re-pousser config + texte après un reload

### Fix

**Modifier `/TDPretext/obstacle_bridge`** — ajouter une détection de reload via tracking `(width, height, dat)` :

```python
"""
Frame-end bridge: bitmap obstacles + page-reload detection.
"""
import base64
import json

_INTERVAL = 1
_CHUNK = 6000

def onFrameEnd(frame):
    _check_page_reload()
    _send_bitmap_obstacle(frame)

def _check_page_reload():
    wr = op('webrender_flow')
    if wr is None or wr.width == 0 or wr.height == 0:
        return
    comp = op('/TDPretext')
    current_key = (wr.width, wr.height, str(wr.par.dat))
    stored_key = comp.fetch('_wr_state_key', None)
    if current_key != stored_key:
        comp.store('_wr_state_key', current_key)
        if stored_key is not None:
            # Page va reloader — attendre le chargement ESM puis re-push
            run("args[0]()", _do_repush, delayFrames=90)

def _do_repush():
    op('par_to_webrender').module._push_config()
    op('inject_text').module._inject_text()

def _send_bitmap_obstacle(frame):
    # ... code existant inchangé ...
```

- `comp.store/fetch` pour tracker l'état précédent
- `delayFrames=90` (~1.5s) laisse le temps au ESM de charger
- Réutilise `_push_config()` et `_inject_text()` via `.module` (pas de duplication)

---

## Bug 3 : Pas de modification texte via le comp

### Cause racine
Aucun custom parameter `Text` sur `/TDPretext`. Le texte est uniquement dans le DAT `text_source`, pas exposé dans l'UI du comp.

### Fix

**A. Ajouter un paramètre `Textcontent` (String)** sur la page custom de `/TDPretext`

**B. `/TDPretext/par_to_webrender`** — ajouter `Textcontent` aux pars surveillés + handler :
```python
def onValueChange(par, prev):
    comp = op('/TDPretext')
    if par.name == 'Textcontent':
        new_text = str(par.eval())
        if new_text and new_text != op('text_source').text:
            op('text_source').text = new_text
        return
    # ... reste du code existant ...
```

**C. `/TDPretext/inject_text`** — sync inverse `text_source` → `Textcontent` :
```python
def onTableChange(dat, prevDAT, info):
    comp = op('/TDPretext')
    current_dat = op('text_source').text
    if hasattr(comp.par, 'Textcontent') and str(comp.par.Textcontent.eval()) != current_dat:
        comp.par.Textcontent.val = current_dat
    _inject_text()
```

---

## Ordre d'implémentation

1. **Bug 1** (latence) — 2 opérateurs, autonome, testable immédiatement
2. **Bug 3** (texte) — autonome, permet de mieux tester Bug 2
3. **Bug 2** (resize) — dépend de Bug 3 pour re-pousser le bon texte

## Vérification

- **Bug 1** : bouger la souris sur le viewer → tracking quasi-instantané (< 100ms)
- **Bug 3** : modifier `Textcontent` dans les params du comp → texte se met à jour dans le webrender
- **Bug 2** : redimensionner `/TDPretext` → config et texte survivent après ~2s

## Risques

- **Inversion Y** : `py = (1.0 - v) * wr.height` suppose que `v=0` est en bas dans le panelCHOP. À vérifier — si inversé, retirer le `1.0 -`
- **Délai ESM** : 90 frames peut être court sur réseau lent. Alternative : polling dans `onFrameEnd` avec un compteur décrémentant
- **`run()` dans executeDAT** : si `run("args[0]()", fn, delayFrames=N)` ne fonctionne pas dans ce contexte, utiliser un compteur stocké via `comp.store`
