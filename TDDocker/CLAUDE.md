# TDDocker — Claude Code Project Instructions

TDDocker manages Docker container lifecycles from TouchDesigner. Users load a standard `docker-compose.yml`, TD generates an overlay file with labels and networking, and provides per-service COMPs with bi-directional data (WebSocket/OSC) and video (NDI) transport. A watchdog process ensures containers are torn down if TD exits unexpectedly.

## File Structure

```
TDDocker/
├── TDDocker.toe                    # Main TD project
├── pyproject.toml                  # pytest, ruff, pyright config
├── test-compose.yml                # Test compose (nginx + echo-server)
├── test-osc-compose.yml            # OSC integration test compose
├── td-overlay.yml                  # GENERATED at runtime — do not commit
├── docker/
│   └── osc-test/                   # OSC echo container for integration tests
│       ├── Dockerfile
│       └── osc_echo.py
└── python/
    ├── td_docker/
    │   ├── __init__.py             # v0.1.0
    │   ├── validator.py            # YAML security deny-list
    │   ├── compose.py              # Overlay gen + docker compose subprocess
    │   ├── watchdog.py             # Detached PID poller + orphan cleanup
    │   ├── docker_status.py        # Docker daemon check + auto-launch
    │   ├── container_manager.py    # Per-container docker CLI wrappers
    │   ├── td_docker_ext.py        # Orchestrator extension
    │   ├── td_container_ext.py     # Container extension
    │   └── transports/
    │       ├── __init__.py         # Re-exports WebSocketBridge, OscBridge
    │       ├── websocket.py        # WS bridge (parse, state, reconnect)
    │       └── osc.py              # OSC bridge (parse address+args)
    └── tests/                      # 85 tests, no Docker required
        ├── test_validator.py       # 19 tests
        ├── test_compose.py         # 8 tests
        ├── test_watchdog.py        # 9 tests
        ├── test_docker_status.py   # 12 tests
        ├── test_ndi_regen.py       # 6 tests
        ├── test_websocket_bridge.py # 18 tests
        └── test_osc_bridge.py      # 13 tests
```

## Dev Commands

```bash
cd TDDocker
python -m pytest python/tests/ -v   # Run tests
ruff check python/                   # Lint
pyright                              # Type check
```

## Critical TD Extension Patterns

### Loading Extensions via Script

The extension DAT must be a **self-contained loader** that sets up `sys.path` before importing:

```python
import sys, os
_python_dir = os.path.join(project.folder, 'python')
if _python_dir not in sys.path:
    sys.path.insert(0, _python_dir)
from td_docker.td_docker_ext import TDDockerExt
```

**DO NOT** use `par.file` / `par.syncfile` for extension DATs — TD evaluates the module at init time and external file sync doesn't resolve package imports.

### ext0object Expression

Must return a **class instance**, not a class:
```
op('/TDDocker/td_docker_ext').module.TDDockerExt(me)    # Correct — instance
op('/TDDocker/td_docker_ext').module.TDDockerExt         # Wrong — class
```

### Menu Parameters

Use `appendStrMenu`, not `appendMenu`. Set menu items via properties after creation:

```python
# CORRECT — use the _add_menu() helper:
_add_menu(page, "State", "State",
    ["created", "running", "paused"], ["Created", "Running", "Paused"], "created")

# WRONG (TD 2025):
page.appendMenu('State', menuNames=[...], menuLabels=[...])
```

### Parameter Routing (parexecDAT)

TD extension promote (`ext0promote=True`) does **not** reliably fire `onParPulse`/`onParValueChange` on dynamically created baseCOMPs. We use a `parameterexecuteDAT` as a bridge:

```python
pe = comp.create("parameterexecuteDAT", "parexec1")
pe.par.op = comp.path
pe.par.pars = "Start Stop Restart Logs Datatransport Videotransport Ndisource"
pe.par.onpulse = True
pe.par.valuechange = True
# Script routes callbacks to the extension:
# def onPulse(par):
#     ext = par.owner.ext.TDContainerExt
#     if ext: ext.onParPulse(par)
```

Both the orchestrator (`/TDDocker`) and each container COMP have a parexecDAT.

### Container Extension Wiring

Each container COMP gets a full extension setup in `_init_container_comp()`:

1. `td_container_ext` (textDAT) — loader script with `sys.path` + import
2. `comp.par.ext = 1` + `comp.par.ext0object = "op('...').module.TDContainerExt(me)"`
3. `parexec1` (parameterexecuteDAT) — routes pulse/value callbacks
4. `status_display` (textTOP) — visual status indicator
5. `comp.viewer = True` — preview active by default

## Status Polling

### poll_script (run()-based loop)

Timer CHOP callbacks don't fire reliably in containerCOMPs. Polling uses a `poll_script` textDAT with a self-scheduling `run()` loop:

```python
def poll():
    ext = op('/TDDocker').ext.TDDockerExt
    if ext and getattr(ext, '_polling_active', False):
        ext.PollStatus()
        run('op("/TDDocker/poll_script").module.poll()',
            delayFrames=int(2 * me.time.rate))  # 2 seconds
```

- `_start_polling()` sets `_polling_active = True` and calls `poll()` — auto-created on first Up
- `_stop_polling()` sets `_polling_active = False` — the loop stops on next iteration

### Immediate Refresh

After Start/Stop/Restart on a container, `_refresh_orchestrator()` calls `PollStatus()` immediately — no 2s wait. Also called after `_down()` on the orchestrator.

### PollStatus() Flow

`compose_ps(-a)` → `status_map` by service name → update each container COMP's State/Health/ContainerID params + `_update_container_display()`. Services missing from `compose_ps` output (with a container ID) are marked as `exited`.

## Visual Status Display

Each container COMP has a `status_display` textTOP (320x200) showing:

```
service_name
━━━━━━━━
● STATE
```

Colors update based on state via `_STATE_COLORS`:

| State | COMP color | Text color |
|-------|-----------|------------|
| `running` (healthy) | Green (0.2, 0.6, 0.2) | Bright green |
| `created` (never started) | Grey (0.4, 0.4, 0.4) | Grey |
| `paused` / starting | Yellow (0.7, 0.6, 0.1) | Yellow |
| `exited` / `dead` / unhealthy | Red (0.7, 0.2, 0.2) | Red |

## WebSocket Data Bridge

`WebSocketBridge` class (`transports/websocket.py`) + `CALLBACK_SCRIPT` injected into a TD textDAT.

```
websocket_dat (websocketDAT) → par.callbacks → ws_callbacks (textDAT)
                                                  ↓ onReceiveText
                                              data_in (tableDAT — parsed rows)
```

- JSON objects → key/value rows, JSON arrays → row-per-element, plain text → `{"message": raw}`
- Reconnection: exponential backoff (1/2/4/8/16s, max 5 attempts) via `run()` + `delayFrames`
- Cleanup on transport switch: `websocket_dat`, `data_in`, `ws_callbacks` destroyed

## OSC Data Bridge

`OscBridge` class (`transports/osc.py`) + `CALLBACK_SCRIPT` for TD oscinDAT.

```
osc_in (oscinDAT) → par.callbacks → osc_callbacks (textDAT)
                                       ↓ onReceiveOSC
                                   data_in (tableDAT — address + args rows)
osc_out (oscoutDAT) → sends to container
```

- Rows: `address`, `arg0`, `arg1`, ... — header auto-expands
- Rolling buffer (max 1000 rows)
- Bidirectional: tested with `docker/osc-test/` container

## Security Rules

The validator (`validator.py`) enforces a deny-list before any Docker operation:
- **Errors** (block load): `privileged`, `pid: host`, dangerous volumes, dangerous capabilities
- **Warnings** (log + continue): user-set `network_mode: host`, raw device access

**Principle:** Never modify the user's compose file. All TD additions go in `td-overlay.yml`.

## Testing

- **Unit tests** (`python/tests/`): 85 tests, pure Python, no Docker needed
- **OSC integration test**: `test-osc-compose.yml` + `docker/osc-test/` — bidirectional verified
- **Crash test**: Up → kill TD process → verify watchdog kills containers within ~5s
- **Orphan test**: Kill both TD and watchdog → restart TD → verify orphan cleanup on init

## Architecture Decisions

- **Overlay file** (`-f`) over YAML merge — compose handles the merge natively, user file untouched
- **Detached watchdog** over `atexit` — survives TD crashes and force-kills
- **Labels** (`td.managed`, `td.session`, `td.service`) — enable orphan detection and per-session isolation
- **Bridge network** by default, **host mode** only when NDI is enabled on a service
- **No psutil dependency** — PID checking uses `ctypes.windll.kernel32.OpenProcess` (Windows) or `os.kill(pid, 0)` (POSIX)
- **parexecDAT over extension promote** — TD promote doesn't fire on dynamic baseCOMPs
- **run()-based polling over Timer CHOP** — Timer CHOP callbacks don't fire in containerCOMPs
- **Immediate refresh** — PollStatus() called right after Start/Stop/Down, not just on timer

## Dependency Graph

```
td_docker_ext.py (TD extension DAT)
  └── td_docker/ package (on sys.path via python/)
        ├── compose.py → validator.py, yaml, subprocess
        ├── watchdog.py → subprocess, ctypes/os
        ├── docker_status.py → subprocess, platform
        ├── container_manager.py → subprocess
        └── transports/
              ├── websocket.py → json
              └── osc.py → (no deps)
```
