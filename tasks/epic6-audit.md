# Epic 6 — Module Sync Audit

## Shared files: `modules/` (root) vs `_mcp_server/td/modules/` (submodule)

| File | Status | Leading side | Classification | Notes |
|------|--------|-------------|----------------|-------|
| `mcp/__init__.py` | **absent** in submodule | root | manual | Submodule has no `mcp/__init__.py` |
| `mcp/controllers/__init__.py` | style-only | root | manual | `__all__` ordering differs |
| `mcp/controllers/api_controller.py` | **divergent-behaviour** | root | manual | Root: 428 lines, +Protocol complet, +new methods. Sub: 380 lines |
| `mcp/controllers/openapi_router.py` | divergent (style + import order) | root | manual | Root: `traceback` at top, modern `str \| None`. Sub: tabs, `Optional[str]` |
| `mcp/controllers/generated_handlers.py` | divergent | generated | generated | Gitignored in submodule (`**/generated_handlers.py`). Root copy is sole persisted version |
| `mcp/services/__init__.py` | style-only | root | manual | Spaces vs tabs only |
| `mcp/services/api_service.py` | **divergent-behaviour** | root | manual | Root: 2451 lines (+lint_dat, +validate_glsl_dat, +completion, +glslang). Sub: 756 lines |
| `mcp/services/completion/__init__.py` | **absent** in submodule | root | manual | Entire completion/ directory is new |
| `mcp/services/completion/builtin_stubs.py` | **absent** in submodule | root | manual | |
| `mcp/services/completion/context_aggregator.py` | **absent** in submodule | root | manual | |
| `mcp/services/completion/indexer.py` | **absent** in submodule | root | manual | |
| `mcp/services/completion/scan_script.py` | **absent** in submodule | root | manual | |
| `mcp_webserver_script.py` | style-only | root | manual | Tabs vs spaces, `str(e)` vs `e!s` |
| `utils/config.py` | style-only | root | manual | Spaces vs tabs only |
| `utils/error_handling.py` | divergent (style + imports) | root | manual | Root: `collections.abc.Callable`, modern syntax. Sub: `typing.Callable`, `Optional`, tabs |
| `utils/logging.py` | divergent (style + imports) | root | manual | Root: `TextIO \| None`, spaces. Sub: `Optional[TextIO]`, tabs |
| `utils/result.py` | divergent (style + types) | root | manual | Root: `dict[str, Any] \| None`. Sub: `Optional[dict[str, Any]]`, tabs |
| `utils/serialization.py` | style-only | root | manual | Spaces vs tabs, minor formatting |
| `utils/types.py` | divergent (style + types) | root | manual | Root: `StrEnum`, `Required[bool]`, spaces. Sub: `TypedDict`, tabs |
| `utils/utils_logging.py` | divergent (style + types) | root | manual | Root: `LogLevel \| str`, spaces. Sub: tabs, older syntax |
| `utils/version.py` | divergent (value) | submodule | manual | Root: `1.5.0`. Sub: `1.5.0-td.1`. Driven by submodule `package.json` |

## Files only in root (not shared)

| File | Classification | Notes |
|------|----------------|-------|
| `td.pyi` | test-only | Type stubs for testing |
| `td_helpers/__init__.py` | manual | TD-specific helpers, not part of MCP server |
| `td_helpers/layout.py` | manual | TD layout helpers |
| `td_helpers/network.py` | manual | TD network helpers |
| `tests/*` (17 files) | test-only | Full test suite, root-only |
| `td_server/openapi_server/*` (50+ files) | generated | OpenAPI-generated Flask server |

## Files only in submodule (not shared)

| File | Classification | Notes |
|------|----------------|-------|
| `td_server/openapi_server/openapi/openapi.yaml` | generated | Only tracked file in td_server — identical both sides |

## Key findings

1. **Every shared file differs** — no file is byte-identical between root and submodule
2. **Root has ~1700 more lines** of functional code in `api_service.py` alone
3. **Style divergence is universal**: root uses spaces + modern syntax (`str | None`, `StrEnum`), submodule uses tabs + legacy syntax (`Optional[str]`)
4. **`completion/` directory** (5 files) exists only in root — major feature gap
5. **`generated_handlers.py`** is gitignored in submodule — root is sole persistent copy
6. **`version.py`** is the only file where submodule leads (driven by `package.json`)
