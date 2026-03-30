<!-- session_id: 666bce15-6ddd-411b-a3f3-e2fc1f63714d -->
# TDDocker V1 — Architecture & Implementation Plan

## Context

TDDocker bridges Docker containers and TouchDesigner. Users load a standard `docker-compose.yml`, TD wraps it with an overlay for lifecycle control, data routing (WebSocket), and video I/O (NDI). A Python watchdog ensures containers die when TD exits — even on crash.

This is a **new project** inside `TDDocker/` — independent from the MCP server, but following the same code quality patterns (ruff, pyright, tests).

---

## Architecture Overview

```
TDDocker/
├── TDDocker.toe                    # Main project
├── TDDocker.tox                    # Reusable COMP (distributable)
├── container_template.tox          # Template cloned per service
├── python/
│   ├── td_docker/
│   │   ├── __init__.py
│   │   ├── compose.py              # Compose overlay generation + execution
│   │   ├── watchdog.py             # Detached PID-polling process
│   │   ├── validator.py            # YAML security validation
│   │   ├── container_manager.py    # Per-container lifecycle (start/stop/restart/logs)
│   │   └── transports/
│   │       ├── __init__.py
│   │       ├── websocket.py        # WebSocket data bridge
│   │       └── ndi.py              # NDI config helpers (host mode setup)
│   └── tests/
│       ├── test_compose.py
│       ├── test_validator.py
│       └── test_watchdog.py
├── docker/
│   └── td-overlay.yml.template     # Jinja2 template for overlay file
└── README.md                       # User documentation
```

---

## Phase 1 — Watchdog + Compose Core (MVP foundations)

### 1.1 Watchdog (`python/td_docker/watchdog.py`)

**Mechanism:** Hybrid (option C from discussion)

- TD launches a **detached Python process** via `subprocess.Popen` with `CREATE_NEW_PROCESS_GROUP` (Windows) / `start_new_session` (Unix)
- Watchdog receives: TD PID, session ID, compose project dir
- Polls `psutil.pid_exists(td_pid)` every 2s
- On TD death: `docker compose -p {session_id} down --timeout 10`
- On clean shutdown: TD sends a "shutdown" signal via a temp file (`{session_dir}/.td_shutdown`) — watchdog exits gracefully without compose down (TD handles it)

**Orphan cleanup at boot:**
- On TDDocker COMP init: `docker ps --filter label=td.managed=true --format '{{.ID}} {{.Labels}}'`
- Kill containers whose `td.session` doesn't match any running TD PID
- This catches: watchdog crash, power loss, force-kill

**Files:**
- `python/td_docker/watchdog.py` — standalone script (runnable as `python watchdog.py --pid X --session Y --compose-dir Z`)
- Entry point in TDDocker COMP extension: `self._spawn_watchdog()`

### 1.2 YAML Validator (`python/td_docker/validator.py`)

**Security rules (reject with clear error):**
1. `privileged: true` — blocked
2. `pid: host` / `network_mode: host` set by user — warning (we set host mode ourselves for NDI)
3. Volume mounts to `/var/run/docker.sock`, `/etc/`, `C:\Windows\` — blocked
4. `cap_add: [SYS_ADMIN, SYS_PTRACE, NET_ADMIN]` — blocked
5. `devices` containing `/dev/` raw access — warning

**Implementation:** Parse YAML with `pyyaml`, walk services dict, check against deny-list. Returns `list[ValidationIssue]` with severity (error/warning).

### 1.3 Compose Overlay (`python/td_docker/compose.py`)

**Strategy:** Generate `td-overlay.yml` at runtime, invoke `docker compose -f user.yml -f td-overlay.yml up -d`

**Overlay injects per service:**
```yaml
services:
  {service_name}:
    labels:
      td.managed: "true"
      td.session: "{session_uuid}"
      td.service: "{service_name}"
    # If NDI enabled for this service:
    network_mode: "host"
    # If data transport enabled:
    # (ports already defined by user — we just need connectivity)
```

**Overlay injects globally:**
```yaml
# Only when NOT using host mode:
networks:
  td_default:
    driver: bridge
```

**Compose execution:**
- `compose_up(user_yaml_path, overlay_path, project_name)` — wraps `subprocess.run`
- `compose_down(project_name, timeout=10)`
- `compose_ps(project_name)` — returns container states
- All calls capture stderr for error reporting back to TD

---

## Phase 2 — TD COMP Architecture

### 2.1 Orchestrator COMP (`TDDocker.tox`)

**Extension class: `TDDockerExt`**

**Custom Parameters (Config page):**
| Parameter | Type | Description |
|-----------|------|-------------|
| `Composefile` | File | Path to user's docker-compose.yml |
| `Sessionid` | Str (read-only) | Auto-generated UUID |
| `Autoshutdown` | Toggle | Kill containers on TD exit (default: ON) |
| `Orphancleanup` | Toggle | Clean orphans on init (default: ON) |

**Custom Parameters (Actions page):**
| Parameter | Type | Description |
|-----------|------|-------------|
| `Load` | Pulse | Parse YAML, validate, create container COMPs |
| `Up` | Pulse | Compose up (all services) |
| `Down` | Pulse | Compose down (all services) |
| `Rebuild` | Pulse | Down + remove COMPs + re-Load + Up |
| `Viewlogs` | Pulse | Open log viewer |

**Internal operators:**
- `compose_manager` (Text DAT) — `TDDockerExt` extension script
- `status` (Table DAT) — service name / state / health / uptime
- `log` (Text DAT) — rolling log of compose output
- `containers` (Base COMP) — parent for dynamically created service COMPs

**Lifecycle:**
1. User sets `Composefile` path
2. Pulse `Load` → validate YAML → generate overlay → create 1 COMP per service inside `/containers/`
3. Pulse `Up` → `docker compose up -d` → spawn watchdog → start status polling
4. Pulse `Down` → `docker compose down` → signal watchdog → destroy status polling
5. TD `destroy()` callback → if Autoshutdown: compose down + signal watchdog

### 2.2 Container COMP (`container_template.tox`)

**Extension class: `TDContainerExt`**

**Custom Parameters (Info page — read-only):**
| Parameter | Type | Description |
|-----------|------|-------------|
| `Servicename` | Str | From compose YAML |
| `Image` | Str | Docker image name |
| `Containerid` | Str | Docker container ID |
| `State` | Menu | created/running/paused/exited/dead |
| `Health` | Menu | healthy/unhealthy/none |

**Custom Parameters (Actions page):**
| Parameter | Type | Description |
|-----------|------|-------------|
| `Start` | Pulse | `docker start` this container |
| `Stop` | Pulse | `docker stop` this container |
| `Restart` | Pulse | `docker restart` this container |
| `Logs` | Pulse | Fetch recent logs into log DAT |

**Custom Parameters (Transport page):**
| Parameter | Type | Description |
|-----------|------|-------------|
| `Datatransport` | Menu | None / WebSocket / OSC |
| `Dataport` | Int | Port for data communication |
| `Videotransport` | Menu | None / NDI |
| `Ndisource` | Str | NDI source name (auto-discovered or manual) |

**Internal operators:**
- `status_chop` (CHOP) — running (0/1), health (0/1/2), cpu_pct, mem_mb
- `data_in` (Table DAT) — incoming data from container (WebSocket messages)
- `data_out` (Table DAT) — outgoing data to container
- `video_in` (NDI In TOP) — video from container (if NDI enabled)
- `video_out` (NDI Out TOP) — video to container (if NDI enabled)
- `log_dat` (Text DAT) — container-specific logs

---

## Phase 3 — Data Transport (WebSocket)

### 3.1 WebSocket Bridge

- Each container with `Datatransport = WebSocket` gets a persistent WS connection
- TD side: `WebSocket DAT` (native TD operator) per container COMP
- Container side: user's app connects to TD's WS server, or TD connects to container's WS server
- **Direction config:** TD-as-server (container connects to TD) or TD-as-client (TD connects to container)
- Messages land in `data_in` Table DAT, parsed as JSON rows if structured

### 3.2 Status Polling

- Single timer CHOP (in orchestrator) fires every 2s
- Calls `docker compose -p {session} ps --format json`
- Distributes state to each container COMP's `status_chop`
- Lightweight: one subprocess call for all containers, not one per container

---

## Phase 4 — Video Transport (NDI)

- Containers needing NDI run in `network_mode: host` (injected via overlay)
- Container COMP creates `NDI In TOP` with source name = `{container_hostname}/{stream_name}`
- User responsible for running NDI-capable software in their container
- TD can also send via `NDI Out TOP` per container COMP
- **MVP:** manual NDI source name entry. **V2:** auto-discovery via NDI Find DAT

---

## Implementation Order

| Step | What | Files | Depends on |
|------|------|-------|------------|
| **1** | YAML validator | `validator.py` + `test_validator.py` | Nothing |
| **2** | Compose overlay generator | `compose.py` + `test_compose.py` | Step 1 |
| **3** | Watchdog process | `watchdog.py` + `test_watchdog.py` | Nothing |
| **4** | Orchestrator COMP extension | `TDDocker.tox` + extension script | Steps 1-3 |
| **5** | Container template COMP | `container_template.tox` + extension | Step 4 |
| **6** | Status polling (Timer CHOP → docker ps) | In orchestrator extension | Steps 4-5 |
| **7** | WebSocket data bridge | Transport module + WS DAT config | Step 5 |
| **8** | NDI video config | NDI overlay + NDI In/Out TOPs | Step 5 |

Steps 1-3 can be done **in parallel** (pure Python, testable without TD).

---

## Verification Plan

1. **Unit tests** (steps 1-3): `pytest TDDocker/python/tests/` — validator rejects dangerous YAML, overlay generates correct structure, watchdog logic is sound
2. **Integration test** (manual): Load a test `docker-compose.yml` (nginx + simple WS echo server), pulse Load → Up → verify containers running → pulse Down → verify containers stopped
3. **Crash test**: Start containers via TD, force-kill TD process, verify watchdog kills containers within ~5s
4. **Orphan test**: Start containers, kill both TD and watchdog, restart TD, verify orphan cleanup on init
5. **Security test**: Feed YAML with `privileged: true` → verify rejection with clear error message

---

## Out of Scope (V2+)

- Spout/Syphon shared memory video
- Docker build from Dockerfile (V1 = pre-built images only)
- GPU passthrough (`--gpus`) configuration
- Multi-machine / Docker Swarm / Kubernetes
- MCP tool integration (control containers via Claude)
- Auto-NDI discovery
- Container resource limits UI
