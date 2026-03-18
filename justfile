default:
    @just --list

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
    uv run pyright

# Run tests
test:
    uv run pytest

# All checks
check: lint typecheck test

# Install git hooks (requires lefthook)
hooks:
    lefthook install

# Legacy tox (td_server only)
tox:
    cd modules/td_server && tox
