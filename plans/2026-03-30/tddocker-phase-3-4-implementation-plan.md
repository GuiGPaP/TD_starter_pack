<!-- session_id: 84e6d814-9413-4da1-be34-591ceb341b4a -->
# TDDocker — Phase 3 & 4 Implementation Plan

## Context

TDDocker Phase 1 (watchdog + compose core) and Phase 2 (TD COMP architecture + status polling) sont terminees. Les extensions container creent deja les operateurs WebSocket/OSC/NDI mais sans logique de routage. Il y a aussi un gap Phase 2 : le toggle NDI ne regenere pas l'overlay.

**Objectif :** Completer le data bridge WebSocket et le wiring NDI pour avoir un V1 fonctionnel end-to-end.

---

## Step 1 — Fix NDI overlay regeneration (Gap Phase 2)

**Probleme :** `_notify_ndi_enabled()` dans `td_container_ext.py:172` set le flag `ndi_enabled` mais l'orchestrateur ne regenere pas l'overlay ni ne relance compose.

**Fichiers :**
- `python/td_docker/td_docker_ext.py` — ajouter `_regenerate_overlay()` + `NotifyNdiChanged()`
- `python/td_docker/td_container_ext.py` — modifier `_notify_ndi_enabled()` pour appeler `NotifyNdiChanged`
- `python/td_docker/td_container_ext.py` — ajouter `_notify_ndi_enabled(False)` au debut de `_configure_video_transport()` quand transport != "ndi"

**Implementation :**

`td_docker_ext.py` — nouvelle methode publique :
```python
def NotifyNdiChanged(self, svc_name: str, enabled: bool) -> None:
    if svc_name in self._service_configs:
        self._service_configs[svc_name].ndi_enabled = enabled
        self._regenerate_overlay()

def _regenerate_overlay(self) -> None:
    compose_path = self._get_compose_path()
    if not compose_path or not self._overlay_path:
        return
    config = OverlayConfig(session_id=self._session_id, service_overrides=self._service_configs)
    try:
        self._overlay_path = write_overlay(compose_path, config, output_dir=self._compose_dir)
    except ValueError as e:
        self._log(f"ERROR regenerating overlay: {e}")
        return
    result = compose_up(compose_path, self._overlay_path, self._session_id)
    if result.ok:
        self._log("Overlay regenerated and applied")
    else:
        self._log(f"WARNING: overlay reapply failed: {result.stderr}")
```

`td_container_ext.py` — `_notify_ndi_enabled()` appelle le nouveau method :
```python
def _notify_ndi_enabled(self, enabled: bool) -> None:
    orchestrator = self.ownerComp.parent(2)
    has_ext = hasattr(orchestrator, "ext") and hasattr(orchestrator.ext, "TDDockerExt")
    if orchestrator and has_ext:
        svc_name = self.ownerComp.par.Servicename.eval() if hasattr(self.ownerComp.par, "Servicename") else ""
        if svc_name:
            orchestrator.ext.TDDockerExt.NotifyNdiChanged(svc_name, enabled)
```

`_configure_video_transport()` — notifier quand on quitte NDI :
```python
def _configure_video_transport(self) -> None:
    transport = self.ownerComp.par.Videotransport.eval() if hasattr(...) else "none"
    if transport != "ndi":
        self._notify_ndi_enabled(False)
    # ... reste du code existant
```

**Tests :** `python/tests/test_ndi_regen.py` (~6 tests) — mock write_overlay + compose_up, verifier regeneration on toggle on/off, skip quand no compose path.

---

## Step 2 — WebSocket data bridge (Phase 3)

**Fichiers :**
- `python/td_docker/transports/websocket.py` (NOUVEAU) — pure Python, testable sans TD
- `python/td_docker/transports/__init__.py` — re-export
- `python/td_docker/td_container_ext.py` — wiring callback script + data_in DAT

### 2a. `transports/websocket.py` (~90 lignes)

Contenu :
- `ConnectionState` enum : `disconnected`, `connected`, `reconnecting`
- `WebSocketBridge` class :
  - `on_connect() -> str` — set state, reset attempts, return log msg
  - `on_disconnect() -> tuple[str, float | None]` — set state, return (msg, reconnect_delay)
  - `parse_message(raw: str) -> list[dict[str, str]]` — JSON object -> kv rows, JSON array -> rows, fallback -> `{"message": raw}`
  - `_next_reconnect_delay() -> float | None` — exponential backoff 1/2/4/8/16s, None apres 5 attempts
  - `reset()` — reinit state
- `CALLBACK_SCRIPT` string constant — script TD injecte dans un textDAT :
  - `onConnect(dat)` -> bridge.on_connect(), log
  - `onDisconnect(dat)` -> bridge.on_disconnect(), reconnect via `run()` avec delayFrames
  - `onReceiveText(dat, rowIndex, message, bytes)` -> bridge.parse_message(), append rows to data_in tableDAT

### 2b. `td_container_ext.py` modifications

Branche `websocket` dans `_configure_data_transport()` :
```python
if transport == "websocket":
    ws = self.ownerComp.create("websocketDAT", "websocket_dat")
    port = ...
    if port > 0:
        ws.par.port = port
    # data_in tableDAT for parsed messages
    data_in = self.ownerComp.op("data_in") or self.ownerComp.create("tableDAT", "data_in")
    # callback script
    from td_docker.transports.websocket import CALLBACK_SCRIPT
    cb = self.ownerComp.op("ws_callbacks") or self.ownerComp.create("textDAT", "ws_callbacks")
    cb.text = CALLBACK_SCRIPT
    ws.par.callbacks = cb
    self._log(f"WebSocket transport configured on port {port}")
```

Cleanup list elargie : `("websocket_dat", "osc_in", "osc_out", "data_in", "ws_callbacks")`

### 2c. `transports/__init__.py`

```python
from td_docker.transports.websocket import WebSocketBridge
```

**Tests :** `python/tests/test_websocket_bridge.py` (~15 tests)
- `TestParseMessage` : JSON object, JSON array, plain text, empty string, nested JSON
- `TestConnectionState` : initial state, connect, disconnect, backoff increments, max attempts, reset
- `TestCallbackScript` : `compile(CALLBACK_SCRIPT)` valide

---

## Step 3 — Mise a jour docs et tests finaux

- `TDDocker/CLAUDE.md` — ajouter section WebSocket bridge + callback pattern
- `TDDocker/README.md` — mettre a jour sections Data Transport et NDI
- Run full `python -m pytest python/tests/ -v` + `ruff check` + `pyright`

---

## Ordre d'implementation

| # | Quoi | Fichiers | Tests |
|---|------|----------|-------|
| 1 | NDI overlay regen | `td_docker_ext.py`, `td_container_ext.py` | `test_ndi_regen.py` (6) |
| 2 | WebSocket bridge | `transports/websocket.py` (new), `transports/__init__.py`, `td_container_ext.py` | `test_websocket_bridge.py` (15) |
| 3 | Docs update | `CLAUDE.md`, `README.md` | — |

**Total : ~57 tests (36 existants + 21 nouveaux)**

---

## Verification

1. `cd TDDocker && python -m pytest python/tests/ -v` — tous les tests passent
2. `ruff check python/` — pas d'erreurs lint
3. `pyright` — pas d'erreurs type (si configure)
4. Integration manuelle dans TD : Load `test-compose.yml` -> Up -> toggle WebSocket sur un service -> verifier data_in recoit des messages -> toggle NDI -> verifier overlay regenere avec host mode -> Down
