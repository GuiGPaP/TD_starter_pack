<!-- session_id: 9c54df77-41a9-4582-8d68-24559db21dcd -->
# Plan: OSC merge + Transport persistence

## Context

Two features for TDDocker:
1. Merge the standalone OSC test compose file into the main test-compose.yml
2. Persist Transport parameter values (Datatransport, Videotransport, etc.) across .toe save/reload

## Feature 1: Merge OSC into test-compose.yml

**Files to modify:**
- `TDDocker/Tests/test-compose.yml` — add osc-test service
- `TDDocker/CLAUDE.md` — update file structure (remove test-osc-compose.yml reference)

**Files to delete:**
- `TDDocker/Tests/test-osc-compose.yml`
- `TDDocker/Tests/td-overlay.yml` (auto-generated, shouldn't be committed)

**Changes:**

Add to test-compose.yml:
```yaml
  osc-test:
    build: ../docker/osc-test
    ports:
      - "9001:9001/udp"
```

Note: build path is `../docker/osc-test` (relative to Tests/, the docker context is at `TDDocker/docker/osc-test/`).

## Feature 2: Transport persistence on reload

**Problem:** `__init__` sets `self._projects = {}` but container COMPs (with their Transport params) and the `projects` table DAT survive in the .toe. The extension loses knowledge of loaded projects.

**Solution:** Add `_restore_projects()` method that reads the surviving `projects` table DAT and reconstructs `_projects` dict.

**File to modify:**
- `TDDocker/python/td_docker/td_docker_ext.py`

### Implementation

**Step 1: Add `_restore_projects()` method** (after `_setup_multi_project`, ~line 214)

```python
def _restore_projects(self) -> None:
    """Reconstruct _projects from the surviving projects table DAT."""
    dat = self.ownerComp.op("projects")
    if not dat or dat.numRows <= 1:
        return

    import yaml

    containers_comp = self.ownerComp.op("containers")

    for row_idx in range(1, dat.numRows):
        project_name = str(dat[row_idx, 0])
        compose_str = str(dat[row_idx, 1])
        session_id = str(dat[row_idx, 2])
        status = str(dat[row_idx, 3])

        if project_name in self._projects:
            continue

        compose_path = Path(compose_str)
        if not compose_path.exists():
            self._log(f"Restore skipped '{project_name}': {compose_str} not found")
            continue

        # Parse services
        try:
            content = compose_path.read_text(encoding="utf-8")
            doc = yaml.safe_load(content)
            services = doc.get("services", {})
        except Exception as e:
            self._log(f"Restore skipped '{project_name}': {e}")
            continue

        # Build service configs, reading NDI state from surviving COMPs
        svc_list = list(services.keys())
        multi = len(svc_list) > 1
        service_configs = {}
        for svc_name in svc_list:
            comp_name = self._sanitize_name(
                f"{project_name}_{svc_name}" if multi else project_name
            )
            ndi_enabled = False
            if containers_comp:
                comp = containers_comp.op(comp_name)
                if comp and hasattr(comp.par, "Videotransport"):
                    ndi_enabled = str(comp.par.Videotransport) == "ndi"
            service_configs[svc_name] = ServiceOverlay(ndi_enabled=ndi_enabled)

        # Check for surviving overlay
        overlay_path = compose_path.parent / "td-overlay.yml"

        project = ProjectState(
            name=project_name,
            compose_path=compose_path,
            compose_dir=compose_path.parent,
            session_id=session_id,
            overlay_path=overlay_path if overlay_path.exists() else None,
            service_configs=service_configs,
            status="loaded",  # always reset — PollStatus will correct
        )
        self._projects[project_name] = project
        self._log(f"Restored project '{project_name}' from saved state")

    if self._projects:
        self._update_active_menu()
```

**Step 2: Call from `__init__`** (after `_setup_multi_project()`, before orphan cleanup)

Insert at line ~126 (between `_setup_multi_project()` and orphan cleanup):
```python
        # Restore projects from surviving table DAT (after .toe reload)
        self._restore_projects()
```

### Why reset status to "loaded"

After a .toe save/reload, containers may or may not still be running (TD could have crashed, user could have quit cleanly). Setting to "loaded" is safe — the first `PollStatus()` cycle will check Docker and update to "running" if containers are alive.

### Edge cases handled

- Compose file moved/deleted → skip with warning, COMP stays (manual cleanup)
- Status was "running" but containers died → PollStatus corrects it
- Session ID preserved → overlay file still matches, no regen needed
- NDI state read from surviving COMP params → ServiceOverlay accurate

## Verification

1. Open TDDocker.toe, load test-compose.yml
2. Set a container's Data Transport to "OSC" and Video Transport to "NDI"
3. Save the .toe (Ctrl+S)
4. Close and reopen the .toe
5. Verify: projects table still has the project, Transport params still show OSC/NDI
6. Verify: `docker compose up` still works (overlay file intact)
7. Run `cd TDDocker && python -m pytest python/tests/ -v` to check no regressions
