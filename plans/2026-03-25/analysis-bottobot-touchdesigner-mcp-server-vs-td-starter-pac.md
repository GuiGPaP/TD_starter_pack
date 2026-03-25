<!-- session_id: 0c75190d-422d-4825-afc2-4fdcaab898e0 -->
# Analysis: bottobot/touchdesigner-mcp-server vs TD_starter_pack

## Context

Compare the **bottobot** MCP server (pure offline documentation, 21 tools, no live TD connection) against our **TD_starter_pack** MCP server (57+ tools, live TD connection + offline knowledge bases) to identify missing features worth adopting.

---

## Key Architectural Difference

| | bottobot | TD_starter_pack |
|---|---|---|
| Connection | None — pure offline docs | Live HTTP to TD instance |
| Data source | 630 pre-scraped JSON files | Live TD queries + local knowledge bases |
| Transport | stdio only | stdio + HTTP bridge to TD |
| Deployment | `npm install -g` | Submodule inside .toe project |

**bottobot is a documentation server. We are a live control + documentation server.** They solve different problems but their offline knowledge can complement ours.

---

## Features We're MISSING (from bottobot)

### 1. Workflow Suggestion Engine
**Tools:** `suggest_workflow`, `get_operator_connections`
**What it does:** Given an operator, suggests what typically connects downstream. Uses 32 workflow patterns + 72 transitions from a `patterns.json` file. `get_operator_connections` provides wiring guides for 20+ operators with **exact port numbers** and rationale.
**Value:** HIGH — this is genuinely useful for LLMs building networks. We create nodes but don't guide *what to wire next*.

### 2. Tutorial System
**Tools:** `get_tutorial`, `list_tutorials`, `search_tutorials`
**What it does:** 14 curated tutorials with sections, code examples, and links. Full-text search across tutorial content.
**Value:** MEDIUM — useful for learning workflows but our skills (td-guide, td-glsl, etc.) partially fill this role. Our lessons system also covers patterns/pitfalls.

### 3. TD Version History
**Tools:** `get_version_info`, `list_versions`
**What it does:** Details for each stable TD release (099→2024): bundled Python version, new operators, features, breaking changes. Version timeline comparison.
**Value:** MEDIUM — useful for version-aware code generation. We already pass `version` filters in `search_operators` and `compare_operators` but don't have a dedicated version info tool.

### 4. Network Templates
**Tool:** `get_network_template`
**What it does:** 5 ready-to-use network blueprints (video-player, generative-art, audio-reactive, data-visualization, live-performance). Each includes operator lists, connection tables, parameter settings, and **Python generation scripts**.
**Value:** HIGH — great for bootstrapping common TD setups. We have `create_geometry_comp` and `create_feedback_loop` as individual helpers, but no full network templates.

### 5. Experimental Build Tracking
**Tools:** `get_experimental_build`, `list_experimental_builds`
**What it does:** Tracks 6 experimental build series (2020.20000→2025.10000) with features, breaking changes, new Python API additions. Filter by feature area and graduation status.
**Value:** LOW — niche use case, experimental builds change constantly.

### 6. Experimental Techniques Library
**Tools:** `get_experimental_techniques`, `search_experimental`
**What it does:** 7 categories (GLSL, GPU compute, ML, generative, audio-visual, networking, Python advanced) with difficulty ratings, code snippets, operator chains.
**Value:** MEDIUM — overlaps with our GLSL patterns + lessons system, but broader scope (ML, networking, Python advanced are not covered by our patterns).

### 7. Dedicated Operator Examples
**Tool:** `get_operator_examples`
**What it does:** Per-operator Python code examples, expressions, and usage patterns.
**Value:** MEDIUM — our operator knowledge base has some examples but not as a dedicated, searchable tool.

### 8. List Operators (simple)
**Tool:** `list_operators`
**What it does:** Plain listing of all operators by category/family.
**Value:** LOW — our `search_operators` with empty query could serve this purpose.

---

## Features We HAVE That They DON'T

For context, here's what makes our server significantly more capable:

- **Live TD control**: create, modify, delete, wire nodes in real-time
- **DAT code quality**: lint, format, typecheck, GLSL validate
- **Python script execution** with security modes (read-only/safe-write/full-exec)
- **GLSL pattern deployment** (not just viewing — actually creates operators)
- **Asset library** with .tox deployment
- **Palette integration** with indexing and loading
- **Project catalogue** (package, scan, search)
- **Lessons-learned** knowledge system (capture, search, auto-detect)
- **Third-party toolkit** detection (T3D, LOPs, POPx)
- **Project indexing** and context-aware code completion
- **Operator autocomplete** (complete_op_paths)
- **CHOP/DAT/COMP introspection** (channels, tables, extensions)
- **Higher-level helpers** (geometry comp, feedback loop, instancing)

---

## Prioritized Recommendations

| Priority | Feature | Effort | Approach |
|---|---|---|---|
| **P1** | Workflow suggestions + operator connections | Medium | Add `patterns.json` with common workflow chains. New tool `suggest_workflow` that returns next-step suggestions. Could also enrich `search_operators` results with connection hints. |
| **P1** | Network templates | Medium | Add 5-10 template JSON files. New tool `get_network_template` + `deploy_network_template` (we can actually *deploy* them live, unlike bottobot). |
| **P2** | Techniques library | Medium | Extend our knowledge base to cover ML/networking/advanced-Python patterns beyond GLSL. Could be merged into the lessons system or be a separate knowledge vertical. |
| **P2** | Operator examples | Low | Enrich operator knowledge entries with dedicated `examples` field. Maybe add `get_operator_examples` tool or extend `search_operators` response. |
| **P3** | Version history | Low | Static JSON data file with TD version timeline. Useful but not critical. |
| **P3** | Tutorial system | Medium | Could curate tutorials or link to official docs. Our skills already cover most tutorial ground. |
| **P4** | Experimental builds | Low | Very niche, low ROI. |

---

## Verification

To validate this analysis:
1. Check bottobot's `data/` directory structure for exact data file counts
2. Compare our operator knowledge base coverage vs their 630 operator files
3. Review their `patterns.json` for workflow quality before adopting the approach
