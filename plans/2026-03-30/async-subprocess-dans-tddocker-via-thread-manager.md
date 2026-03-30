<!-- session_id: ef8d182e-4681-4c88-a70b-e2075d18223e -->
# Plan : Async subprocess dans TDDocker via Thread Manager

## Context

TDDocker utilise `subprocess.run()` (synchrone) pour `docker compose ps`, `docker compose up/down`, etc. Ces appels bloquent le main thread TD pendant 100-200ms, causant des drops de FPS. Le `docker compose ps` en polling (toutes les 2s) est le pire cas — on l'a contourné en désactivant le polling, mais c'est un workaround.

**Solution retenue : TD Thread Manager** (officiel Derivative, TD 2023+) plutôt que TDAsyncIO (unmaintained 2022, .tox binaire).

## Scope

Ce changement concerne **TDDocker** (le framework générique), pas uniquement SLlidar. Tous les appels subprocess dans TDDocker bénéficieraient du Thread Manager.

### Appels bloquants identifiés dans TDDocker

| Fichier | Fonction | Appel | Durée typique |
|---------|----------|-------|---------------|
| `td_docker_ext.py` | `PollStatus()` | `compose_ps()` → `docker compose ps -a` | ~200ms |
| `td_docker_ext.py` | `_up()` | `compose_up()` → `docker compose up -d` | ~2-5s |
| `td_docker_ext.py` | `_down()` | `compose_down()` → `docker compose down` | ~2-5s |
| `container_manager.py` | `start/stop/restart` | `docker start/stop/restart` | ~1-3s |
| `docker_status.py` | `check_docker()` | `docker info` | ~100ms |

### Appels bloquants dans SLlidar launcher

| Fonction | Appel | Durée |
|----------|-------|-------|
| `_check_docker()` | `docker info` | ~100ms |
| `_find_lidar_usb()` | `usbipd list` | ~50ms |
| `_attach_usb()` | `usbipd attach` | ~2s |

## Approche

### Phase 1 : SLlidar launcher (immédiat)
Utiliser le Thread Manager pour les appels du launcher SLlidar uniquement :
- `_check_docker()`, `_find_lidar_usb()`, `_attach_usb()` → worker thread
- Callback sur main thread met à jour Status et continue le flow

### Phase 2 : TDDocker core (futur)
Migrer les subprocess de TDDocker vers le Thread Manager :
- `PollStatus()` non-bloquant → plus besoin de désactiver le polling
- `_up()` / `_down()` non-bloquants → UI reste fluide pendant les opérations longues

## Implementation Phase 1 (SLlidar)

Le Thread Manager s'utilise via `TDResources` :

```python
import TDFunctions

def _start_async(self):
    """Non-blocking start flow using Thread Manager."""
    comp = self.ownerComp
    comp.par.Status.val = 'Checking...'

    # Run blocking checks in worker thread
    task = TDFunctions.Task(self._blocking_start_work)
    task.SuccessHook = self._on_start_success
    task.ExceptHook = self._on_start_error
    TDResources.ThreadManager.Submit(task)

def _blocking_start_work(self):
    """Runs in worker thread — no TD ops allowed here."""
    # All subprocess calls happen here
    docker_ok = subprocess.run(['docker', 'info'], ...).returncode == 0
    busid = self._find_lidar_usb_sync()
    attached = self._attach_usb_sync(busid)
    self._write_env_sync(...)
    return {'docker_ok': docker_ok, 'busid': busid, 'attached': attached}

def _on_start_success(self, result):
    """Callback on main thread — TD ops safe here."""
    comp = self.ownerComp
    if not result['docker_ok']:
        comp.par.Status.val = 'Error: Docker not running'
        return
    # Continue with Load/Up (these are TD operations, must be on main thread)
    comp.par.Usbdevice.val = result['busid']
    self._do_load_and_up()
```

**Contrainte clé :** Le worker thread ne peut PAS accéder aux ops TD. Seuls les callbacks (`SuccessHook`/`ExceptHook`) tournent sur le main thread.

## Fichiers à modifier

| Fichier | Changement |
|---------|-----------|
| `/TDDocker/SLlidar/sllidar_ext` (textDAT) | Réécrire `_start()` en async via Thread Manager |

## Vérification

1. Start ne freeze plus TD (pas de drop FPS pendant docker info, usbipd attach)
2. Status se met à jour progressivement (Checking... → Attaching USB... → Running)
3. Stop fonctionne toujours
4. FPS stable à 60 pendant toute la séquence Start
