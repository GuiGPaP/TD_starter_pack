# TDDocker

Docker container lifecycle management for TouchDesigner. Load a standard `docker-compose.yml`, control containers from TD with bi-directional data and video transport.

## Features

- **Docker status check** — Detects if Docker is running, launches Docker Desktop with one click
- **Compose overlay** — Never modifies your YAML. Generates a `td-overlay.yml` with labels and networking, uses `docker compose -f user.yml -f td-overlay.yml`
- **Security validation** — Blocks `privileged`, `pid: host`, dangerous volume mounts (`/var/run/docker.sock`, `/etc`, `/proc`), and risky Linux capabilities before anything reaches Docker
- **Watchdog** — Detached Python process polls the TD PID every 2s. If TD crashes, containers are torn down automatically. Orphan cleanup on startup catches power-loss scenarios
- **Per-container COMPs** — Each service becomes a baseCOMP with custom parameters, pulse actions, and a visual status display
- **Visual feedback** — Container COMPs show service name + state indicator, with color-coded nodes (green=running, red=exited, yellow=starting, grey=created)
- **Immediate refresh** — UI updates instantly after Start/Stop/Restart, no polling delay
- **Data transport** — WebSocket or OSC per container, with parsed incoming data in `data_in` tableDAT
- **Video transport** — NDI In/Out TOPs per container (injects `network_mode: host` via overlay)

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Docker Compose v2
- TouchDesigner 2025+ (build 099.2025.31760 tested)
- Python 3.11+ (ships with TD)
- `pyyaml` (`pip install pyyaml`)

## Quick Start

1. Open `TDDocker.toe` in TouchDesigner
2. Select the `/TDDocker` COMP and open its parameters
3. On the **Actions** page:
   - Pulse **Check Docker** — verifies Docker is running
   - If not running, pulse **Start Docker** — launches Docker Desktop (wait 15-30s)
4. On the **Config** page, set **Compose File** to your `docker-compose.yml`
5. On the **Actions** page:
   - Pulse **Load** — validates YAML, generates overlay, creates container COMPs
   - Pulse **Up** — starts containers, spawns watchdog
   - Pulse **Down** — stops containers, signals watchdog
   - Pulse **Rebuild** — Down + destroy COMPs + re-Load + Up

## Architecture

### File Structure

```
TDDocker/
├── TDDocker.toe                    # Main TD project
├── pyproject.toml                  # Python project config (pytest, ruff, pyright)
├── td-overlay.yml                  # Generated at runtime (gitignored)
├── test-compose.yml                # Example compose for testing (nginx + echo)
├── test-osc-compose.yml            # OSC integration test compose
├── docker/
│   └── osc-test/                   # OSC echo container (integration tests)
│       ├── Dockerfile
│       └── osc_echo.py
└── python/
    ├── td_docker/
    │   ├── __init__.py             # Package (v0.1.0)
    │   ├── validator.py            # YAML security validation
    │   ├── compose.py              # Overlay generation + docker compose exec
    │   ├── watchdog.py             # PID polling + orphan cleanup
    │   ├── docker_status.py        # Docker daemon check + auto-launch
    │   ├── container_manager.py    # Per-container start/stop/restart/logs
    │   ├── td_docker_ext.py        # Orchestrator extension
    │   ├── td_container_ext.py     # Container extension
    │   └── transports/
    │       ├── __init__.py         # Re-exports WebSocketBridge, OscBridge
    │       ├── websocket.py        # WS bridge (parse, state, reconnect)
    │       └── osc.py              # OSC bridge (parse address+args)
    └── tests/
        ├── conftest.py
        ├── test_validator.py       # 19 tests — security rules
        ├── test_compose.py         # 8 tests — overlay generation
        ├── test_watchdog.py        # 9 tests — PID checks, signals, orphans
        ├── test_docker_status.py   # 12 tests — Docker check + auto-launch
        ├── test_ndi_regen.py       # 6 tests — NDI overlay regeneration
        ├── test_websocket_bridge.py # 18 tests — message parsing, state, callbacks
        └── test_osc_bridge.py      # 13 tests — OSC parsing, headers, callbacks
```

### TD Network

```
/TDDocker (containerCOMP)              Orchestrator
├── td_docker_ext (textDAT)            Extension loader (sys.path + import)
├── parexec1 (parameterexecuteDAT)     Routes pulse/value → extension
├── log (textDAT)                      Rolling log output
├── status (tableDAT)                  Service status table
├── poll_script (textDAT)              run()-based 2s polling loop
├── containers (baseCOMP)              Parent for service COMPs
│   ├── web (baseCOMP)                 One per compose service
│   │   ├── status_display (textTOP)   Visual: name + state + color
│   │   ├── log_dat (textDAT)          Container-specific logs
│   │   ├── td_container_ext (textDAT) Extension loader
│   │   └── parexec1 (parexecDAT)      Routes pulse/value → extension
│   └── echo (baseCOMP)
│       ├── status_display (textTOP)
│       ├── log_dat (textDAT)
│       ├── td_container_ext (textDAT)
│       └── parexec1 (parexecDAT)
└── mcp_webserver_base (baseCOMP)      MCP bridge (optional)
```

## Custom Parameters

### Orchestrator (`/TDDocker`)

#### Config Page

| Parameter | Type | Description |
|-----------|------|-------------|
| Compose File | File | Path to your `docker-compose.yml` |
| Session ID | String (read-only) | Auto-generated hex ID for this session |
| Auto Shutdown | Toggle | Kill containers when TD exits (default: ON) |
| Orphan Cleanup | Toggle | Clean orphaned containers on init (default: ON) |
| Container Template | File | Optional `.tox` template for container COMPs |

#### Actions Page

| Parameter | Type | Description |
|-----------|------|-------------|
| Check Docker | Pulse | Check if Docker daemon is running |
| Start Docker | Pulse | Launch Docker Desktop (Win/macOS) |
| Load | Pulse | Parse, validate, generate overlay, create COMPs |
| Up | Pulse | `docker compose up -d` + spawn watchdog + start polling |
| Down | Pulse | `docker compose down` + signal watchdog + refresh displays |
| Rebuild | Pulse | Down + destroy COMPs + Load + Up |
| View Logs | Pulse | Fetch compose logs into log DAT |

### Container COMPs (`/TDDocker/containers/*`)

#### Info Page

| Parameter | Type | Description |
|-----------|------|-------------|
| Service Name | String | From compose YAML |
| Image | String | Docker image |
| Container ID | String | Runtime container ID |
| State | Menu | created / running / paused / exited / dead |
| Health | Menu | none / healthy / unhealthy |

#### Actions Page

| Parameter | Type | Description |
|-----------|------|-------------|
| Start | Pulse | `docker start` — refreshes display immediately |
| Stop | Pulse | `docker stop` — refreshes display immediately |
| Restart | Pulse | `docker restart` — refreshes display immediately |
| Logs | Pulse | Fetch logs into container's log_dat |

#### Transport Page

| Parameter | Type | Description |
|-----------|------|-------------|
| Data Transport | Menu | None / WebSocket / OSC |
| Data Port | Int | Port for data communication |
| Video Transport | Menu | None / NDI |
| NDI Source | String | NDI source name (manual entry) |

## Visual Feedback

Each container COMP displays a color-coded status preview:

| State | Node color | Display |
|-------|-----------|---------|
| Never started | Grey | `● CREATED` |
| Starting (has ID, not running) | Yellow | `● CREATED` |
| Running + healthy | Green | `● RUNNING` |
| Running + unhealthy | Red | `● UNHEALTHY` |
| Exited / dead | Red | `● EXITED` |
| Paused | Yellow | `● PAUSED` |

Updates immediately after Start/Stop/Restart/Down, and via 2s background polling during Up.

## Security

### Blocked (error — Load aborted)

| Rule | What's blocked |
|------|---------------|
| `no-privileged` | `privileged: true` |
| `no-pid-host` | `pid: host` |
| `no-dangerous-volume` | Mounts to `/var/run/docker.sock`, `/etc`, `/proc`, `/sys`, `C:\Windows` |
| `no-dangerous-cap` | `cap_add`: SYS_ADMIN, SYS_PTRACE, NET_ADMIN, NET_RAW, SYS_RAWIO, SYS_MODULE |

### Warned (Load proceeds)

| Rule | What's flagged |
|------|---------------|
| `user-host-network` | User sets `network_mode: host` (TDDocker manages this for NDI) |
| `raw-device-access` | `/dev/*` device mounts |

## Watchdog

The watchdog is a detached Python process that ensures containers don't outlive TD.

**Normal flow:**
1. `Up` spawns the watchdog with TD's PID, session ID, and compose directory
2. Watchdog polls `pid_exists(td_pid)` every 2 seconds
3. `Down` writes a `.td_shutdown` file — watchdog exits cleanly without teardown

**Crash flow:**
1. TD crashes — no `.td_shutdown` file is written
2. Watchdog detects PID is gone
3. Runs `docker compose -p {session_id} down --timeout 10`

**Orphan cleanup:**
On TDDocker init (if Orphan Cleanup is ON), queries `docker ps --filter label=td.managed=true` and stops any containers from dead sessions.

## Data Transport

Set **Data Transport** on a container COMP to enable:

- **WebSocket** — Creates `websocketDAT`, `data_in` tableDAT, and `ws_callbacks` textDAT. Set **Data Port** to the host-mapped port your container exposes.
  - Incoming JSON objects are parsed into key/value rows in `data_in`
  - JSON arrays become one row per element
  - Plain text becomes `{"message": raw}`
  - Auto-reconnect with exponential backoff (1/2/4/8/16s, max 5 attempts)
- **OSC** — Creates `oscinDAT` (on Data Port), `oscoutDAT` (on Data Port + 1), `data_in` tableDAT, and `osc_callbacks` textDAT.
  - Incoming OSC messages are parsed into rows: `address`, `arg0`, `arg1`, ...
  - Header auto-expands when messages with more arguments arrive
  - Rolling buffer (max 1000 rows)
  - Bidirectional: verified with `docker/osc-test/` integration test

Your container application must implement the corresponding server/client.

## Video Transport

Set **Video Transport** to **NDI** on a container COMP:

- Creates `ndiin` (video_in) and `ndiout` (video_out) TOPs
- The overlay automatically injects `network_mode: host` for that service (required for NDI discovery)
- Toggling NDI on/off regenerates the overlay and re-applies compose (idempotent)
- Set **NDI Source** to the source name broadcast by your container (e.g., `HOSTNAME/stream`)

Your container must run NDI-capable software and have NDI SDK available.

## Development

```bash
cd TDDocker

# Run tests (85 tests, no Docker required)
python -m pytest python/tests/ -v

# Lint
ruff check python/

# Type check
pyright
```

## Python Modules

| Module | Role |
|--------|------|
| `validator.py` | `validate_compose(yaml_str)` — returns `ValidationResult` with errors/warnings |
| `compose.py` | `generate_overlay()`, `write_overlay()`, `compose_up()`, `compose_down()`, `compose_ps()`, `compose_logs()` |
| `watchdog.py` | `spawn_watchdog()`, `cleanup_orphans()`, `send_shutdown_signal()`, `pid_exists()` |
| `docker_status.py` | `check_docker()`, `start_docker_desktop()` — daemon check + auto-launch |
| `container_manager.py` | `start_container()`, `stop_container()`, `restart_container()`, `container_logs()`, `inspect_container()` |
| `td_docker_ext.py` | `TDDockerExt` — orchestrator: Load/Up/Down/Rebuild, PollStatus, visual feedback |
| `td_container_ext.py` | `TDContainerExt` — per-container: Start/Stop/Restart/Logs, transport setup |
| `transports/websocket.py` | `WebSocketBridge` (parse, state, reconnect), `CALLBACK_SCRIPT` |
| `transports/osc.py` | `OscBridge` (parse address+args), `CALLBACK_SCRIPT` |

## Roadmap (V2+)

- Spout/Syphon shared memory video transport
- GPU passthrough (`--gpus`) configuration
- Docker build from Dockerfile (V1 = pre-built images only)
- Auto-NDI discovery via NDI Find DAT
- MCP tool integration (control containers via Claude)
- Container resource limits UI
- Multi-machine / Docker Swarm
