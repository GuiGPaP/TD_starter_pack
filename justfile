default:
    @just --list

# One-shot bootstrap: submodules + Python deps + Node deps + git hooks
setup:
    git submodule update --init --recursive
    uv sync
    cd _mcp_server && npm install
    lefthook install

# Lint
lint:
    uv run ruff check modules/

# Auto-fix lint
fix:
    uv run ruff check --fix modules/

# Format
fmt:
    uv run ruff format modules/

# Type check
typecheck:
    uv run python -m pyright

# Run tests
test:
    uv run pytest

# Check module sync (root → submodule)
sync-check:
    uv run python scripts/sync_modules.py --check

# Check skill sync (skills/ → .agents/.claude)
skill-sync-check:
    uv run python scripts/sync_agent_skills.py --check

# Sync modules root → submodule
sync:
    uv run python scripts/sync_modules.py --sync

# Sync skills/ → .agents/skills and .claude/skills
skill-sync:
    uv run python scripts/sync_agent_skills.py --sync

# Cyclomatic complexity audit (full repo)
complexity:
    uv run python scripts/complexity_report.py

# All checks
check: lint typecheck sync-check skill-sync-check

# Install git hooks (requires lefthook)
hooks:
    lefthook install

# Legacy tox (td_server only)
tox:
    cd modules/td_server && tox
