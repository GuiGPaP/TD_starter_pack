<!-- session_id: a4591f96-6205-4fad-be6d-3cd7c6537c02 -->
# Plan: Update LOPs Knowledge Base v0.1.1 → v0.1.3-early

## Context

LOPs (Language Operators by alltd.org) has been updated to v0.1.3-early in the live TD session. Our knowledge base is at v0.1.1 (57 ops). The live version has **78 operators (2340 params)** — 21 new ops, 0 removed, plus parameter changes on existing ops.

### New operators (17 with params + 4 templates)
- **AI/Agents:** `agent_scheduler`, `claude_code`, `claude_viewer`
- **Workflow (new category):** `flow_action`, `flow_controller`, `flow_state`, `scope`
- **Tools:** `tool_manager`, `tool_request`
- **Search/RAG:** `bm25`
- **Sources:** `source_dat`
- **Voice/STT:** `stt_parakeet`, `stt_soniox`
- **Integration (new category):** `comfyui`
- **Utilities:** `python_manager`, `shared_mem`, `tox_updater`
- **Templates (0 pars):** `a_base`, `a_container`, `action_01`, `action_02`

---

## Step 1: Regenerate introspection file (gitignored)

Run a TD Python script via `execute_python_script` that produces the correct schema directly (using `child.OPType` and `child.family` for exact values). Write output to `_mcp_server/data/introspection/lops.json`.

**Schema must match** existing format: `{version, operatorCount, operators: [{name, opType, family, parameterCount, pages, parameters: [{name, label, style, page, default, menuNames?}]}]}`

**Source:** Live TD session at `/dot_lops/custom_operators` (already introspected, data in temp file)

**File:** `_mcp_server/data/introspection/lops.json`

---

## Step 2: Update toolkit knowledge base (committed)

Edit `_mcp_server/data/td-knowledge/toolkits/lop.json`:

1. **`payload.version`:** `"0.1.1"` → `"0.1.3-early"`
2. **`content.summary`:** Update counts (78 ops, 2340 params, ~14 categories) and add all 21 new operators to their categories. Add new categories: Workflow/Flow, Integration.
3. **`content.warnings[2]`:** `"Alpha release (0.1.1)"` → `"Early alpha (0.1.3-early)"`
4. **`searchKeywords`:** Add: `comfyui`, `bm25`, `flow`, `scope`, `python-manager`, `shared-mem`, `soniox`, `parakeet`, `source-dat`, `claude-code`, `agent-scheduler`, `tool-manager`, `tox-updater`

**File:** `_mcp_server/data/td-knowledge/toolkits/lop.json`

---

## Step 3: Cleanup temp files

Delete working artifacts created by the agent at repo root:
- `lops_introspection_full.json`
- `lops_audit_complete.txt`

---

## Step 4: No skill file changes needed

Skills reference LOPs via `search_toolkits` only — no hardcoded operator lists. Updated `lop.json` flows through automatically.

---

## Verification

1. `cd _mcp_server && npm run build` — must pass (toolkit file validated by Zod at load time)
2. `cd _mcp_server && npm test` — no regressions
3. MCP tool calls:
   - `search_toolkits(query="lops")` → version 0.1.3-early, 78 ops
   - `search_toolkits(query="comfyui")` → matches via new keywords
   - `search_toolkits(query="claude_code")` → matches
   - `get_toolkit(id="lop-toolkit")` → full updated detail
4. `search_operators(query="claude_code", family="LOP")` → verify if family prefix search works with new ops

## Critical Files
- `_mcp_server/data/introspection/lops.json` (gitignored, regenerate)
- `_mcp_server/data/td-knowledge/toolkits/lop.json` (committed, edit)
- `_mcp_server/src/features/resources/types.ts` (reference only — Zod schemas)
