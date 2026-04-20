# Web Render TOP — Input Pattern for Snappy Mouse Interaction

Applies when a TDPretext COMP wraps Pretext.js inside a Web Render TOP (vs the pure-TD native pipeline). The pattern below produces sub-frame perceived latency for pointer movement and clicks on editorial/poster/kinetic presets.

## Canonical Parameter Config

| Parameter | Value | Rationale |
|---|---|---|
| `maxrenderrate` | **60** | Match TD cook rate. Higher values (120, 240) empile des stale frames que TD échantillonne en retard — contre-intuitif, confirmé forum Derivative. |
| `numbuffers` | 3 (min clamp) | Cannot go below on 2025 build. Lower = less buffering lag but more hitches. |
| `sharedtexture` | **False** | D3D11 shared texture fuit des buffers avec `executeJavaScript` répété (lag cumulatif sur Windows). `shared memory` (default avec sharedtexture off) est stable dans le temps. Confirmé 2026-04-15. |
| `alwayscook` | True | Ensures every frame gets a cook cycle. |

## Two-Path Input Pattern

Position and clicks go through **different** Web Render TOP APIs to keep Chromium's input queue clean.

### Position — `executeJavaScript('window.setPointer(x, y)')`

Called every frame from a chopexecuteDAT watching `panel1` (u, v, rollover, lselect). The JS function mutates page state directly without dispatching a mouse event.

```python
# mouse_to_webrender (chopexecuteDAT, chop=panel1)
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

		# Position: direct JS state mutation (keeps Chromium input queue empty)
		px = u * wr.width
		py = (1.0 - v) * wr.height
		wr.executeJavaScript(
			f'if(window.setPointer)window.setPointer({px:.1f},{py:.1f})'
		)

		# Clicks: interactMouse ONLY on lselect transitions
		if left_down and not _prev_left:
			wr.interactMouse(u, v, leftClick=1, left=True)
		elif not left_down and _prev_left:
			wr.interactMouse(u, v, left=False)

		_prev_left = left_down
	except:
		pass
```

### Clicks — `interactMouse()` only on transitions

Never put `interactMouse` in an `else` branch that fires every frame. Spamming mousemove events floods Chromium's input queue and **delays the dispatch of the next real click**, making click response feel laggy.

### HTML-side hook

Each page consumed by the Web Render TOP must expose `window.setPointer`:

```js
// flow_page (editorial/poster/kinetic/displaced)
window.setPointer = function(x, y) {
  pointerX = x;
  pointerY = y;
};

// textstring_page (Verlet drag sim)
window.setPointer = function(x, y) {
  mouseX = x; mouseY = y;
  if (dragIdx >= 0) {
    letters[dragIdx].x = mouseX - dragOX;
    letters[dragIdx].y = mouseY - dragOY;
    letters[dragIdx].px = letters[dragIdx].x;
    letters[dragIdx].py = letters[dragIdx].y;
  }
};
```

## Anti-Patterns

- ❌ `maxrenderrate > 60` — increases visible latency, never decreases it
- ❌ `wr.interactMouse(u, v, left=left_down)` every frame — floods input queue, delays clicks
- ❌ `wr.executeJavaScript(...)` for clicks on transitions — queues behind position updates; use `interactMouse` instead
- ❌ Pushing pointer from `onFrameEnd` of an Execute DAT — adds ~1 frame of event propagation latency vs `onValueChange` of chopexecuteDAT
- ❌ Toggling `sharedtexture` to test — restarts Chromium process, invalidates `window.*` state
- ❌ Laisser `sharedtexture` à `True` par défaut (la valeur UI) sur Windows — fuit en session longue

## Known Latency Ceiling

Even with the canonical config, **Chromium paint → compositor → GPU-shared-texture → TD sampling** has an irreducible ~2-3 frames of latency. For truly zero-frame response (e.g. matching controller input in 1:1 fashion), use the native pipeline `/TDPretextNative` which has 0-frame latency (synchronous Python layout + GPU instancing).

## Bitmap Obstacle Injection — Separate Concern

The note « ~22 frames latency » in `SKILL.md` Comparison table refers specifically to the `_send_obstacle_spans` → `executeJavaScript('updateObstacleSpans(json)')` path used by the `displaced` preset. That pipeline has: numpy mask extraction (TD Python) → JSON serialize → JS dispatch (Chromium main thread) → canvas recompute obstacles → repaint → GPU copy. Not related to pointer tracking.

## Debug / Measure

```python
# Live check
wr = op('webrender_flow')
md = op('mouse_to_webrender')
print('maxrenderrate:', wr.par.maxrenderrate.val)           # should be 60
print('numbuffers:', wr.par.numbuffers.val)                 # 3 (min clamp)
print('sharedtexture:', wr.par.sharedtexture.val)           # False
print('mouse_dat cookTime:', md.cookTime)                   # should be <1ms
```

## Config Injection — Baked-In Pattern (vs live updateConfig)

**Issue with live `executeJavaScript('updateConfig(cfg)')`** : chaque param change enfile un call JS sur le main thread Chromium. Sur session longue, même avec `sharedtexture=False`, le pattern reste fragile aux regressions Chromium (event loop backpressure sur cache.clear + re-layout). Pour isoler complètement le param lifecycle du runtime Chromium :

### Architecture baked-in (recommandée pour TDPretext_web)

```
flow_page_template  (textDAT, HTML avec /*__TDCONFIG__*/ placeholder)
    │
    │  par_to_webrender._regenerate_and_reload():
    │    reads template + builds config dict + JSON.stringify + replace placeholders
    │    writes to flow_page DAT
    │    pulses wr.par.reload (if currently on flow_page)
    ▼
flow_page  (textDAT consommé par wr.par.dat — regénéré à chaque param change)
    │  const CFG = { ...baked values... };  ← inline, pas d'updateConfig call
    ▼
webrender_flow  (Chromium recharge page fresh à chaque regen)
```

### Debouncing

Pendant un drag de slider, les `onValueChange` appellent `_schedule_regen()` qui utilise `run(..., delayFrames=15)` + garde `absTime.frame` pour coalescer : plusieurs changements dans la même fenêtre de 250ms → un seul regen+reload en fin de drag.

### Template placeholders

- `/*__TDCONFIG__*/` → JSON de l'objet config entier (15 champs)
- `/*__TDTEXT__*/` → JSON du contenu texte (`text_source.text`)
- `__BG_CSS__` → valeur `rgba(...)` du bgColor, inline dans `<style>body { background: ... }` pour éviter le flash noir au reload

### Fichiers impliqués (TDPretext_web)

| Chemin | Rôle |
|---|---|
| `flow_page_template` (textDAT) | Source of truth, jamais modifié au runtime |
| `flow_page` (textDAT) | Généré par Python, consommé par `wr.par.dat` |
| `par_to_webrender` (parexecDAT) | Génère flow_page + pulse reload (debounced) |
| `obstacle_bridge` (executeDAT) | `_do_repush` appelle `_regenerate_and_reload` (pas `_push_config`) |

### Trade-offs

- ✅ Chaque reload = fresh Chromium state, pas d'accumulation d'event loop
- ✅ Config = single source of truth (les pars du COMP), pas de désync JS↔Python
- ✅ Slider drag fluide grâce au debounce (1 reload en fin, pas pendant)
- ❌ Flash visuel ~100ms au reload (minimisé par `__BG_CSS__` inline)
- ❌ Plus complexe à déboguer (template + placeholders + debounce)

### Quand NE PAS baker

- Données haute fréquence qui doivent être live sans reload (mouse position, obstacle masks) → passer par `executeJavaScript('window.setPointer/updateObstacleSpans')` comme avant
- Pages qui n'exposent pas de config (`textstring_page` reste standalone)

## Source

Forum thread "Bad Performance of Webrender Top" (Derivative staff response): `maxrenderrate=60` is the canonical value. Higher rates accumulate speculative frames. Confirmé empiriquement sur TDPretext_web 2026-04-15 :
- Perception « latency » (maxrenderrate=240, sharedtexture=True) → « instantané » (maxrenderrate=60, sharedtexture=False) sur editorial/poster/kinetic.
- Refactor baked-in adopté comme architecture cible pour robustesse long terme.
