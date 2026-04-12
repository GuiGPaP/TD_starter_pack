<!-- session_id: 96641d29-5b0f-4e31-b8ec-c824dd2d54d9 -->
# Issue #96 — Token economy

## Context

MCP responses waste tokens on verbose defaults, skills get re-read needlessly, and the memory index has grown to 51 entries (target: ~25). Three sub-tasks remain from the issue:

- **1a. Default detailLevel** — Already done (all search tools use `"summary"`, single-item `get_*` use `"detailed"`)
- **1b. Skill cache instructions** — Add to 9 SKILL.md files
- **1c. Archive resolved memory entries** — Trim MEMORY.md from 51 to ~25
- **1d. Dedup lessons/memory** — Audit done, action: archive memory entries already captured in `tasks/lessons.md`

## Plan

### Step 1: Add cache rule to each SKILL.md (9 files)

Add this block after the opening section of each SKILL.md:

```
> **Cache rule**: If you already loaded this skill or read a reference file in the current conversation, do NOT re-read it. Use your memory of the content.
```

Files:
- `.claude/skills/td-context/SKILL.md`
- `.claude/skills/td-glsl/SKILL.md`
- `.claude/skills/td-glsl-vertex/SKILL.md`
- `.claude/skills/td-guide/SKILL.md`
- `.claude/skills/td-lint/SKILL.md`
- `.claude/skills/td-pops/SKILL.md`
- `.claude/skills/td-pretext/SKILL.md`
- `.claude/skills/td-python/SKILL.md`
- `.agents/skills/pretext/SKILL.md`

### Step 2: Archive resolved memory entries

**Delete these memory files** (content is either COMPLETED/FIXED or already captured in `tasks/lessons.md`):

| File | Reason |
|------|--------|
| `project_tddocker_fps_debug.md` | Status: COMPLETED 2026-03-31 |
| `feedback_mcp_fps_lie.md` | FIXED, captured in lessons.md "TD Python via MCP" |
| `feedback_glsl_pop_crash.md` | One-shot incident, captured in lessons.md |
| `feedback_glsl_pop_connect_crash.md` | One-shot incident, captured in lessons.md |
| `feedback_td_pop_rendering.md` | Condensed into lessons.md "POP Rendering" section |
| `feedback_td_pop_layout_limits.md` | Condensed into lessons.md "POP Rendering" section |
| `feedback_td_native_text_patterns.md` | Condensed into lessons.md "Atlas & Text Rendering" |
| `feedback_td_textcomp_patterns.md` | Condensed into lessons.md "Atlas & Text Rendering" |
| `feedback_td_threadmanager_ref.md` | Captured in lessons.md "Threading & Performance" |
| `feedback_td_perf_patterns.md` | Captured in lessons.md "Threading & Performance" |
| `feedback_td_poll_script_pattern.md` | Captured in lessons.md "Runtime" |
| `feedback_td_parexec_simple.md` | Captured in lessons.md "Runtime" |
| `feedback_td_frame_delayed_ops.md` | Captured in lessons.md "Runtime" |
| `feedback_epic7_review.md` | Epic 7 shipped, review notes stale |
| `feedback_epic9_review.md` | Epic 9 shipped, review notes stale |
| `feedback_epic10_integration.md` | Epic 10 shipped, review notes stale |
| `feedback_tddocker_mcp_async.md` | TDDocker async COMPLETED |
| `feedback_etch_hooks_review.md` | One-shot review, hooks shipped |
| `feedback_mcp_td_errors_session_0407.md` | Session-specific errors, captured in lessons |
| `feedback_webrender_patterns.md` | Captured in td-pretext skill |
| `feedback_vram_not_a_concern.md` | Single-line preference, can re-derive |

That's 21 deletions → ~30 remaining entries.

### Step 3: Update MEMORY.md index

Remove the deleted entries from the index and tighten the categories.

## Verification

- All 9 SKILL.md files contain the cache rule
- MEMORY.md has < 30 active entry lines
- No broken references in MEMORY.md (every listed file exists)
- `cd _mcp_server && npm test` — still passes (no code changes)
