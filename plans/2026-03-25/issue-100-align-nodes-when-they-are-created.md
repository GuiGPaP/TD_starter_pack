<!-- session_id: 784494b1-bc97-4e53-9e05-ab5b4402980b -->
# Issue #100 — Align nodes when they are created

## Context

Current auto-positioning is naive: new nodes land 200px to the right of the rightmost sibling, Y-aligned to the first sibling. This creates long horizontal chains with no structure. Issue #100 asks for:
1. **Smarter auto-positioning** at creation time
2. **A `layout_nodes` tool** to reorganize existing nodes after the fact

## Deliverable 1: Improved auto-positioning in `create_node` / `copy_node`

**File:** `modules/mcp/services/api_service.py`

Replace the naive "rightmost + 200" logic with a smarter algorithm:

### Algorithm: context-aware placement

```
If explicit x,y provided → use them (no change)
If no siblings → place at (0, 0) (no change)
If siblings exist:
  1. Find the rightmost sibling (max nodeX)
  2. Check if the rightmost sibling has a free output connector
     - If yes → place 200px to its right, same Y (chain continuation)
     - If no → place below the top row (new row), aligned to leftmost X
  3. Grid-snap: round nodeX/nodeY to nearest multiple of 50
```

The grid-snap ensures consistent alignment regardless of how nodes were placed.

### Extract to helper

Move auto-positioning logic to `modules/td_helpers/layout.py` as:

```python
def auto_position(parent, new_node, spacing_x=200, spacing_y=150, grid=50):
    """Position a new node intelligently within parent COMP."""
```

This keeps `api_service.py` thin and makes the logic testable/reusable.

Both `create_node` and `copy_node` call `auto_position(parent, new_node)` when x/y are not provided.

---

## Deliverable 2: `layout_nodes` MCP tool

New tool to reorganize existing nodes. Full pipeline: Python → OpenAPI → codegen → TS.

### Tool signature

```
layout_nodes(
  paths: string[]         — node paths to lay out
  mode: "horizontal" | "vertical" | "grid"  — layout mode (default: "horizontal")
  spacing?: number        — override spacing (default: 200 for H, 150 for V)
  startX?: number         — anchor X (default: leftmost node's current X)
  startY?: number         — anchor Y (default: topmost node's current Y)
)
```

Returns: `{ nodes: [{path, nodeX, nodeY}], mode, spacing }`

### Layout modes

- **horizontal**: left-to-right chain, same Y, `spacing` px apart. Uses `chain_ops` logic.
- **vertical**: top-to-bottom stack, same X, `spacing` px apart. Uses `place_below` logic + `get_bounds` for docked ops.
- **grid**: fill a grid row by row, `Math.ceil(sqrt(n))` columns. Spacing applied both axes.

### Python service method

**File:** `modules/mcp/services/api_service.py`

```python
def layout_nodes(self, paths: list[str], mode: str = "horizontal",
                 spacing: int | None = None, start_x: int | None = None,
                 start_y: int | None = None) -> Result:
```

Validation:
- All paths exist and are valid
- All nodes share the same parent (can't layout across COMPs)
- At least 2 nodes

Implementation delegates to layout helpers in `layout.py`.

### New layout helper

**File:** `modules/td_helpers/layout.py`

```python
def layout_horizontal(nodes, spacing=200, start_x=None, start_y=None):
def layout_vertical(nodes, spacing=150, start_x=None, start_y=None):
def layout_grid(nodes, spacing_x=200, spacing_y=150, start_x=None, start_y=None, cols=None):
```

Each returns list of `(node, x, y)` tuples. Uses `get_bounds` + `move_with_docked` for docked op handling.

---

## Implementation steps

### Step 1: Layout helpers in `layout.py`

Add `auto_position`, `layout_horizontal`, `layout_vertical`, `layout_grid` to `modules/td_helpers/layout.py`. Update `__init__.py` exports.

### Step 2: Improve create_node / copy_node auto-positioning

Replace inline positioning in `api_service.py` with `auto_position()` call. Both methods.

### Step 3: Python service method `layout_nodes`

Add to `api_service.py` + `IApiService` protocol.

### Step 4: OpenAPI schema

- New file: `_mcp_server/src/api/paths/api/nodes/layout.yml` — POST endpoint
- Update `_mcp_server/src/api/index.yml`
- Update flat `openapi.yaml` (both copies) + bump version to 1.7.0

### Step 5: Codegen

```bash
node td/genHandlers.js && npx orval --config ./orval.config.ts
```

### Step 6: TS pipeline

- `constants.ts`: add `LAYOUT_NODES: "layout_nodes"`
- `touchDesignerClient.ts`: add `layoutNodes()` method
- `operationFormatter.ts`: add `formatLayoutNodesResult()`
- `presenter/index.ts`: export
- `tdTools.ts`: register `server.tool(TOOL_NAMES.LAYOUT_NODES, ...)`
- `touchDesignerClient.mock.test.ts`: add mock

### Step 7: Sync + build + test

- Copy `api_service.py` + `generated_handlers.py` to both `modules/` and `_mcp_server/td/modules/`
- `tsc --noEmit`, `biome check`, `ruff check`, `vitest run`

---

## Critical files

| File | Action |
|------|--------|
| `modules/td_helpers/layout.py` | Add 4 layout functions |
| `modules/td_helpers/__init__.py` | Export new functions |
| `modules/mcp/services/api_service.py` | Refactor auto-position + add layout_nodes |
| `_mcp_server/src/api/paths/api/nodes/layout.yml` | **New** — OpenAPI |
| `_mcp_server/src/api/index.yml` | Add path ref |
| `_mcp_server/td/modules/td_server/.../openapi.yaml` | Add route + schemas |
| `_mcp_server/src/core/constants.ts` | Add LAYOUT_NODES |
| `_mcp_server/src/tdClient/touchDesignerClient.ts` | Add client method |
| `_mcp_server/src/features/tools/handlers/tdTools.ts` | Register tool |
| `_mcp_server/src/features/tools/presenter/operationFormatter.ts` | Add formatter |

## Verification

1. `tsc --noEmit` + `biome check` + `ruff check` — clean
2. `vitest run` — all pass
3. Live test: create 5 TOPs → `layout_nodes` horizontal → check alignment
4. Live test: create nodes without x/y → verify grid-snapped auto-position
5. Live test: `layout_nodes` grid mode with 9 nodes → 3x3 grid
