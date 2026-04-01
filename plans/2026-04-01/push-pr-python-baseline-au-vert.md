<!-- session_id: 156ca310-d95d-497e-b72a-d844fe45306f -->
# Push & PR — Python baseline au vert

## Context

4 commits prêts sur main, en avance sur origin/main. Tous les 5 jobs CI ont été rejoués localement et passent.

## Commits

1. `66a34dc` — refactor: extract _setup_multi_project helpers, lower C901 to 15 (closes #93)
2. `767aa13` — fix: TDDocker lint (F821, RUF012, SIM102) + sync serialization
3. `c38bf5d` — style: ruff format 11 fichiers TDDocker
4. `514033e` — fix: enable pyright TDDocker, fix type errors, commit uv.lock, update CLAUDE.md

## CI verification (local replay)

| Job | Result |
|-----|--------|
| ruff check modules/ | PASS |
| ruff format --check modules/ | PASS |
| pyright | PASS (0 errors) |
| pytest --cov | PASS (284 passed) |
| sync-check | PASS (19 files) |
| generated-check | PASS |

## Action

Push to origin/main (direct push, pas de PR — les commits sont déjà sur main).
