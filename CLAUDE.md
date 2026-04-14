# TD_starter_pack — TouchDesigner MCP Project

## Skill Decision Tree

When working with TouchDesigner, pick the right skill:

| Need | Skill |
|------|-------|
| TD network / operators / layout / rendering / project context (`index_td_project`, `get_td_context`) | **td-guide** |
| GLSL shaders (pixel, vertex, compute, particles) | **td-glsl** |
| Python utilities (TDFunctions, TDJSON, TDStoreTools, TDResources) / DAT linting / ruff | **td-python** |
| Native text layout / font atlas / obstacle avoidance / char instancing | **td-pretext** |
| UI from sketch / wireframe / mockup image → Palette widgets in TD | **td-sketch-ui** |

**When in doubt:** Start with `td-guide` — it routes to td-glsl for shaders and td-python for Python work.

## Session Start

If `tasks/errors-log.md` exists, read the **Unresolved** section and **Lesson Candidates** — these are errors and lesson candidates captured by the stop hook in previous sessions. Check if they're still relevant before starting new work.

## Global Rule

**Pre-trained TD knowledge is unreliable** — always read skill reference files before writing TouchDesigner code. Do not guess parameter names, operator types, or API patterns from memory.

## Dev Workflow

- `just` — list all available commands
- `just check` — lint + typecheck only (does **not** run tests)
- `just test` — run test suite

## Submodules

After cloning, always run:

```bash
git submodule update --init --recursive
```

Two components live in their own public repos, included here as submodules:

- **TDpretext** (`TDpretext/`) — Pretext-based text layout in TouchDesigner via Web Render TOP.
  Repo: https://github.com/GuiGPaP/TDpretext
- **TDDocker** (`TDDocker/`) — Docker lifecycle manager for TD (compose overlay, transports, watchdog).
  Repo: https://github.com/GuiGPaP/TDDocker. Contains a nested submodule `TD_SLlidar_docker/sllidar_ros2/` pinned to the Slamtec upstream.

Extracted on 2026-04-14 to enable standalone OSS distribution. TDDocker history was preserved via `git subtree split`.

## MCP Server

`_mcp_server/` contains the TouchDesigner MCP server (TypeScript + Python). It lives directly in the mono-repo — no submodule.

- **Build:** `cd _mcp_server && npm run build`
- **Test:** `cd _mcp_server && npm test`
- **Live E2E:** `cd _mcp_server && npm run test:integration:live` (requires TD + Docker running)
- **History:** Previously a submodule of `GuiGPaP/touchdesigner-mcp` (branch `td-starter-pack`). Inlined as of 2026-03-26.
- **Perf monitoring:** MCP tox includes `_perf_monitor` (performCHOP) + `_perf_trail` (trailCHOP, 5s). `get_performance` reports real FPS (not target cook rate) + trail stats (avg/min/max/p95/stddev).

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

### 3. Self-Improvement Loop (Positive Feedback System)

The skills and lessons in this repo ARE the knowledge base. They must grow automatically — the user should never have to ask for docs updates.

#### When to update (automatic triggers)
- **Correction from user**: something went wrong → update `tasks/lessons.md` AND the relevant skill
- **Discovery during work**: found a gotcha, a fast path, a TD quirk → update the relevant skill reference
- **New pattern validated**: a technique worked well (confirmed by user or by successful result) → add it to the skill
- **Architecture change**: new operator, new parameter, new data flow → update skill references + SKILL.md

#### What to update
- **`tasks/lessons.md`**: short actionable rules ("do X, not Y"). For quick recall at session start.
- **Skill `SKILL.md`**: architecture overview, critical patterns, performance budgets. The "what and why".
- **Skill `references/*.md`**: detailed how-to, code patterns, parameter values. The "how exactly".

#### How to update
1. Identify which skill owns the knowledge (use Skill Decision Tree above)
2. Read the current state of the file before editing — don't duplicate, extend
3. Update in-place: add the new pattern where it fits structurally, don't append a changelog
4. Keep lessons terse (1-2 lines), keep skill references detailed (code examples)
5. Do this at the END of the task, after the fix is verified — never document unproven patterns

#### What NOT to put in skills
- Temporary workarounds or investigation notes
- User-specific preferences (those go in memory)
- Anything that can be derived by reading the current code

**Goal**: Any future session should be able to read the skills and produce correct TD code on the first try, without repeating mistakes from past sessions.

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

## Lesson Frequency & Escalation

- When a lesson in `tasks/lessons.md` triggers again, append or increment `[xN]` (e.g., `[x2]`, `[x3]`).
- At `[x3]` or higher, **escalate to skill guardrail**: add the rule to the owning skill's `SKILL.md` and mark the lesson `→ promoted to {skill-name} guardrail`.
- The stop hook auto-scans for lesson candidates when TD is online — review them in `tasks/errors-log.md` under "Lesson Candidates".

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
