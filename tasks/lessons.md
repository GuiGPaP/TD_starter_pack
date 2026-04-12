# Lessons Learned

Patterns and corrections captured during work sessions. Review at session start.

## Runtime

- `exec_python_script` injects `parent` as a **string path**, not an OP object. Always use `base = op('/project1/base1')` instead of `parent.create()`.
- Error cache updates on frame boundaries — check errors in a separate `execute_python_script` call after fixing.

## TD Python via MCP

- `create()` takes **string** type names (`'geometryCOMP'`), not class references (`geometryCOMP`). Classes are not in the MCP script namespace.
- `allowCooking = False` only works on COMPs. Check `isCOMP` before setting.
- `root` is not defined — use `op('/')` to access project root.
- `/project1` may not exist — projects can use `/ProjectName` or other names. Always verify.
- `findChildren()` from `/` doesn't traverse privacy-flagged COMPs. Scan each top-level container separately.
- COMP input connectors don't accept DAT connections. Use COMP parameters (`par.dat = path`) or internal `in1` instead.
- `opviewerTOP.par.opviewer` (not `par.comp`). Never guess parameter names — verify with `[p.name for p in op.pars()]`.
- `geometryCOMP` creates a default `torus1` SOP inside. Delete it if unwanted.
- `td.Page` objects are unhashable — convert with `str(p.page)` before using as dict keys.
- `Exception` may be undefined in very long MCP scripts. Use preventive checks instead of try/except.
- MCP security analyzer uses regex: `read-only` blocks `.eval()` even in `par.Mypar.eval()`. Use `safe-write` mode.
- Script output must be assigned to `result` variable. MCP expects `{ result: T }`.
- `get_performance` Cook Rate was `project.cookRate` (target, always 60). Fixed: now reads real FPS from `/mcp_webserver_base/_perf_monitor` Perform CHOP. Always verify FPS with perform CHOP, never trust cook rate alone.
- MCP tox includes `_perf_monitor` (performCHOP) + `_perf_trail` (trailCHOP, 5s window). `get_performance` returns trail stats (avg/min/max/p95/stddev) for FPS, frame time, CPU, drops, GPU mem.

## Threading & Performance

- TD's built-in ThreadManager (`/sys/TDResources/threadManager`) works for async subprocess. Use `EnqueueTask()` directly — skip the Palette `threadManagerClient` comp.
- SuccessHook/ExceptHook callbacks fire correctly on the main thread. Previous "SuccessHook broken" lesson was wrong — the issue was MCP pulse routing, not ThreadManager.
- Worker threads must NOT touch TD ops (no `op()`, `par`, `comp`). Pass data back via `threading.Lock`-protected attributes.
- MCP `update_td_node_parameters` pulse doesn't reliably trigger parexec callbacks. Call `ext.setupAndRun()` or `ext.method()` directly via `execute_python_script`.
- Use `PollStatusAsync()` for periodic polling, `PollStatus()` only for immediate post-Up/Down refresh.

## TOP Bypass & Instancing

- `allowCooking` only works on COMPs, not TOPs. Use `op.bypass = True` to prevent TOP cooking.
- Bypass compositing/mask chain per preset via `_toggle_cooking()` in frame_exec — check `_prev_preset` to avoid redundant toggles.
- `numpyArray()` returns Y-flipped data (OpenGL origin). Always `[::-1]` when mapping to canvas coords.

## POP Rendering (TDPretextPop v3)

- **textPOP in specdat mode** generates ~100 triangles/char (vector mesh). UNUSABLE for 1000+ chars (4 FPS at 8K chars).
- **GLSL Copy POP + atlas** is the correct POP-native approach: 2 tri/char, zero poptoSOP, 25 FPS at 18K chars (vs 10 FPS with poptoSOP).
- GLSL Copy POP: `TDIn_*` only works for attrs on BOTH inputs. For input 1 custom attrs, use **POP Buffers** page (`buffer0pop/attr/name`) + `TDBuffer_name(copyIndex)` in shader.
- GLSL Copy POP: output arrays use POP names (`Color` not `Cd`). Create missing attrs via Create Attributes page (menu values: `color`, `tex`, `n`, `pointscale`).
- GLSL Copy POP: `Tex` is a VERTEX attribute, not point. Default vertex compute doesn't propagate it. Workaround: compute UVs from `gl_VertexID % 4` in GLSL MAT vertex shader.
- GLSL MAT: a corrupted/reconfigured glslMAT can silently fail (black screen, no errors). Fix: delete and recreate from scratch.
- dattoPOP: `par.attr` sequence count can't be reliably set. Blocks with empty `columns` produce "no column found" warnings.
- Geometry COMP `material` parameter has NO effect on POP direct rendering (black screen). POPs use their own built-in renderer.
- POP instancing DOES work: set `instanceop` to the POP, BUT use POP attribute syntax: `P(0)`, `Color(0)` (not `Cd(0)`). Custom attrs by their POP name (e.g., `fontheight`, `pscale`). `P(N)` cannot be reused for scale — store fontsize in a separate POP attribute.
- For GLSL MAT + POP text rendering: use SOP instancing (rectangleSOP template) with POP as instance source. SOP provides UVs (`uv[0].st`), POP provides per-instance position/scale/color/custom. This is the correct architecture.
- GLSL MAT vertex shader: use `Cd` for instance color (via `instancecolormode: replace`), use `TDInstanceCustomAttrib0()` for custom instance data. `TDInstanceColor()` does NOT exist.
- DAT-based instancing (instanceop=tableDAT) parses strings per frame — SLOWER than POP/SOP (34 FPS vs 60 FPS with 9K instances). Avoid.

## Atlas & Text Rendering

- **Preloaded atlas fast path**: When `Atlascharset != 'dynamic'`, text changes must NOT trigger `atlas_top.cook(force=True)`. Only update word widths (~0.2ms). Full atlas rebuild = ~500ms+ for 200+ slices.
- **Charset preloading union**: Always include text chars in addition to preset chars (`dict.fromkeys(preset + text)`). Never drop a character the text actually uses.
- **Separate watchers by concern**: `text_watcher` (datexecDAT) for text content changes, `charset_watcher` (parexecDAT) for mode/font changes. Different triggers = different rebuild strategies.

## Skills

- Skill frontmatters must have mutually exclusive triggers — no overlap between td-guide, td-glsl, td-glsl-vertex, td-pops.
- MCP tool names (e.g., `get_td_nodes`) differ from OpenAPI operationIds (e.g., `get_nodes`). Document the MCP-facing names, not the internal ones.
