<!-- session_id: 84e6d814-9413-4da1-be34-591ceb341b4a -->
# TDDocker — Atomic Commits Plan

## Context

All TDDocker code (Phase 1-4 + Docker status) is implemented but uncommitted. The user wants atomic commits that tell a clean story. All files are untracked (new project).

## Commit Plan

### Commit 1: `.gitignore` update (pre-existing change)
```
.gitignore  — add _mcp_server/data/introspection/
```
Message: `chore: gitignore introspection data directory`

### Commit 2: TDDocker Phase 1 — core Python modules + tests
```
TDDocker/pyproject.toml
TDDocker/python/td_docker/__init__.py
TDDocker/python/td_docker/validator.py
TDDocker/python/td_docker/compose.py
TDDocker/python/td_docker/watchdog.py
TDDocker/python/td_docker/container_manager.py
TDDocker/python/tests/conftest.py
TDDocker/python/tests/test_validator.py
TDDocker/python/tests/test_compose.py
TDDocker/python/tests/test_watchdog.py
TDDocker/test-compose.yml
```
Message: `feat(TDDocker): add core compose, validator, watchdog + 36 tests`

### Commit 3: TDDocker Phase 2 — TD extensions (orchestrator + container)
```
TDDocker/python/td_docker/td_docker_ext.py
TDDocker/python/td_docker/td_container_ext.py
TDDocker/python/td_docker/transports/__init__.py   (empty at this point — overwritten later, but needed for package)
```
Message: `feat(TDDocker): add orchestrator and container TD extensions`

*Note: extensions include NDI regen (NotifyNdiChanged) and Docker status check since they were built into the files from the start. Splitting further would require artificial intermediate states.*

### Commit 4: TDDocker Phase 3 — WebSocket data bridge + tests
```
TDDocker/python/td_docker/transports/websocket.py
TDDocker/python/td_docker/transports/__init__.py   (re-export WebSocketBridge)
TDDocker/python/tests/test_websocket_bridge.py
```
Message: `feat(TDDocker): add WebSocket data bridge with reconnect + 18 tests`

### Commit 5: TDDocker Phase 4 — OSC data bridge + tests
```
TDDocker/python/td_docker/transports/osc.py
TDDocker/python/td_docker/transports/__init__.py   (re-export OscBridge)
TDDocker/python/tests/test_osc_bridge.py
```
Message: `feat(TDDocker): add OSC data bridge + 13 tests`

### Commit 6: Docker status check + auto-launch + tests
```
TDDocker/python/td_docker/docker_status.py
TDDocker/python/tests/test_docker_status.py
```
Message: `feat(TDDocker): add Docker availability check + auto-launch`

### Commit 7: NDI overlay regeneration tests
```
TDDocker/python/tests/test_ndi_regen.py
```
Message: `test(TDDocker): add NDI overlay regeneration tests`

### Commit 8: TD project files + docs
```
TDDocker/TDDocker.toe
TDDocker/TDDocker.3.toe
TDDocker/CLAUDE.md
TDDocker/README.md
```
Message: `docs(TDDocker): add project files, README, and CLAUDE.md`

### Commit 9: Plans
```
plans/2026-03-29/tddocker-v1-architecture-implementation-plan.md
plans/2026-03-29/update-lops-knowledge-base-v0-1-1-v0-1-3-early.md
plans/2026-03-30/tddocker-documentation-plan.md
plans/2026-03-30/tddocker-phase-3-4-implementation-plan.md
```
Message: `docs: add TDDocker architecture and implementation plans`

## Files to NOT commit
- `TDDocker/td-overlay.yml` — generated at runtime (add to .gitignore)
- `TDDocker/Backup/` — already covered by existing Backup/ gitignore
- `.claude/settings.local.json` — local settings
- `starter_pack.4.toe` — unclear if intended, skip for now

## Gitignore addition needed
Add `TDDocker/td-overlay.yml` to `.gitignore` in Commit 1.

## Verification
After all commits: `git log --oneline` shows 9 clean atomic commits.
