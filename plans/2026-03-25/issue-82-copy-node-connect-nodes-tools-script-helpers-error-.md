<!-- session_id: 784494b1-bc97-4e53-9e05-ab5b4402980b -->
# Issue #82 — `copy_node`, `connect_nodes` tools + script helpers + error reporting

## Context

Session #81 (LOPs guide) revealed that 95% of operations used `execute_python_script` because 3 fundamental primitives are missing: copy, connect, and reusable helpers. This issue adds typed tools for copy/connect, injects helper functions into the exec namespace, and improves error reporting with full tracebacks.

## Scope

4 deliverables, ordered by dependency:

1. **`copy_node` tool** — full pipeline (Python → OpenAPI → codegen → TS)
2. **`connect_nodes` tool** — same pipeline
3. **Script helpers** — Python module injected into `exec_python_script` namespace
4. **Error reporting** — traceback + line numbers in exec errors

---

## Step 1: Python service methods

**File:** `modules/mcp/services/api_service.py`

### 1a. `copy_node(self, source_path, target_parent_path, name=None, x=None, y=None) -> Result`

- Validate: source exists, target is COMP (`isCOMP`), name not taken
- Use `target.copy(source, name=name)`
- Set `nodeX`/`nodeY` if provided
- Return `success_result({"result": self._get_node_summary(copied_node)})`

### 1b. `connect_nodes(self, from_path, to_path, from_output=0, to_input=0) -> Result`

- Validate: both exist, same family (or both COMPs), index in bounds
- `to_node.inputConnectors[to_input].connect(from_node.outputConnectors[from_output])`
- Return `success_result({"from": ..., "to": ..., "fromOutput": ..., "toInput": ..., "family": ...})`

### 1c. Add signatures to `IApiService` protocol

---

## Step 2: OpenAPI schema

### 2a. New file: `_mcp_server/src/api/paths/api/nodes/copy.yml`

POST endpoint, operationId `copy_node`, body: `{sourcePath, targetParentPath, name?, nodeX?, nodeY?}`, response reuses `TdNode` schema shape (same as `create_node` 200 response).

### 2b. New file: `_mcp_server/src/api/paths/api/nodes/connect.yml`

POST endpoint, operationId `connect_nodes`, body: `{fromPath, toPath, fromOutput?, toInput?}`, response: `{from, to, fromOutput, toInput, family}`.

### 2c. Update `_mcp_server/src/api/index.yml`

Add paths:
```yaml
/api/nodes/copy:
  $ref: ./paths/api/nodes/copy.yml
/api/nodes/connect:
  $ref: ./paths/api/nodes/connect.yml
```

### 2d. Update flat `modules/td_server/openapi_server/openapi/openapi.yaml`

Add compiled equivalent of the two routes + bump version.

---

## Step 3: Run codegen

```bash
cd _mcp_server
npm run gen          # orval → TS types + Zod schemas + API functions
node scripts/genHandlers.js  # → regenerate generated_handlers.py
```

This produces:
- `src/gen/endpoints/TouchDesignerAPI.ts` — `copyNode()`, `connectNodes()` + types
- `src/gen/mcp/touchDesignerAPI.zod.ts` — `CopyNodeBody`, `ConnectNodesBody` Zod schemas
- `td/modules/mcp/controllers/generated_handlers.py` — Python handlers

---

## Step 4: TS client wrapper

**File:** `_mcp_server/src/tdClient/touchDesignerClient.ts`

Add `copyNode(params)` and `connectNodes(params)` methods + update `ITouchDesignerApi` interface and `defaultApiClient` with the generated imports.

---

## Step 5: Constants + metadata

**File:** `_mcp_server/src/core/constants.ts`

```typescript
COPY_NODE: "copy_node",
CONNECT_NODES: "connect_nodes",
```

**File:** `_mcp_server/src/features/tools/metadata/touchDesignerToolMetadata.ts` (if exists)

Add metadata entries for both tools.

---

## Step 6: Formatters

**File:** `_mcp_server/src/features/tools/presenter/operationFormatter.ts`

- `formatCopyNodeResult()` — reuse `formatCreateNodeResult` pattern (same data shape)
- `formatConnectNodesResult()` — new, shows from→to connection info

Export from `presenter/index.ts`.

---

## Step 7: Tool registration

**File:** `_mcp_server/src/features/tools/handlers/tdTools.ts`

Two new `server.tool()` registrations with:
- Zod schemas extending generated body + `detailOnlyFormattingSchema`
- `withLiveGuard` wrapper
- Formatter calls
- `handleToolError` for errors

---

## Step 8: Script helpers

**New file:** `modules/td_helpers/mcp_helpers.py`

```python
safe_copy(source_path, target_parent_path, name=None)
connect(from_path, to_path, from_output=0, to_input=0)
find_by_tag(tag, parent_path="/")
safe_destroy(path)
get_or_create(parent_path, op_type, name)
```

**File:** `modules/mcp/services/api_service.py` — `exec_python_script` method

Inject into namespace as `types.SimpleNamespace` under `helpers`:
```python
local_vars["helpers"] = SimpleNamespace(safe_copy=..., connect=..., ...)
```

Scripts use: `helpers.safe_copy("/project1/geo1", "/project1/container1")`

---

## Step 9: Error reporting

**File:** `modules/mcp/services/api_service.py` — `exec_python_script` method

Replace bare `str(error)` with:
```python
tb = traceback.format_exc()
error_msg = f"Script execution failed: {error!s}\n\nTraceback:\n{tb}\n\nScript:\n{numbered_lines}"
return error_result(error_msg)
```

Apply to both `eval()` and `exec()` error paths.

---

## Step 10: Sync submodule

Copy modified Python files to `_mcp_server/td/modules/` (if not symlinked). Verify `td_helpers/` is accessible in TD's Python path.

---

## Step 11: Tests + lint + build

```bash
cd _mcp_server && npm run build && npm run lint && npm test
cd .. && just check  # if applicable
```

---

## Verification

1. `npm run build` passes in `_mcp_server/`
2. `npm run lint` passes
3. `npm test` passes
4. With TD running: call `copy_node` via MCP → node appears in TD
5. With TD running: call `connect_nodes` → connection visible
6. `execute_python_script` with `helpers.safe_copy(...)` works
7. Intentional script error returns full traceback with line numbers

## Critical files

| File | Action |
|------|--------|
| `modules/mcp/services/api_service.py` | Add 2 methods + error reporting + helper injection |
| `modules/td_helpers/mcp_helpers.py` | **New** — helper functions |
| `_mcp_server/src/api/index.yml` | Add 2 path refs |
| `_mcp_server/src/api/paths/api/nodes/copy.yml` | **New** — OpenAPI for copy_node |
| `_mcp_server/src/api/paths/api/nodes/connect.yml` | **New** — OpenAPI for connect_nodes |
| `modules/td_server/openapi_server/openapi/openapi.yaml` | Add compiled routes |
| `_mcp_server/src/core/constants.ts` | Add 2 tool name constants |
| `_mcp_server/src/tdClient/touchDesignerClient.ts` | Add 2 client methods |
| `_mcp_server/src/features/tools/handlers/tdTools.ts` | Register 2 tools |
| `_mcp_server/src/features/tools/presenter/operationFormatter.ts` | Add 2 formatters |
