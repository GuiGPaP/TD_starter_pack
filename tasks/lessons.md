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

## Threading & Performance

- TD's built-in ThreadManager (`/sys/TDResources/threadManager`) works for async subprocess. Use `EnqueueTask()` directly — skip the Palette `threadManagerClient` comp.
- SuccessHook/ExceptHook callbacks fire correctly on the main thread. Previous "SuccessHook broken" lesson was wrong — the issue was MCP pulse routing, not ThreadManager.
- Worker threads must NOT touch TD ops (no `op()`, `par`, `comp`). Pass data back via `threading.Lock`-protected attributes.
- MCP `update_td_node_parameters` pulse doesn't reliably trigger parexec callbacks. Call `ext.setupAndRun()` or `ext.method()` directly via `execute_python_script`.
- Use `PollStatusAsync()` for periodic polling, `PollStatus()` only for immediate post-Up/Down refresh.

## Skills

- Skill frontmatters must have mutually exclusive triggers — no overlap between td-guide, td-glsl, td-glsl-vertex, td-pops.
- MCP tool names (e.g., `get_td_nodes`) differ from OpenAPI operationIds (e.g., `get_nodes`). Document the MCP-facing names, not the internal ones.
