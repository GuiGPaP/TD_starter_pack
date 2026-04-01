<!-- session_id: cf8f92a2-af4f-4364-87ce-265e198618f7 -->
# Fix compose.py deadlock + pulse contract tests via _sync_mode

## Context

On veut tester la chaîne complète des pulses container (Start/Stop/Restart/Logs) via `_sync_mode=True`. L'investigation a révélé un vrai bug dans `compose.py` qui doit être fixé d'abord.

**Bug :** `_run_compose()` utilise `Popen.wait()` avec `stdout=PIPE` + `stderr=PIPE`. C'est un [deadlock documenté par Python](https://docs.python.org/3/library/subprocess.html#subprocess.Popen.wait) : quand le child process produit assez d'output pour remplir le buffer pipe (~4KB avec 3 containers JSON), le process bloque en écriture et `wait()` ne retourne jamais. Ce n'est pas safe y compris en production async — au mieux ça gèle un worker, au pire c'est intermittent.

**Preuve (via MCP dans TD live) :**
- `subprocess.run(capture_output=True)` → fonctionne, 4377 bytes
- `Popen.communicate(timeout=15)` → fonctionne, 4377 bytes
- `Popen.wait(timeout=15)` + `stdout.read()` → deadlock/timeout

## Commit 1 : Fix `_run_compose()` — `wait()` → `communicate()`

**Fichier :** `TDDocker/python/td_docker/compose.py` (lignes 137-169)

`communicate()` est la méthode recommandée par Python et fonctionne dans les deux modes (thread daemon + sync inline).

```python
def _run_compose(args, project_name, timeout=60):
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
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        stdout, stderr = proc.communicate()
        return ComposeResult(
            returncode=-1,
            stdout=stdout or "",
            stderr=(stderr or "") + "\ntimeout",
        )
    return ComposeResult(returncode=proc.returncode, stdout=stdout, stderr=stderr)
```

**Tests unitaires Python :** ajouter 2 tests dans `TDDocker/python/tests/test_compose.py` :
1. `test_run_compose_success` — Popen mocké, `communicate()` retourne (stdout, stderr), vérifie ComposeResult
2. `test_run_compose_timeout` — Popen mocké, `communicate()` raise `TimeoutExpired`, vérifie kill + returncode=-1 + stderr contient "timeout"

**Vérification :**
```bash
cd TDDocker && uv run pytest python/tests/ -v
```

## Commit 2 : Suite "pulse contract" dans tdDocker.live.test.ts

**Fichier :** `_mcp_server/tests/integration/tdDocker.live.test.ts`

Ajouter un `describe("TDDocker pulse contract", { timeout: 120_000 })` séparé.

**Helper :**
```ts
async function withSyncMode<T>(fn: () => Promise<T>): Promise<T> {
  await execScript("op('/TDDocker').ext.TDDockerExt._sync_mode = True");
  try { return await fn(); }
  finally { await execScript("op('/TDDocker').ext.TDDockerExt._sync_mode = False"); }
}
```

**Stratégie pulse :** chemin principal = `par.X.pulse()` dans un appel MCP, puis lire l'état dans un second appel. Si le parexecDAT ne fire pas de façon fiable entre 2 appels MCP, fallback vers `comp.ext.TDContainerExt.onParPulse(comp.par.Stop)` (bypass parexecDAT, mais on teste encore la chaîne extension).

**Probe initial** (à tester en premier) :
```
Appel 1: await execScript("comp.par.Stop.pulse()") // avec _sync_mode=True
Appel 2: await readScript("comp.par.State.val") // doit être "exited"
```
Si ça marche → on garde `par.X.pulse()`. Sinon → fallback `onParPulse` direct.

**beforeAll :**
- Snapshot transport toggles (Oscenable, Wsenable, Ndienable)
- Up containers via Docker CLI (`docker compose -p {sessionId} up -d`)
- Attendre running
- Set `_sync_mode = True`
- Force un `PollStatus()` sync pour que TD ait les bons ContainerIDs

**Tests :**
1. **Stop** : précondition `State == running`, pulse Stop, lire State → `exited`
2. **Start** : précondition `State == exited`, pulse Start, lire State → `running`, Containerid non vide
3. **Restart** : précondition `State == running`, pulse Restart, lire State → `running`
4. **Logs** : pulse Logs, lire `log_dat.text.strip().length > 0`

**afterAll :**
- `_sync_mode = False` (via finally)
- Restaurer transport toggles
- Down containers via Docker CLI

**Sérialisation :** `fileParallelism: false` déjà en place dans `vitest.live.config.ts`.

## Fichiers modifiés

1. `TDDocker/python/td_docker/compose.py` — `wait()` → `communicate()`
2. `TDDocker/python/tests/test_compose.py` — 2 tests unitaires (_run_compose success + timeout)
3. `_mcp_server/tests/integration/tdDocker.live.test.ts` — ajout suite "pulse contract"

## Vérification

```bash
# Unit tests Python — fix compose.py
cd TDDocker && uv run pytest python/tests/ -v

# Standard vitest — pas de régression
cd _mcp_server && npx vitest run

# Live E2E — toutes les suites
cd _mcp_server && npm run test:integration:live
```
