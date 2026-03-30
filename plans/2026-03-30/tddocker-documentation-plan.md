<!-- session_id: 666bce15-6ddd-411b-a3f3-e2fc1f63714d -->
# TDDocker — Documentation Plan

## Context

TDDocker V1 core is implemented and validated end-to-end (Load → Up → Poll → Down). The user requests two documentation files:
1. `TDDocker/README.md` — Complete user-facing documentation
2. `TDDocker/CLAUDE.md` — Project instructions for Claude Code sessions

## Files to create

### 1. `TDDocker/README.md`

Sections:
- **Header**: project name, one-line description
- **Features**: security validation, overlay compose, watchdog, per-container COMPs, NDI/WebSocket transport
- **Requirements**: Docker, Docker Compose, TouchDesigner 2025+, Python 3.11+, pyyaml
- **Quick Start**: step-by-step (open .toe, set Composefile, Load, Up, Down)
- **Architecture**: file tree, diagram of COMP structure
- **Custom Parameters**: tables for orchestrator (Config + Actions pages) and container COMPs (Info + Actions + Transport)
- **Security**: what's blocked (privileged, docker.sock, caps), what's warned (host network, raw devices)
- **Watchdog**: how it works (PID polling, shutdown signal, orphan cleanup)
- **Data Transport**: WebSocket / OSC setup
- **Video Transport**: NDI (host mode), manual source config
- **Development**: pytest, ruff, pyright commands
- **API Reference**: brief overview of Python modules
- **Roadmap / Out of Scope**: V2 items (Spout/Syphon, GPU passthrough, auto-NDI, MCP integration)

### 2. `TDDocker/CLAUDE.md`

Sections:
- **Project description**: one paragraph
- **File structure**: tree with roles
- **Dev commands**: test, lint, typecheck
- **Key patterns**:
  - Extension loaded via `ext0object` expression + `update_td_node_parameters` REST API (NOT Python `par.ext.val`)
  - `appendStrMenu` not `appendMenu` for TD menu pars, then set `.menuNames`/`.menuLabels`
  - DAT contains loader script (sys.path setup + import), not direct file sync
  - `_add_menu()` helper function in extension DAT
- **TD extension gotchas**: document the learnings from this session
- **Security**: validator deny-list, never modify user YAML
- **Generated files**: `td-overlay.yml` is runtime-generated, don't commit
- **Testing**: pytest path, what needs Docker vs what's mocked

## Verification

- Both files render correctly in GitHub markdown preview
- CLAUDE.md contains accurate, current information matching the actual code
