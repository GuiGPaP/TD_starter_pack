# TD_starter_pack — TouchDesigner MCP Project

## Skill Decision Tree

When working with TouchDesigner, pick the right skill:

| Need | Skill |
|------|-------|
| TD network / operators / layout / components / data conversion / rendering | **td-guide** |
| Pixel shader / GLSL TOP / 2D image effect / generative texture / feedback | **td-glsl** |
| Vertex shader / GLSL MAT / 3D material / displacement / instancing | **td-glsl-vertex** |
| Compute shader / particles / GLSL POP / SSBO / point cloud | **td-pops** |
| TDFunctions / TDJSON / TDStoreTools / TDResources / StorageManager / PopMenu | **td-python** |
| Python DAT linting / code quality / ruff | **td-lint** |
| Project context / code completion / `index_td_project` / `get_td_context` | **td-context** |

**When in doubt:** Start with `td-guide` — it routes to the GLSL skills when needed.

## Global Rule

**Pre-trained TD knowledge is unreliable** — always read skill reference files before writing TouchDesigner code. Do not guess parameter names, operator types, or API patterns from memory.

## Dev Workflow

- `just` — list all available commands
- `just check` — lint + typecheck only (does **not** run tests)
- `just test` — run test suite

## MCP Server

`_mcp_server/` contains the TouchDesigner MCP server (TypeScript + Python). It lives directly in the mono-repo — no submodule.

- **Build:** `cd _mcp_server && npm run build`
- **Test:** `cd _mcp_server && npm test`
- **Live E2E:** `cd _mcp_server && npm run test:integration:live` (requires TD + Docker running)
- **Toolkit data** (`_mcp_server/data/td-knowledge/toolkits/`) is gitignored — populated via live TD introspection, not committed.
- **History:** Previously a submodule of `GuiGPaP/touchdesigner-mcp` (branch `td-starter-pack`). Inlined as of 2026-03-26.

## glslangValidator Auto-Provisioning

`validate_glsl_dat` auto-provisions `glslangValidator` when no GLSL TOP is connected.

**Resolution order:** `TD_MCP_GLSLANG_PATH` env var → system PATH → user cache → download.

- **Auto-download:** Windows x64 only (from Khronos `main-tot` rolling release). macOS/Linux: install via PATH (`brew install glslang`, `apt install glslang-tools`).
- **Cache location:** `%LOCALAPPDATA%/TDStarterPack/bin/` (Windows), `~/Library/Caches/TDStarterPack/bin/` (macOS), `$XDG_CACHE_HOME/TDStarterPack/bin/` (Linux).
- **Negative cache:** After a failed download, retries are suppressed for 1 hour (sentinel file `.glslang_download_failed`). Delete the sentinel to force immediate retry.
- **Override:** Set `TD_MCP_GLSLANG_PATH=/path/to/glslangValidator` to skip all auto-resolution.
- **No lock:** Concurrent TD sessions may trigger redundant downloads; `os.replace()` prevents partial files but not duplicate work.

## Generated Files

`modules/td_server/openapi_server/` and `modules/mcp/controllers/generated_handlers.py` are auto-generated — excluded from linting and type-checking.

## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project
- **Skills improvement:** when a correction relates to TD patterns, operator behavior, or GLSL usage, also propose an update to the relevant skill's `.md` files (show diff, apply after user approval)

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
