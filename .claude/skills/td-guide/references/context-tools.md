# Project Context Tools — Detailed Reference

## index_td_project (Global / Cheap)

```
index_td_project(rootPath="/project1", mode="compact")
```

Returns Markdown with:
- **Builtins Anti-Erreurs**: Correct parameter names, class attributes, td module functions
- **Project Structure**: Operator tree table (path, OPType, family)
- **Extensions**: Which COMPs have extensions and their methods
- **Custom Parameters**: Custom pars per COMP
- **Shortcuts**: Project path shortcuts
- **Warnings**: Active errors in the network

Parameters:
- `rootPath` (default: `/project1`) — root operator to scan from
- `maxDepth` (default: 10) — how deep to walk the tree
- `opLimit` (default: 500) — hard cap on operators scanned
- `mode` (`compact` | `full`) — compact for quick context, full for detail

Save the result to `td_project_context.md` at repo root for persistence across conversations.

## get_td_context (Local / Expensive)

```
get_td_context(nodePath="/project1/geo1", include=["parameters", "extensions", "errors"])
```

Returns aggregated facets for one node:
- `parameters` — full parameter schema (names, types, ranges, menus)
- `channels` — CHOP channel names and stats
- `tableInfo` — DAT dimensions and sample rows
- `extensions` — extension methods with docstrings
- `children` — child operators
- `errors` — active error messages
- `datText` — DAT text content

Parameters:
- `nodePath` (required) — absolute path to the target node
- `include` (optional) — list of facets to fetch; omit for all

Each facet is fetched independently — if one fails, the others still return.

## Decision Matrix

| Need | Tool |
|------|------|
| "What operators exist in this project?" | `index_td_project` |
| "What extensions does this COMP have?" | `index_td_project` (overview) or `get_td_context` (with docs) |
| "What parameters does this operator accept?" | `get_td_context(include=["parameters"])` |
| "What channels does this CHOP output?" | `get_td_context(include=["channels"])` |
| "Is there an error on this node?" | `get_td_context(include=["errors"])` |
| "What's the content of this DAT?" | `get_td_context(include=["datText"])` |
| Just need one specific thing | Use the individual tool directly (`get_node_parameter_schema`, `get_chop_channels`, etc.) |
