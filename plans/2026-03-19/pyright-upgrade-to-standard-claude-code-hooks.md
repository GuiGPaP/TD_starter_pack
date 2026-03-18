<!-- session_id: 43d75924-d04d-458c-b5d5-954017da7299 -->
# Pyright Upgrade to Standard + Claude Code Hooks

## Context

The project uses pyright in `basic` mode, which misses real bugs that AI agents introduce (None access, missing return paths, incompatible overrides). The 11 current errors all stem from an incomplete `td.pyi` stub — fixable without touching production code. The user also wants Claude Code hooks to run ruff on every Write/Edit and pyright on Stop, creating an automated quality loop during agentic coding sessions.

## Step 1: Extend `td.pyi` (eliminate 11 errors)

**File:** `modules/td.pyi`

Add missing attributes to the `OP` class and two helper types. Pattern follows `modules/tests/fake_td.py` (FakeChop, FakeTableDat, FakeChannel, FakeCell).

Add before `OP` class:
```python
class _Channel:
    name: str
    vals: list[float]

class _Cell:
    val: str
```

Add to `OP` class body:
```python
# Navigation
def parent(self) -> OP | None: ...
family: str

# CHOP attributes (polymorphic — td.op() returns any family)
numChans: int
numSamples: int
sampleRate: float
def chan(self, index: int | str) -> _Channel | None: ...

# DAT attributes
numRows: int
numCols: int
def __getitem__(self, key: tuple[int, int]) -> _Cell | None: ...

# COMP attributes
extensions: list[object]
children: list[OP]

# Layout (used by td_helpers)
nodeX: int
nodeY: int
nodeWidth: int
nodeHeight: int
viewer: bool
display: bool
render: bool
docked: list[OP]
```

**Verify:** `uv run pyright` -> 0 errors

## Step 2: Upgrade pyright config to `standard`

**File:** `pyproject.toml` — replace `[tool.pyright]` section

```toml
[tool.pyright]
pythonVersion = "3.11"
include = ["modules"]
exclude = [
  "modules/td_server/openapi_server",
  "modules/mcp/controllers/generated_handlers.py",
]
typeCheckingMode = "standard"

# td.pyi is a stub-only module (no .py source) — expected
reportMissingModuleSource = "none"
# connexion/Flask lack type stubs
reportMissingTypeStubs = "none"
```

Key changes from current:
- `basic` -> `standard`
- Remove `modules/tests` from exclude (tests validate API contracts)
- `reportMissingImports = "warning"` -> removed (standard default is `error`, which is correct)
- Add `reportMissingModuleSource = "none"` (handles td.pyi cleanly)
- Add `reportMissingTypeStubs = "none"` (silences connexion/Flask)

**Verify:** `uv run pyright` -> triage new errors. If Unknown noise from tests (MagicMock), add targeted suppressions.

## Step 3: Fix any new `standard` mode errors

Cannot preview exact count without applying config. Expected sources:
- **Tests:** MagicMock returns `Unknown` — if noisy, add `reportUnknownMemberType = "none"` or per-file ignore
- **api_service.py:** `ops: Any` / `project: Any` in td.pyi may trigger Unknown chains — tighten stubs or suppress

Strategy: fix real errors, suppress cosmetic noise, document suppressions.

## Step 4: Create Claude Code project hooks

**File:** `.claude/settings.json` (new)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'f=$(jq -r \".tool_input.file_path // empty\"); [[ \"$f\" == *.py && \"$f\" == */modules/* ]] && uv run ruff check --fix \"$f\" && uv run ruff format \"$f\" || true'",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "uv run pyright 2>&1 | tail -3",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

Design decisions:
- **ruff on Write/Edit** (29ms) — fast enough per-edit, auto-fixes lint + formats
- **pyright on Stop** (1.4s) — too slow per-edit, fine at session end
- **Path guard** — only `.py` files under `modules/` trigger ruff
- **`|| true`** — hook never blocks Claude; lefthook enforces at commit time
- **jq** — available at `/usr/bin/jq` (verified), parses stdin JSON from hook

## Step 5: Verify end-to-end

1. `uv run pyright` -> 0 errors (or only documented suppressions)
2. `uv run ruff check modules/` -> all checks passed
3. `uv run pytest` -> 193 tests pass (stubs are type-only, no runtime impact)
4. Edit a `.py` file in modules/ -> confirm ruff runs automatically
5. End session -> confirm pyright summary appears in Stop hook output

## Critical files

| File | Action |
|------|--------|
| `modules/td.pyi` | Extend OP class with ~15 missing attributes/methods |
| `pyproject.toml` | Upgrade pyright section (lines 56-65) |
| `.claude/settings.json` | Create with PostToolUse + Stop hooks |
| `modules/tests/fake_td.py` | Reference only (pattern for td.pyi) |
| `modules/mcp/services/api_service.py` | Verify stays clean (sole error source) |
