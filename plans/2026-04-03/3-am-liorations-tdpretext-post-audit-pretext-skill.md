<!-- session_id: 783dc15b-9c9d-4893-9ea9-dc58c8d22242 -->
# Plan : 3 améliorations TDPretext post-audit Pretext skill

## Contexte

Audit live du réseau TDPretext avec le skill Pretext (yaniv-golan). Le projet est conforme aux 7 gotchas critiques. 3 améliorations identifiées pour la perf, la fiabilité et l'hygiène.

---

## 1. Séparer mouvement / clicks dans `mouse_to_webrender`

**Problème :** `interactMouse(u, v)` est utilisé pour tout (mouvement + clicks). C'est un IPC Chromium lourd. Le HTML expose déjà `window.setPointer(x, y)` qui est un appel JS direct, plus rapide pour le mouvement continu.

**Fichier :** textDAT `/TDPretext/mouse_to_webrender` (via MCP `set_dat_text`)

**Changement :**
- Mouvement pur (pas de changement de click) : `executeJavaScript(f'setPointer({px},{py})')` avec conversion coordonnées `u,v` -> pixels (`px = u * wr.width`, `py = (1-v) * wr.height`)
- Click down/up : garder `interactMouse()` pour ces événements uniquement
- Cela réduit les appels IPC lourds au seul moment des clicks

**Code cible :**
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

        if left_down != _prev_left:
            # Click state changed -> use interactMouse for the event
            if left_down:
                wr.interactMouse(u, v, leftClick=1, left=True)
            else:
                wr.interactMouse(u, v, left=False)
            _prev_left = left_down
        else:
            # Pure movement -> fast JS injection
            px = u * wr.width
            py = (1.0 - v) * wr.height
            wr.executeJavaScript(f'if(window.setPointer)window.setPointer({px},{py})')
    except:
        pass
```

---

## 2. Remplacer `delayFrames=90` par polling sur `pretextReady`

**Problème :** `obstacle_bridge._check_page_reload()` attend 90 frames (~1.5s) après un reload pour re-push config. C'est un magic number fragile. Si le chargement ESM est plus lent (réseau, CDN), ça casse silencieusement. Si c'est plus rapide, on attend pour rien.

**Fichier :** textDAT `/TDPretext/obstacle_bridge` (via MCP `set_dat_text`)

**Changement :** Remplacer `run("args[0]()", _do_repush, delayFrames=90)` par une boucle de polling qui vérifie `window.pretextReady` via `executeJavaScript` avec callback, retries toutes les 10 frames, max 300 frames (5s).

**Code cible :**
```python
def _wait_and_repush(attempt=0):
    if attempt > 30:  # 30 * 10 frames = 300 frames = ~5s timeout
        return
    wr = op('webrender_flow')
    if wr is None:
        return
    try:
        # Check if pretextReady is true
        result = wr.executeJavaScript('window.pretextReady === true')
        if result == 'true' or result is True:
            _do_repush()
            return
    except:
        pass
    run("args[0](args[1])", _wait_and_repush, attempt + 1, delayFrames=10)
```

Et dans `_check_page_reload`, remplacer :
```python
run("args[0]()", _do_repush, delayFrames=90)
```
par :
```python
run("args[0](0)", _wait_and_repush, delayFrames=10)
```

---

## 3. Synchroniser `web/flow_demo.html` avec le textDAT live

**Problème :** Le fichier `TDpretext/web/flow_demo.html` est une version antérieure (lerp 0.1, pas de bitmap obstacles, pas de `updateConfig`, pas de `setPointer`). Le vrai code est dans le textDAT `flow_page`.

**Fichier :** `TDpretext/web/flow_demo.html`

**Changement :** Écraser le contenu avec le texte extrait du textDAT `/TDPretext/flow_page` (déjà récupéré dans cette conversation). C'est la source de vérité.

---

## Ordre d'exécution

1. **flow_demo.html sync** (le plus simple, pas de risque)
2. **mouse_to_webrender** (perf, testable visuellement)
3. **obstacle_bridge polling** (fiabilité, testable en changeant de preset)

## Vérification

- **mouse_to_webrender :** Ouvrir TDPretext, bouger la souris sur le viewer — le texte doit réagir au curseur avec la même fluidité (ou mieux). Tester un click si le preset textstring est actif.
- **obstacle_bridge :** Changer de preset (editorial -> poster -> displaced), vérifier que config + texte se re-appliquent. Redimensionner le Web Render TOP, vérifier le re-push.
- **flow_demo.html :** `diff` entre le fichier et le textDAT — doit être identique.
