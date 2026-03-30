<!-- session_id: 84e6d814-9413-4da1-be34-591ceb341b4a -->
# TDDocker — Documentation Update Plan

## Context

Apres les ajouts de la session (OSC bridge, Docker status, visual feedback, parexecDAT, poll_script, immediate refresh), les docs sont desyncees du code.

## Changes needed

### CLAUDE.md

1. **File structure** — ajouter `docker_status.py`, `docker/osc-test/`
2. **Ajouter section "Parameter Routing (parexecDAT)"** — expliquer que TD extension promote ne fire pas sur baseCOMPs dynamiques, donc on utilise un parameterexecuteDAT
3. **Ajouter section "Status Polling (poll_script)"** — remplacer la reference au Timer CHOP par le pattern run()/delayFrames
4. **Ajouter section "Visual Status Display"** — status_display TOP, _STATE_COLORS, _update_container_display
5. **Ajouter section "Immediate Refresh"** — _refresh_orchestrator() apres Start/Stop/Restart
6. **Update "Container Extension Wiring"** — decrire le pattern complet (loader DAT + ext0object + parexecDAT)
7. **WebSocket section** — deja presente, OK
8. **Mettre a jour section Testing** — verifier count

### README.md

1. **Network diagram** — remplacer `poll_timer`/`poll_timer_callbacks` par `poll_script` + `poll_chopexec`
2. **Container COMP children** — ajouter `td_container_ext`, `parexec1`, `status_display` au diagramme
3. **Ajouter "Visual Feedback" section** — couleurs par etat, status display
4. **Ajouter Docker Status section** — Check Docker / Start Docker boutons
5. **File structure** — ajouter `docker/osc-test/`, `test-osc-compose.yml`
6. **Quick Start** — mentionner Check Docker avant Load
7. **Orchestrator Actions table** — ajouter Check Docker, Start Docker (deja fait)

### Root CLAUDE.md

Pas de changement necessaire — les instructions projet sont generiques.

## Files

| File | Action |
|------|--------|
| `TDDocker/CLAUDE.md` | Major update |
| `TDDocker/README.md` | Major update |

## Verification

Relire les deux fichiers et verifier que chaque feature du code est documentee.
