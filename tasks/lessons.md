# Lessons Learned

Patterns and corrections captured during work sessions. Review at session start.

## Runtime

- `exec_python_script` injects `parent` as a **string path**, not an OP object. Always use `base = op('/project1/base1')` instead of `parent.create()`.
- Error cache updates on frame boundaries — check errors in a separate `execute_python_script` call after fixing.

## Skills

- Skill frontmatters must have mutually exclusive triggers — no overlap between td-guide, td-glsl, td-glsl-vertex, td-pops.
- MCP tool names (e.g., `get_td_nodes`) differ from OpenAPI operationIds (e.g., `get_nodes`). Document the MCP-facing names, not the internal ones.
