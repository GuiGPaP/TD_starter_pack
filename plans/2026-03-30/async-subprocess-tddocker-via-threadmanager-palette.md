<!-- session_id: 63c69904-fad2-4f18-af45-24ed6e1e82ca -->
# Plan : Async subprocess TDDocker via ThreadManager (Palette)

## Context

TDDocker bloque le main thread TD avec `subprocess.run()` (docker compose ps ~200ms, up/down 2-5s). Le plan initial proposait d'utiliser le Thread Manager directement, mais avec une API incorrecte (`Submit` au lieu de `EnqueueTask`). Les lessons learned notaient aussi que les SuccessHook callbacks étaient unreliable.

**Nouveau constat** : Les comps Palette **threadManagerClient** (v1.0.8) et **threadsMonitor** (v1.0.9) sont déjà sur le réseau `/TDDocker/` mais le callback DAT est encore le template demo (banana counter). Rien n'a été branché sur les vrais subprocess Docker.

La doc officielle (`docs.derivative.ca/ThreadManager_Ext`) confirme l'API : `EnqueueTask()`, `TDTask`, `RefreshHook`, `ClientQueueManager`.

## Approche : Utiliser threadManagerClient (Palette pattern)

Au lieu d'accéder au ThreadManager directement, utiliser le **threadManagerClient** qui abstrait la complexité threading. C'est le pattern recommandé par Derivative pour les utilisateurs non-experts en threading.

### Architecture

```
threadManagerClient  ──par.Callbackdat──>  threadManagerClient_callbacks (textDAT)
       │                                        │
       │ .setupAndRun()                         ├── Setup()        → prépare payload (main thread)
       │                                        ├── RunInThread()  → subprocess blocking (worker thread)
       │                                        ├── OnRefresh()    → progress updates (main thread, chaque frame)
       │                                        ├── OnSuccess()    → résultat final (main thread)
       │                                        └── OnExcept()     → erreur (main thread)
       │
       └──par.Threadmanager──> /sys/TDResources/threadManager
                                        │
                              threadsMonitor ──> dashboard live (tasks, threads, workers)
```

### Phase 1 : Proof of concept — PollStatus non-bloquant

Le cas le plus impactant : `docker compose ps` (~200ms) appelé toutes les 2s en polling.

**Fichier à modifier :** `/TDDocker/threadManagerClient_callbacks` (textDAT in TD)

```python
# Setup() — main thread, TD ops OK
def Setup(tmClientExt):
    # Évaluer tous les params TD ici, pas dans le thread
    comp = tmClientExt.ownerComp.parent()
    payload = {
        'compose_file': comp.par.Composefile.eval(),
        'project_name': comp.par.Projectname.eval(),
    }
    return payload

# RunInThread() — worker thread, NO TD ops
def RunInThread(tmClientExt, payload):
    import subprocess
    cmd = ['docker', 'compose', '-f', payload['compose_file'],
           '-p', payload['project_name'], 'ps', '-a', '--format', 'json']
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    tmClientExt.clientQueueManager.SetSuccessPayload({
        'stdout': result.stdout,
        'stderr': result.stderr,
        'returncode': result.returncode
    })

# OnSuccess() — main thread, TD ops OK
def OnSuccess(tmClientExt, payload):
    # Parser le JSON et mettre à jour les statuts des containers
    import json
    comp = tmClientExt.ownerComp.parent()
    if payload and payload['returncode'] == 0:
        containers = json.loads(payload['stdout']) if payload['stdout'] else []
        # Mettre à jour les container COMPs via l'extension TDDocker
        ext = comp.ext.TDDockerExt
        ext._update_container_status(containers)

# OnRefresh() — pas nécessaire pour un one-shot comme ps
def OnRefresh(tmClientExt, refreshPayload):
    pass

# OnExcept() — main thread
def OnExcept(tmClientExt, args):
    tmClientExt.logger.Error(f'PollStatus failed: {args}')
```

**Intégration dans td_docker_ext.py :**
- `PollStatus()` appelle `op('threadManagerClient').setupAndRun()` au lieu de `subprocess.run()`
- Le polling loop (`run(delayFrames=...)`) continue normalement, mais ne bloque plus

### Phase 2 : Up/Down non-bloquants

Même pattern mais avec `RefreshHook` pour progress :
- `Setup()` prépare les args docker compose
- `RunInThread()` lance `docker compose up -d` ou `down`
- `OnRefresh()` met à jour `par.Status` avec la progression
- `OnSuccess()` déclenche le polling pour vérifier l'état final

### Phase 3 : SLlidar launcher

Les appels `docker info`, `usbipd list`, `usbipd attach` (~2s total) passent aussi par le threadManagerClient.

**Note :** Soit on utilise un seul threadManagerClient avec des callbacks qui switchent selon le type de task, soit on en ajoute un deuxième dédié au launcher. Un seul client ne peut exécuter qu'une task à la fois.

## Vérification

1. **threadsMonitor** : Ouvrir le viewer du comp — vérifier que les tasks apparaissent dans les listers (tasks in queue, running threads, workers)
2. **FPS** : Monitorer avec `get_performance` MCP — pas de drop pendant `docker compose ps`
3. **Status** : Les container COMPs se mettent toujours à jour correctement après polling async
4. **Error handling** : Tester avec Docker Desktop arrêté — `OnExcept` doit logger proprement
5. **threadsMonitor dashboard** : Vérifier totalTasks, tasksInQueue, runningThreads, numberOfWorkers en live pendant les opérations

## Étape immédiate : Test du setup avec le template demo

**But :** Valider que le pipeline threadManagerClient → ThreadManager → threadsMonitor fonctionne avant de brancher les vrais subprocess.

1. Pulser `Runinthread` sur `/TDDocker/threadManagerClient`
2. Observer le threadsMonitor : totalTasks, tasksInQueue, runningThreads, workers
3. Vérifier les logs dans le logger du threadsMonitor
4. Confirmer que OnSuccess est bien appelé (le point sur lequel on avait des doutes)
5. Mesurer l'impact FPS pendant l'exécution (5 × 1s sleep = 5s)

**Architecture (poll/up/down) :** On décide après ce test.

## Questions ouvertes

- Les lessons learned mentionnent que SuccessHook est unreliable — est-ce encore le cas avec le threadManagerClient wrapper (v1.0.8) qui gère ça via ClientQueueManager ?
