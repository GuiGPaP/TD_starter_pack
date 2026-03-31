<!-- session_id: 099e259a-9a19-4ca5-92d2-b016641e7be6 -->
# Fix FPS drops during Up/Down — TDDocker async

## Context

**Problème :** Le ThreadManager de la palette TD n'est pas présent dans le projet. `_enqueue_task()` tombe en fallback synchrone → tous les subprocess Docker (polling toutes les 2s, Up, Down, container ops) bloquent le main thread → drops de FPS réguliers.

**Diagnostic MCP :** `threadManager.found = false`, `polling_active = true` — le polling tourne en sync sur le main thread toutes les 2 secondes.

## Approche

**Option A + fix sync** : Remettre le ThreadManager + convertir les 2 derniers points bloquants en async.

## Étapes

### 1. Remettre le ThreadManager (dans TD)
- Charger le composant ThreadManager depuis la palette TD dans `/TDDocker` ou dans `TDResources`
- Vérifier que `op.TDResources.op("ThreadManager")` retourne bien un objet

### 2. Convertir `_refresh_project_status()` en async
**Fichier :** `TDDocker/python/td_docker/td_docker_ext.py` (lignes 1111-1124)

Actuellement sync (`compose_ps` sur main thread). Convertir pour utiliser `_enqueue_task` :

```python
def _refresh_project_status(self, project: ProjectState) -> None:
    """One-shot async refresh for a single project."""
    result_holder = [None]

    def _worker(session_id):
        result_holder[0] = compose_ps(session_id)

    def _on_success():
        statuses = result_holder[0]
        if statuses is None:
            return
        data = [
            {"service": s.service, "container_id": s.container_id,
             "state": s.state, "health": s.health, "image": s.image}
            for s in statuses
        ]
        self._apply_project_poll(project.name, data)

    self._enqueue_task(
        target=_worker, success_hook=_on_success,
        args=(project.session_id,),
    )
```

### 3. Convertir `PollStatus()` en async (alias de PollStatusAsync)
**Fichier :** `td_docker_ext.py` (lignes 1091-1109)

`PollStatus()` est appelé par `td_container_ext._refresh_orchestrator()`. Le rendre non-bloquant en déléguant à `PollStatusAsync()` :

```python
def PollStatus(self) -> None:
    """Refresh container statuses (non-blocking)."""
    self.PollStatusAsync()
```

### 4. Convertir container Start/Stop/Restart en async
**Fichier :** `TDDocker/python/td_docker/td_container_ext.py` (lignes 60-95)

Les `start_container()`, `stop_container()`, `restart_container()` sont des subprocess sync. Utiliser l'orchestrateur `_enqueue_task` :

```python
def _run_container_action(self, action_fn, action_name, *args):
    """Run a container action via the orchestrator's thread pool."""
    result_holder = [None]
    orchestrator = self._find_orchestrator()

    def _worker():
        result_holder[0] = action_fn(*args)

    def _on_success():
        result = result_holder[0]
        if result and result.ok:
            self._log(f"Container {action_name}")
        elif result and "No such container" in result.stderr:
            self._log("ERROR: Container no longer exists — press Rebuild")
        elif result:
            self._log(f"ERROR {action_name}: {result.stderr}")
        self._refresh_orchestrator()

    if orchestrator and hasattr(orchestrator.ext, 'TDDockerExt'):
        orchestrator.ext.TDDockerExt._enqueue_task(
            target=_worker, success_hook=_on_success,
        )
    else:
        # Fallback sync si pas d'orchestrateur
        _worker()
        _on_success()
```

Puis simplifier `_start`, `_stop`, `_restart` pour utiliser ce helper.

### 5. Supprimer `_up_result` / `_down_result` au profit de closures
**Fichier :** `td_docker_ext.py` (lignes 430-532)

Remplacer `self._up_result` et `self._down_result` par des `result_holder = [None]` locaux dans les closures pour éviter les race conditions.

## Fichiers modifiés
- `TDDocker/python/td_docker/td_docker_ext.py` — steps 2, 3, 5
- `TDDocker/python/td_docker/td_container_ext.py` — step 4

## Vérification
1. `cd TDDocker && python -m pytest python/tests/ -v` — tous les tests passent
2. Dans TD : vérifier `op.TDResources.op("ThreadManager")` non-None
3. MCP `get_performance` : vérifier FPS stable à 60 pendant Up/Down/polling
4. Tester Up → vérifier pas de freeze
5. Tester Down → vérifier pas de freeze
6. Tester Start/Stop sur un container individuel → pas de freeze
