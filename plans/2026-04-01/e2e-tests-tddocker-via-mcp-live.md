<!-- session_id: cf8f92a2-af4f-4364-87ce-265e198618f7 -->
# E2E Tests — TDDocker via MCP live

## Context

TDDocker a 85 unit tests Python (pure, sans Docker ni TD) mais aucun test E2E qui vérifie le fonctionnement réel dans un TD live avec Docker. On a maintenant l'infra live tests en place (`.live.test.ts` + `vitest.live.config.ts`). On l'exploite pour créer une suite E2E TDDocker.

**Prérequis runtime :** TD ouvert avec TDDocker + MCP webserver actif + Docker daemon running.

## Faits vérifiés dans TD live

- **Nommage COMPs** : `{ProjectName}_{servicename}`, tirets → underscores : `Tests_web`, `Tests_echo`, `Tests_osc_test`
- **Composefile** : chemin absolu (`C:\...\Tests\test-compose.yml`)
- **Projet "Tests" déjà chargé** : status `loaded`, 3 COMPs sous `/TDDocker/containers/`
- **Params container** : `Projectname`, `Servicename`, `Image`, `Containerid`, `State`, `Health`, `Start/Stop/Restart/Logs`, `Oscenable/Oscinport/Oscoutport`, `Wsenable/Wsport`, `Ndienable/Ndisource`
- **State initial** : `created` (pas encore `Up`)
- **Extension accessible** via `op('/TDDocker').ext.TDDockerExt`
- **service_configs** : dict `{web: ServiceOverlay, echo: ServiceOverlay, "osc-test": ServiceOverlay}`
- **MCP mode constraint** : `p.eval()` nécessite `full-exec`, `p.val` fonctionne en `read-only`

## Plan

### 1. Nouveau fichier test
**Fichier :** `_mcp_server/tests/integration/tdDocker.live.test.ts`

**Helpers :**
- `getLiveTdConfig()` — réutiliser le pattern du test MCP client existant
- `execScript<T>(script)` — wrapper `tdClient.execPythonScript()` qui throw si !success
- `readScript<T>(script)` — même chose en mode read-only (pour les vérifications)
- `waitFor(checkFn, { timeout, interval })` — poll une condition avec retry

**Structure (séquentielle, un seul describe pour forcer l'ordre) :**
```
describe("TDDocker E2E")
  beforeAll:
    - preflight getTdInfo()
    - vérifier extension TDDockerExt chargée
    - vérifier projet "Tests" chargé (le toe actuel l'a déjà)
  
  afterAll:
    - Restaurer les toggles transport aux valeurs initiales (snapshot beforeAll)
    - Down pour cleanup (idempotent)

  test: extension is loaded and has projects dict
  test: container COMPs exist (Tests_web, Tests_echo, Tests_osc_test)
  test: each COMP has correct Servicename (web, echo, osc-test via service_configs)
  test: status_display textCOMP exists
  test: projects table DAT exists
  
  test: Up → containers reach "running" (waitFor State param, timeout 30s)
  
  test: enable Oscenable on Tests_osc_test → osc_in, osc_out, oscin_callbacks created
  test: disable Oscenable → operators removed
  test: enable Wsenable on Tests_echo → websocket_dat, websocket_callbacks created
  test: disable Wsenable → operators removed
  
  test: Stop on Tests_web → State becomes "exited" (waitFor + manual PollStatus)
  test: Start on Tests_web → State becomes "running" (waitFor + manual PollStatus)
  test: Logs on Tests_web → log_dat.text.strip() has content
  
  test: Down → all containers State becomes "exited" (waitFor)
```

### 2. Scripts Python utilisés

**Vérifier extension :**
```python
ext = op('/TDDocker').ext.TDDockerExt
ext is not None and 'Tests' in ext._projects
```

**Vérifier COMP existe + Servicename :**
```python
comp = op('/TDDocker/containers/Tests_web')
comp.par.Servicename.val if comp else None
```

**Up / Down (full-exec) :**
```python
op('/TDDocker').par.Up.pulse()
```
```python
op('/TDDocker').par.Down.pulse()
```

**Poll + lire State (read-only) :**
```python
comp = op('/TDDocker/containers/Tests_web')
comp.par.State.val if comp else 'unknown'
```

**Activer/désactiver transport (safe-write) :**
```python
op('/TDDocker/containers/Tests_osc_test').par.Oscenable = True
```

**Vérifier opérateurs transport (read-only) :**
```python
comp = op('/TDDocker/containers/Tests_osc_test')
[c.name for c in comp.children] if comp else []
```

**Container actions (full-exec) :**
```python
op('/TDDocker/containers/Tests_web').par.Stop.pulse()
```

**Logs check (read-only) — log_dat is a textDAT, not tableDAT :**
```python
comp = op('/TDDocker/containers/Tests_web')
log = comp.op('log_dat')
len(log.text.strip()) if log else 0
```

### 3. Helper `waitFor`

```ts
async function waitFor(
  checkFn: () => Promise<boolean>,
  { timeout = 15000, interval = 1000 } = {},
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await checkFn()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`waitFor timed out after ${timeout}ms`);
}
```

### 4. Contraintes techniques

- **Async TDDocker** : toutes les actions (up, down, poll, stop, start) sont async (daemon threads + deferred callbacks). `waitFor` après chaque pulse.
- **Timeout vitest** : mettre `testTimeout: 60_000` dans le describe ou via vitest config, car `docker compose up` peut prendre 30s.
- **Pas de Load dans les tests** : le projet "Tests" est déjà chargé dans le .toe. On pulse juste Up/Down.
- **Sérialisation des suites live** : ajouter `fileParallelism: false` dans `vitest.live.config.ts` pour éviter que les deux `.live.test.ts` tournent en parallèle (ils partagent la même instance TD).
- **Cleanup robuste** : `beforeAll` snapshotte l'état initial (project.status, Oscenable, Wsenable, Ndienable sur chaque COMP). `afterAll` restaure ces valeurs puis fait Down + waitFor.
- **Pas de test PollStatus isolé** : le polling est couvert indirectement par les transitions Up/Down/Stop/Start qui appellent `PollStatus()` pour vérifier l'état. Un test isolé serait faible sans état stale réel.

## Fichiers modifiés

1. `_mcp_server/tests/integration/tdDocker.live.test.ts` — **nouveau**
2. `_mcp_server/vitest.live.config.ts` — ajout `fileParallelism: false`

## Vérification

```bash
cd _mcp_server
# Standard — ne doit pas régresser
npx vitest run
# Live — les deux suites
npm run test:integration:live
```
