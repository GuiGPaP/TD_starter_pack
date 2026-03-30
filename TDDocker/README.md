# TDDocker

Docker container lifecycle management for TouchDesigner. Load a standard `docker-compose.yml`, control containers from TD with bi-directional data and video transport.

## Features

- **Compose overlay** — Never modifies your YAML. Generates a `td-overlay.yml` with labels and networking, uses `docker compose -f user.yml -f td-overlay.yml`
- **Security validation** — Blocks `privileged`, `pid: host`, dangerous volume mounts (`/var/run/docker.sock`, `/etc`, `/proc`), and risky Linux capabilities before anything reaches Docker
- **Watchdog** — Detached Python process polls the TD PID every 2s. If TD crashes, containers are torn down automatically. Orphan cleanup on startup catches power-loss scenarios
- **Per-container COMPs** — Each service in your compose file becomes a baseCOMP with custom parameters (state, health, container ID) and pulse actions (start, stop, restart, logs)
- **Status polling** — Timer CHOP polls `docker compose ps` every 2s and propagates state to each container COMP
- **Data transport** — WebSocket DAT or OSC In/Out per container
- **Video transport** — NDI In/Out TOPs per container (injects `network_mode: host` via overlay)

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Docker Compose v2
- TouchDesigner 2025+ (build 099.2025.31760 tested)
- Python 3.11+ (ships with TD)
- `pyyaml` (`pip install pyyaml`)

## Quick Start

1. Open `TDDocker.toe` in TouchDesigner
2. Select the `/TDDocker` COMP and open its parameters
3. On the **Config** page, set **Compose File** to your `docker-compose.yml`
4. On the **Actions** page:
   - Pulse **Load** — validates YAML, generates overlay, creates container COMPs
   - Pulse **Up** — starts containers, spawns watchdog, begins status polling
   - Pulse **Down** — stops containers, signals watchdog
   - Pulse **Rebuild** — Down + destroy COMPs + re-Load + Up

## Architecture

### File Structure

```
TDDocker/
├── TDDocker.toe                    # Main TD project
├── pyproject.toml                  # Python project config (pytest, ruff, pyright)
├── td-overlay.yml                  # Generated at runtime (gitignored)
├── test-compose.yml                # Example compose for testing
└── python/
    ├── td_docker/
    │   ├── __init__.py             # Package (v0.1.0)
    │   ├── validator.py            # YAML security validation
    │   ├── compose.py              # Overlay generation + docker compose exec
    │   ├── watchdog.py             # PID polling + orphan cleanup
    │   ├── docker_status.py        # Docker daemon check + auto-launch
    │   ├── container_manager.py    # Per-container start/stop/restart/logs
    │   ├── td_docker_ext.py        # Orchestrator extension (reference)
    │   ├── td_container_ext.py     # Container extension (reference)
    │   └── transports/
    │       ├── __init__.py         # Re-exports WebSocketBridge, OscBridge
    │       ├── websocket.py        # WS bridge (parse, state, reconnect, callback script)
    │       └── osc.py              # OSC bridge (parse address+args, callback script)
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
├── td_docker_ext (textDAT)            Extension script (sys.path + import)
├── log (textDAT)                      Rolling log output
├── status (tableDAT)                  Service status table
├── poll_timer (timerCHOP)             2s polling cycle
├── poll_timer_callbacks (textDAT)     Timer → PollStatus()
├── containers (baseCOMP)              Parent for service COMPs
│   ├── web (baseCOMP)                 One per compose service
│   │   └── log_dat (textDAT)
│   └── echo (baseCOMP)
│       └── log_dat (textDAT)
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
| Up | Pulse | `docker compose up -d` + spawn watchdog |
| Down | Pulse | `docker compose down` + signal watchdog |
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
| Start | Pulse | `docker start` this container |
| Stop | Pulse | `docker stop` this container |
| Restart | Pulse | `docker restart` this container |
| Logs | Pulse | Fetch logs into container's log_dat |

#### Transport Page

| Parameter | Type | Description |
|-----------|------|-------------|
| Data Transport | Menu | None / WebSocket / OSC |
| Data Port | Int | Port for data communication |
| Video Transport | Menu | None / NDI |
| NDI Source | String | NDI source name (manual entry) |

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

- **WebSocket** — Creates a `websocketDAT`, a `data_in` tableDAT (parsed incoming messages), and a `ws_callbacks` textDAT (callback script). Set **Data Port** to the host-mapped port your container exposes.
  - Incoming JSON objects are parsed into key/value rows in `data_in`
  - JSON arrays become one row per element
  - Plain text becomes `{"message": raw}`
  - Auto-reconnect with exponential backoff (1/2/4/8/16s, max 5 attempts)
- **OSC** — Creates `oscinDAT` (on Data Port), `oscoutDAT` (on Data Port + 1), a `data_in` tableDAT, and an `osc_callbacks` textDAT.
  - Incoming OSC messages are parsed into rows: `address`, `arg0`, `arg1`, ...
  - Header auto-expands when messages with more arguments arrive
  - Rolling buffer (max 1000 rows)

Your container application must implement the corresponding server/client.

## Video Transport

Set **Video Transport** to **NDI** on a container COMP:

- Creates `ndiin` (video_in) and `ndiout` (video_out) TOPs
- The overlay automatically injects `network_mode: host` for that service (required for NDI discovery)
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
| `transports/websocket.py` | `WebSocketBridge` (parse, state, reconnect), `CALLBACK_SCRIPT` (TD textDAT injection) |
| `transports/osc.py` | `OscBridge` (parse address+args), `CALLBACK_SCRIPT` (TD textDAT injection) |

## Roadmap (V2+)

- Spout/Syphon shared memory video transport
- GPU passthrough (`--gpus`) configuration
- Docker build from Dockerfile (V1 = pre-built images only)
- Auto-NDI discovery via NDI Find DAT
- MCP tool integration (control containers via Claude)
- Container resource limits UI
- Multi-machine / Docker Swarm
