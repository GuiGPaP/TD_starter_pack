#!/bin/bash
# PreToolUse hook: block git commit/push if lint fails
# Receives JSON on stdin with tool_input.command
set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only intercept Bash tool calls
[ "$TOOL" != "Bash" ] && exit 0

# Only intercept git commit or git push (not other git commands)
if ! echo "$CMD" | grep -qE '^\s*git\s+(commit|push)\b'; then
    exit 0
fi

# Find repo root
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
REPO_ROOT=$(cd "$CWD" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || exit 0

errors=""

# Check staged/changed Python files under modules/
py_files=$(cd "$REPO_ROOT" && {
    git diff --cached --name-only --diff-filter=ACM 2>/dev/null
    git diff --name-only --diff-filter=ACM 2>/dev/null
} | grep '^modules/.*\.py$' | sort -u) || true

if [ -n "$py_files" ]; then
    # Run ruff check on changed Python files
    cd "$REPO_ROOT"
    for f in $py_files; do
        [ -f "$f" ] || continue
        if ! uv run ruff check "$f" 2>&1; then
            errors="${errors}ruff check failed on $f\n"
        fi
    done
fi

# Check staged/changed TypeScript files under _mcp_server/
ts_files=$(cd "$REPO_ROOT" && {
    git diff --cached --name-only --diff-filter=ACM 2>/dev/null
    git diff --name-only --diff-filter=ACM 2>/dev/null
} | grep '^_mcp_server/.*\.ts$' | sort -u) || true

if [ -n "$ts_files" ]; then
    cd "$REPO_ROOT/_mcp_server"

    # Run tsc --noEmit (project-wide, fast enough)
    if ! npx tsc --noEmit 2>&1; then
        errors="${errors}TypeScript compilation failed\n"
    fi

    # Run biome check on changed files
    for f in $ts_files; do
        full="$REPO_ROOT/$f"
        [ -f "$full" ] || continue
        if ! npx biome check "$full" 2>&1; then
            errors="${errors}biome check failed on $f\n"
        fi
    done
fi

if [ -n "$errors" ]; then
    echo -e "Lint errors found — fix before committing:\n$errors" >&2
    exit 2  # exit 2 = block the tool call
fi

exit 0
