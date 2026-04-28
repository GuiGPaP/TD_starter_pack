#!/bin/bash
# PostToolUse hook: auto-format files after Write/Edit
# Receives JSON on stdin with tool_input.file_path
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE_PATH" ] && exit 0
[ ! -f "$FILE_PATH" ] && exit 0

BEFORE_FILE=$(mktemp)
trap 'rm -f "$BEFORE_FILE"' EXIT
cp "$FILE_PATH" "$BEFORE_FILE"

# Python files under modules/
if [[ "$FILE_PATH" == *.py && "$FILE_PATH" == */modules/* ]]; then
    REPO_ROOT=$(cd "$(dirname "$FILE_PATH")" && git rev-parse --show-toplevel 2>/dev/null)
    if [ -n "$REPO_ROOT" ]; then
        cd "$REPO_ROOT"
        uv run ruff check --fix "$FILE_PATH" >/dev/null 2>&1 || true
        uv run ruff format "$FILE_PATH" >/dev/null 2>&1 || true
    fi
fi

# TypeScript files under _mcp_server/
if [[ "$FILE_PATH" == *.ts && "$FILE_PATH" == */_mcp_server/* ]]; then
    REPO_ROOT=$(cd "$(dirname "$FILE_PATH")" && git rev-parse --show-toplevel 2>/dev/null)
    if [ -n "$REPO_ROOT" ] && [ -d "$REPO_ROOT/_mcp_server" ]; then
        cd "$REPO_ROOT/_mcp_server"
        npx biome check --write "$FILE_PATH" >/dev/null 2>&1 || true
    fi
fi

if ! cmp -s "$BEFORE_FILE" "$FILE_PATH"; then
    jq -n --rawfile content "$FILE_PATH" '{
        hookSpecificOutput: {
            hookEventName: "PostToolUse",
            updatedToolOutput: $content
        }
    }'
fi

exit 0
