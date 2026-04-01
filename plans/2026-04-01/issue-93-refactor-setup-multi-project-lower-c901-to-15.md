<!-- session_id: 156ca310-d95d-497e-b72a-d844fe45306f -->
# Issue 93 — Refactor `_setup_multi_project` & lower C901 to 15

## Context

Phase 1 complexity work is done. The only blocker to lowering Python max-complexity from 18 to 15 is `_setup_multi_project` in `TDDocker/python/td_docker/td_docker_ext.py` (McCabe 16). All other code in both `modules/` and `TDDocker/python/` already passes at 15.

## Step 1 — Refactor `td_docker_ext.py`

**File:** `TDDocker/python/td_docker/td_docker_ext.py`

### 1a. Add `_find_page(name)` helper (before `_setup_multi_project`, ~line 147)

Deduplicates the 3 identical page-finding `for` loops:

```python
def _find_page(self, name: str):
    """Return the custom page with *name*, or ``None``."""
    for page in self.ownerComp.customPages:
        if page.name == name:
            return page
    return None
```

### 1b. Extract 5 `_ensure_*` methods — truly idempotent

Not verbatim extraction: `_ensure_action_pulses` and `_ensure_library_page` must check each parameter individually, not rely on a single sentinel. This prevents partial-setup states (e.g. crash mid-setup leaves `Removeproject` but not `Upall`).

| Method | Key idempotency check | Complexity |
|--------|----------------------|-----------|
| `_ensure_projects_table()` | `op("projects")` exists → skip | 2 |
| `_ensure_active_project_menu()` | `hasattr(par, "Activeproject")` → skip | 3 |
| `_ensure_action_pulses()` | Check each of `Removeproject`, `Upall`, `Downall` individually | ~4 |
| `_ensure_library_page()` | Check each of `Library`, `Libraryproject`, `Scanlibrary`, `Loadfromlibrary` individually | ~5 |
| `_ensure_status_display()` | `op("status_display")` with type check | 3 |

### 1c. Replace `_setup_multi_project` body with dispatcher

```python
def _setup_multi_project(self) -> None:
    """Create the projects table DAT and new parameters if missing."""
    self._ensure_projects_table()
    self._ensure_active_project_menu()
    self._ensure_action_pulses()
    self._ensure_library_page()
    self._ensure_status_display()
    self._ensure_poll_script()
    self._scan_library()
    self._update_orchestrator_display()
```

Complexity: **1**.

## Step 2 — Lower ruff max-complexity

| File | Line | Change |
|------|------|--------|
| `TDDocker/pyproject.toml` | 31 | `max-complexity = 18` → `15` |
| `pyproject.toml` (root) | 95 | `max-complexity = 18` → `15` |

## Step 3 — Add tests

### 3a. TD fakes in `TDDocker/python/tests/conftest.py`

Lightweight fakes (no dependency on root `fake_td.py`):
- `FakeParNamespace` — raises `AttributeError` for missing attrs (matches real TD). Supports `__setattr__` to register params.
- `FakePage` — `appendStrMenu`, `appendPulse`, `appendFolder` — **must register created params on `ownerComp.par`** so `hasattr()` reflects reality
- `FakeOp` — `OPType`, `par` (FakeParNamespace), `destroy()`, `appendRow`, `viewer`, `nodeX/Y`
- `FakeOwnerComp` — `op(name)`, `create(type, name)`, `par`, `customPages`, `appendCustomPage(name)`

### 3b. Instance creation pattern

Use `object.__new__(TDDockerExt)` to create instances without triggering `__init__` side effects. Then manually assign `ext.ownerComp = fake_owner`.

### 3c. Test file `TDDocker/python/tests/test_setup_multi_project.py`

13 test cases:
1. `_find_page` returns matching page
2. `_find_page` returns `None` for missing
3. `_ensure_projects_table` creates when missing
4. `_ensure_projects_table` skips when exists
5. `_ensure_active_project_menu` creates when par missing + Config page exists
6. `_ensure_active_project_menu` skips when par exists
7. `_ensure_action_pulses` creates when par missing + Actions page exists
8. `_ensure_action_pulses` skips when par exists
9. `_ensure_library_page` creates new page when none exists
10. `_ensure_library_page` uses existing Library page
11. `_ensure_status_display` creates when missing
12. `_ensure_status_display` replaces wrong OPType
13. **Idempotence e2e**: call `_setup_multi_project()` twice on a virgin owner — verify no duplicates on second call

### Out of scope

- `customPages` loop at `td_docker_ext.py:1164` — similar pattern, but separate issue to keep diff small

## Verification

```bash
# TDDocker
cd TDDocker
uv run ruff check python/ --select C901
uv run ruff check python/
uv run ruff format --check python/
uv run pytest python/tests/ -v

# Root
cd ..
uv run ruff check modules/ --select C901
uv run ruff check modules/
uv run ruff format --check modules/
uv run pytest
```
