<!-- session_id: 096f1f4a-a685-4c9c-91f0-50daf37c9b2a -->
# Plan: Trim CLAUDE.md

## Context

The project CLAUDE.md is 146 lines. Much of it duplicates information already encoded in `pyproject.toml`, `justfile`, `README.md`, or auto-loaded skill metadata. Every token in CLAUDE.md is injected into every conversation — keeping it lean directly improves context efficiency.

## Changes

**Remove entirely:**
- **Project Structure** (lines 21-43) — skills are auto-loaded, Python module layout is discoverable via exploration, submodule info is in README.md
- **MCP Server** (lines 99-121) — submodule setup/config/update docs belong in README, not agent instructions
- **Attribution** (lines 123-128) — belongs in README.md
- **Tooling Python** (lines 130-145) — fully encoded in `pyproject.toml` + `justfile`; user feedback memory explicitly says "Do not add tooling commands or tool documentation to CLAUDE.md"

**Keep as-is:**
- Skill Decision Tree (lines 1-15)
- Global Rule (lines 17-19)
- Workflow Orchestration (lines 45-82)
- Task Management (lines 84-91)
- Core Principles (lines 93-97)

## Resulting file (~97 → ~62 lines)

```
# TD_starter_pack — TouchDesigner MCP Project

## Skill Decision Tree
[unchanged]

## Global Rule
[unchanged]

## Workflow Orchestration
[unchanged — sections 1-6]

## Task Management
[unchanged]

## Core Principles
[unchanged]
```

## File to modify

- `/home/b3ngous/projects/TD_starter_pack/CLAUDE.md`

## Verification

- `wc -l CLAUDE.md` confirms reduction
- Review resulting file reads cleanly with no dangling references
- `just check` still passes (no code changes)
