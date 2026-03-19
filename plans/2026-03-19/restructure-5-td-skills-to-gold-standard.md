<!-- session_id: 53914eb4-a6b5-460e-9a87-be64d42ba640 -->
# Plan: Restructure 5 TD Skills to Gold Standard

## Context

The 5 TouchDesigner skills (td-guide, td-glsl, td-glsl-vertex, td-pops, td-lint) have structural inconsistencies, bugs in examples, content duplication, and under-triggering descriptions. Two audit rounds (domain review + skill-creator audit) surfaced these issues. The goal is to restructure all 5 skills to match the svelte-astro-integration skill pattern — the "gold standard" — with progressive disclosure, lean SKILL.md files, index routers, and thorough reference docs.

**Reference skill**: `/home/b3ngous/projects/guig-site-cv/.claude/skills/svelte-astro-integration/`

## Gold Standard Template

### SKILL.md (~120-150 lines, never >200)

Section order:
1. **Frontmatter**: pushy description with trigger phrases, name
2. **H1 title**
3. **Mental Model**: 3-5 bullet points grounding the domain conceptually
4. **Decision Table** (optional): for skills with modes/choices (td-pops operator selection, td-guide GLSL routing)
5. **Critical Guardrails**: numbered, each with bold title + WHY explanation. 5-8 max
6. **Fetching Documentation**: MCP tool routing table (Context7, exa, project MCP tools) + "when to trust this skill vs fetch fresh docs"
7. **Loading References**: progressive loading instructions ("pick ONE from routing table")
8. **Reference Docs**: routing table with `@references/...` notation
9. **Response Format**: how to structure output

### index.md (~5-12 lines)

```markdown
# <Title>

Pick the ONE file that matches your task. If unsure, start with @<default>.md.

| Your task | File |
|---|---|
| ... | @file.md |
```

### Leaf reference files

- Open with 1-2 sentence definition
- Code-first (code blocks within first 10 lines)
- ~40-140 lines average
- Imperative/infinitive voice, confident tone
- Explain WHY, not just WHAT
- No duplication of SKILL.md content
- Pattern naming (e.g., "The Bounds-Check Pattern")

## Common Changes (all 5 skills)

1. Rename `reference/` -> `references/` (skill-creator convention)
2. Add `index.md` router to every directory with 2+ files
3. Rewrite SKILL.md to gold standard template
4. Rewrite descriptions to be pushier with trigger phrases
5. Add Mental Model section
6. Replace "read ALL refs" with "pick ONE from routing table"
7. Deduplicate content between SKILL.md and reference files
8. Add "Fetching Documentation" section with MCP tool routing
9. Update all internal file references (`reference/` -> `references/`)

## Per-Skill Tasks

### Agent 1: td-guide

**Files**: `SKILL.md` (277L), `reference/` (7 files, 1319L)

| Task | Type |
|---|---|
| Rename `reference/` -> `references/` | structural |
| Create `references/index.md` router | structural |
| Rewrite SKILL.md to template (~120-150L) | structural |
| Move inline code (operator creation, Geometry COMP pattern, Python helpers) out of SKILL.md — already exists in reference files | dedup |
| Remove "Skill Maintenance" section | dedup |
| Evaluate splitting `basics.md` (320L) if too dense | content |
| Agent decides: whether to add content for missing domains (CHOPs, DATs) | autonomous |

### Agent 2: td-glsl

**Files**: `SKILL.md` (119L), `reference/` (3 files), `examples/` (2 files), `templates/` (3 .glsl)

| Task | Type |
|---|---|
| **BUG**: Remove compute shader example (Example 2) from `COMPLETE.md` — replace with pixel shader (feedback, edge detection, or Voronoi) | bugfix |
| **BUG**: Fix `BEST-PRACTICES.md` texture optimization — "BAD"/"GOOD" do the same thing | bugfix |
| **BUG**: Fix `PATTERNS.md` chromatic aberration `normalize()` division-by-zero | bugfix |
| Rename `reference/` -> `references/` | structural |
| Create `references/index.md` and `examples/index.md` routers | structural |
| Rewrite SKILL.md to template | structural |
| Deduplicate: remove "TouchDesigner Functions" from SKILL.md (in FUNCTIONS.md) | dedup |
| Deduplicate: remove "Common Errors" from SKILL.md (in TROUBLESHOOTING.md) | dedup |
| Deduplicate: consolidate performance tips into BEST-PRACTICES.md only, remove from FUNCTIONS.md | dedup |
| Add `#version` directive note to guardrails | content |
| Add `templates/feedback.glsl` (feedback loop starter) | content |
| Agent decides: whether to add intermediate patterns (edge detection, blur, blend modes) | autonomous |

### Agent 3: td-glsl-vertex

**Files**: `SKILL.md` (246L), `reference/` (3 files), `templates/` (4 .glsl). No examples/.

| Task | Type |
|---|---|
| **BUG**: Fix `VARYINGS.md` normal mapping example — pixel shader uses `vUV.st` but vertex shader never declares it. Add `out vec2 vTexCoord` to vertex, `in vec2 vTexCoord` to pixel | bugfix |
| **BUG**: Fix `VERTEX-API.md` — change `attribute` keyword to `in` or mark as auto-injected | bugfix |
| **ADD**: Document `TDDeformNorm()` in VERTEX-API.md | content |
| **ADD**: Document `TDInstanceTexCoord()`, `TDInstanceColor()` in VERTEX-API.md | content |
| Rename `reference/` -> `references/` | structural |
| Create `references/index.md` router | structural |
| **CREATE** `examples/` folder with `index.md`, `COMPLETE.md`, `PATTERNS.md` | structural+content |
| **CREATE** `references/TROUBLESHOOTING.md` (extract from SKILL.md "Common Errors" + add more) | structural+content |
| Rewrite SKILL.md to template (~120-150L, down from 246L) | structural |
| Move inline patterns (displacement, wave, instancing) from SKILL.md to `examples/PATTERNS.md` | dedup |
| Move "Common Errors" table from SKILL.md to `references/TROUBLESHOOTING.md` | dedup |
| Move "Key Uniform Structs" from SKILL.md — already in VERTEX-API.md | dedup |

### Agent 4: td-pops

**Files**: `SKILL.md` (180L), `reference/` (3 files), `examples/` (2 files), `templates/` (4 .glsl)

| Task | Type |
|---|---|
| Rename `reference/` -> `references/` | structural |
| Create `references/index.md` and `examples/index.md` routers | structural |
| Rewrite SKILL.md to template | structural |
| Add TOC to `FUNCTIONS.md` (322L, needs navigation) | content |
| Deduplicate: remove "TouchDesigner Helper Functions" from SKILL.md (in FUNCTIONS.md) | dedup |
| Keep Operator Decision Table in SKILL.md (valuable, equivalent to gold standard's Decision Table) | keep |
| Keep Input/Output Attribute Access section (unique, not in refs) | keep |
| Agent decides: whether to add atomics/shared memory docs, collision patterns | autonomous |

### Agent 5: td-lint

**Files**: `SKILL.md` only (118L). No references, no examples.

| Task | Type |
|---|---|
| **CREATE** `references/` with `index.md` + leaf files | structural+content |
| **CREATE** `references/response-schema.md` — document JSON shapes from lint_dat, discover_dat_candidates, get_node_errors | content |
| **CREATE** `references/ruff-rules.md` — TD-specific ruff rules, suppressions, common false positives | content |
| **CREATE** `references/td-python-patterns.md` — TD Python idioms (op(), me, tdu, callbacks, extensions) | content |
| **CREATE** `examples/` with `index.md` + `correction-loop.md` (full walkthrough with tool calls and expected responses) | content |
| Rewrite SKILL.md to template | structural |
| Convert "Safety Rules" to Critical Guardrails with WHY | structural |
| Add Mental Model (DATs contain code, ruff lints Python, correction loop ensures safety) | content |
| Keep MCP Tools table in SKILL.md (compact, essential) | keep |

## Execution Strategy

### MANDATORY: Tool Usage Sequence

This sequence MUST be followed exactly. No shortcuts, no bypassing team tools.

```
Step 1: TeamCreate("td-skills-restructure")
        → Creates team + shared task list

Step 2: TaskCreate x5
        → One task per skill, with FULL instructions embedded in description
        → All tasks created BEFORE any agent is spawned

Step 3: Agent x5
        → Spawn teammates AFTER team + tasks exist
        → Each agent: team_name="td-skills-restructure", isolation="worktree"
        → Each agent prompt MUST include inter-agent communication instructions

Step 4: TaskUpdate x5
        → Assign each task to its teammate via owner field

Step 5: Monitor via TaskList / TaskGet
        → Agents auto-notify on completion via SendMessage
        → Agents communicate with each other via SendMessage when cross-skill impact

Step 6: Review each worktree's changes

Step 7: Merge all worktrees into dev

Step 8: SendMessage(shutdown_request) x5 → TeamDelete
```

### Inter-Agent Communication (CRITICAL)

Agents MUST use `SendMessage` to notify each other when their work could impact another skill. Examples:

- `restructure-td-glsl` removing the compute shader example → notify `restructure-td-pops` (the example might belong there)
- `restructure-td-guide` changing GLSL routing table → notify all 3 GLSL agents
- `restructure-td-glsl-vertex` creating TROUBLESHOOTING.md → share structure with `restructure-td-glsl` and `restructure-td-pops` for consistency
- Any agent changing the description/trigger phrases → notify `restructure-td-guide` (it routes to other skills)

Each agent's prompt MUST include:
1. **"You are part of a team. Use `TaskList` to see all tasks and understand the full scope."**
2. **"Use `SendMessage(to: '<teammate-name>', message: '...', summary: '...')` to communicate with other agents when your changes could affect their skill."**
3. **"Read the team config at `~/.claude/teams/td-skills-restructure/config.json` to discover teammate names."**
4. **"After completing your task, use `TaskUpdate` to mark it completed, then check `TaskList` for any follow-up."**

### Team Structure

5 general-purpose agents running in parallel in isolated worktrees:

| Teammate name | Skill | Worktree scope | Cross-skill dependencies |
|---|---|---|---|
| `restructure-td-guide` | td-guide | `.claude/skills/td-guide/` | Routes to all GLSL skills; notify them of routing changes |
| `restructure-td-glsl` | td-glsl | `.claude/skills/td-glsl/` | Removing compute example → notify td-pops; share structure with td-pops (mirror) |
| `restructure-td-glsl-vertex` | td-glsl-vertex | `.claude/skills/td-glsl-vertex/` | New TROUBLESHOOTING.md → share format with td-glsl, td-pops |
| `restructure-td-pops` | td-pops | `.claude/skills/td-pops/` | Mirror structure of td-glsl; may receive compute example from td-glsl |
| `restructure-td-lint` | td-lint | `.claude/skills/td-lint/` | Mostly independent; MCP tools shared with td-guide's project-api |

### Agent Preamble (shared context for all 5)

Each agent's prompt includes:
1. The gold standard SKILL.md template (section order, conventions)
2. The index.md template
3. The leaf file writing style guidelines (opening definition, code-first, imperative voice, pattern naming, ~100L avg)
4. Their skill's specific task table from the Per-Skill Tasks section
5. Instruction: "Read the gold standard SKILL.md at `/home/b3ngous/projects/guig-site-cv/.claude/skills/svelte-astro-integration/SKILL.md` and 2-3 of its leaf reference files before starting, to internalize the tone and structure"
6. The verification checklist to self-check before marking done
7. **Inter-agent communication instructions** (see above)
8. **"You MUST use TaskUpdate to mark your task completed when done. You MUST use SendMessage to coordinate."**

### Merge Strategy

1. Each agent works in an isolated worktree (no conflicts — each touches only its own skill directory)
2. After all complete, I review each worktree's changes
3. Merge sequentially into `dev`
4. Final review: read all 5 SKILL.md files for consistent tone/structure
5. Verify CLAUDE.md skill decision tree still accurately describes each skill

## Verification

Per-agent checklist:
- [ ] SKILL.md under 150 lines
- [ ] SKILL.md has all sections in correct order (Mental Model -> Guardrails -> Fetching Docs -> Loading Refs -> Routing Table -> Response Format)
- [ ] `reference/` renamed to `references/`
- [ ] Every directory with 2+ files has `index.md` router
- [ ] No content duplication between SKILL.md and reference files
- [ ] All bugs fixed (verify specific lines)
- [ ] `templates/` untouched
- [ ] All internal file references updated to `references/`
- [ ] Description is pushy with trigger phrases

Post-merge:
- [ ] td-guide GLSL routing table references correct skill names
- [ ] `wc -l` on all SKILL.md files confirms <150 lines each
- [ ] Cross-reference check: no broken `@references/` paths
