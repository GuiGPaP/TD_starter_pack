<!-- session_id: 099e259a-9a19-4ca5-92d2-b016641e7be6 -->
# Fix FPS drops + Stop hook errors

## Context

**Root cause confirmée par expérimentation :** `_run_compose()` dans `compose.py` utilise `subprocess.run(capture_output=True)` qui appelle `Popen.communicate()` en interne. `communicate()` tient le Python GIL pendant toute la durée du subprocess (~300ms pour `docker compose ps`). Même si le ThreadManager exécute `_poll_worker` dans un worker thread, le GIL bloque le main thread TD pendant 300ms toutes les 2 secondes → FPS drop à 42-45.

**Preuve :** Remplacer `_poll_worker` par un no-op → plus aucun spike de 300ms, FPS stable à 60.

## Fix

**Fichier :** `TDDocker/python/td_docker/compose.py`, fonction `_run_compose` (lignes 137-156)

Remplacer `subprocess.run(capture_output=True)` par `Popen` + `process.wait()` + lecture séparée. `Popen.wait()` relâche le GIL pendant l'attente, puis on lit stdout/stderr après (quasi instantané car le process est terminé).

```python
def _run_compose(
    args: list[str],
    project_name: str,
    timeout: int = 60,
) -> ComposeResult:
    """Run a docker compose command and capture output."""
    cmd = ["docker", "compose", "-p", project_name, *args]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        return ComposeResult(returncode=-1, stdout="", stderr="timeout")
    return ComposeResult(
        returncode=proc.returncode,
        stdout=proc.stdout.read() if proc.stdout else "",
        stderr=proc.stderr.read() if proc.stderr else "",
    )
```

Aussi appliquer le même pattern dans `container_manager.py` : `_run_compose` (lignes 137-156).

**Fichier :** `TDDocker/python/td_docker/container_manager.py`

Vérifier si `subprocess.run` y est utilisé et appliquer le même fix Popen.

## Fix 2 — Stop hook `cd _mcp_server` échoue

**Fichier :** `.claude/settings.json`

Le Stop hook (ligne 25) et le PostToolUse hook (ligne 14) font `cd _mcp_server` sans chemin absolu. Le working directory de Claude Code n'est pas garanti d'être la racine du projet.

**Fix :** Ajouter `cd "$(git rev-parse --show-toplevel)" &&` avant chaque `cd _mcp_server`.

## Fichiers modifiés
- `TDDocker/python/td_docker/td_docker_ext.py` — `_enqueue_task` utilise `threading.Thread` + `run()`
- `TDDocker/python/td_docker/compose.py` — `_run_compose` (déjà fait, Popen)
- `TDDocker/python/td_docker/container_manager.py` — `_run` (déjà fait, Popen)
- `TDDocker/python/td_docker/docker_status.py` — `check_docker` (déjà fait, Popen)
- `.claude/settings.json` — fix `cd` path dans hooks

## Vérification
1. `cd TDDocker && python -m pytest python/tests/ -v` — 85/85 passent ✓
2. Recharger modules dans TD → Load + Up
3. MCP `perf_monitor` : plus de spikes 300ms, FPS stable à 60 pendant polling
4. Stop hooks passent sans erreur
