<!-- session_id: d8d67442-82e4-461b-8530-4f4b42b4741f -->
# Plan: Éliminer tous les appels bloquants restants dans TDDocker

## Context

TDDocker freeze encore TD dans plusieurs chemins de code. Le pattern async (`_enqueue_task` + `threading.Thread` + deferred callbacks) est en place et fonctionne pour Up/Down/Poll, mais 6 méthodes appellent encore `check_docker()`, `compose_up()`, ou `compose_logs()` directement sur le main thread. De plus, `_remove_project` et `_rebuild` lancent un `_down_project` async puis détruisent l'état local immédiatement → race condition.

**Choix technique confirmé :** threads purs, pas TDAsyncIO, pas threadManager built-in.

## Fichiers critiques

- `TDDocker/python/td_docker/td_docker_ext.py` — tous les fixes
- `TDDocker/python/tests/test_ndi_regen.py` — adaptation tests existants
- SLlidar **hors scope** de ce patch

---

## Plan d'implémentation

### Étape 1 : `_sync_mode` — support de test uniquement

Ajouter un flag `_sync_mode` au début de `_enqueue_task()` : si activé, exécute target + success_hook inline. **Documenté comme test-only** (commentaire + docstring). Minimise le diff par rapport au stub de `_enqueue_task` dans chaque test.

**Fichier:** `td_docker_ext.py:221`
```python
# Test-only: when _sync_mode is True, run inline instead of spawning
# a thread.  This exists solely for unit tests that need deterministic
# execution order.  Never set in production.
if getattr(self, '_sync_mode', False):
    try:
        target(*args)
        if success_hook:
            success_hook()
    except Exception as e:
        if except_hook:
            except_hook(type(e), e, e.__traceback__)
        else:
            self._log(f"ERROR: {e}")
    return
```

### Étape 2 : Remplacer les appels sync restants

#### 2a. `_update_orchestrator_display()` — cache au lieu de subprocess

**Ligne 947** : Remplacer `check_docker()` par `self._docker_ok` (déjà maintenu par `_require_docker()`).

Justification : supprime un chemin sync d'UI vers `docker info`. Pas le coût principal du polling, mais un blocage inutile quand l'affichage se rafraîchit.

#### 2b. `_check_docker()` — async via `_enqueue_task`

**Ligne 351-354** : Wrapper dans `_enqueue_task` avec result_holder. Le success_hook :
- met à jour `_docker_ok` et `_docker_check_time`
- log le message
- appelle `_update_orchestrator_display()` pour rafraîchir l'UI avec le nouvel état

#### 2c. `_view_logs()` — async via `_enqueue_task`

**Ligne 647-655** : `compose_logs()` dans un worker, écriture du DAT dans le success_hook.

#### 2d. `_regenerate_overlay()` — async `compose_up`

**Ligne 678-702** : Garder `write_overlay()` synchrone (I/O fichier, instantané). Wrapper `compose_up()` dans `_enqueue_task` avec result_holder.

### Étape 3 : Corriger les races de lifecycle

#### 3a. Ajouter `on_complete` à `_down_project()`

**Ligne 542** : Paramètre optionnel `on_complete: callable | None = None`. Exécuté sur le main thread **après** que le nettoyage down soit terminé (succès ou échec) — garantit que l'appelant peut enchaîner en sécurité.

```python
def _down_project(self, project: ProjectState, on_complete=None) -> None:
    ...
    def _on_success():
        ... # nettoyage existant (status, watchdog, polling, refresh)
        if on_complete:
            on_complete()
    
    def _on_except(*args):
        self._log(f"ERROR: compose down exception for '{project.name}': {args}")
        if on_complete:
            on_complete()
```

#### 3b. `_remove_project()` — chaîner via `on_complete`

**Ligne 598-619** : Extraire le cleanup dans `_after_down()`. Si running → `_down_project(project, on_complete=_after_down)`. Sinon → `_after_down()` direct.

#### 3c. `_rebuild()` — chaîner via `on_complete`

**Ligne 621-645** : Même pattern. Destroy + reload + up dans `_after_down()`, passé via `on_complete`.

### Étape 4 : Adapter les tests + nouveau test lifecycle

#### 4a. `test_ndi_regen.py`

Ajouter `ext._sync_mode = True` dans le helper `_make_ext()`.

#### 4b. Nouveau test : remove/rebuild chaînage

Ajouter un test vérifiant que `_remove_project` sur un projet running appelle `_down_project` avec `on_complete`, et que le cleanup (destroy COMPs, del registry) n'arrive qu'après le down.

### Étape 5 : Nettoyage commentaires/docstrings

Harmoniser les commentaires dans `td_docker_ext.py` :
- Supprimer les mentions de ThreadManager dans les docstrings (le code utilise `threading.Thread` depuis la migration)
- Documenter le retour optimiste de `_require_docker()` (ligne 347-349)
- S'assurer que la docstring de `_enqueue_task` reflète le choix architectural

### Étape 6 (CRITIQUE) : Corriger le flush loop — 2 bugs trouvés en live

Pendant les tests MCP en live, on a découvert :

#### Bug 1 : le flush loop ne démarre jamais

`_start_flush_loop()` dans `__init__` utilise `ps.run(string, delayFrames=1)`. Mais `textDAT.run()` en TD exécute le **contenu du DAT**, pas une string arbitraire — les arguments positionnels sont passés au script, pas interprétés comme du code. Donc `tick()` n'est jamais appelé.

**Fix :** Rendre le poll_script **auto-démarrant**. Ajouter `tick()` en dernière ligne du `_POLL_SCRIPT`. Quand `_ensure_poll_script` écrit le texte, TD recompile le module et exécute le code module-level → `tick()` se lance. Supprimer `_start_flush_loop()`.

#### Bug 2 : pas de guard anti-doublon ni arrêt propre

Si `__init__` est appelé plusieurs fois (reload, réinit TD), chaque appel recrée le poll_script et relance `tick()`. Résultat : N boucles tick parallèles → N appels `_flush_deferred()` par frame → cascade.

De plus, si `ext` est None (extension déchargée), `tick()` catch l'erreur mais se reschedule quand même → spam infini.

**Fix du `_POLL_SCRIPT` :**
```python
import time as _time
_last_poll = [0]

def tick():
    try:
        td_docker = op('/TDDocker')
        ext = getattr(td_docker.ext, 'TDDockerExt', None)
        if not ext:
            return  # Stop loop — no reschedule
        ext._flush_deferred()
        now = _time.monotonic()
        if getattr(ext, '_polling_active', False) and (now - _last_poll[0]) >= 2:
            _last_poll[0] = now
            ext.PollStatusAsync()
    except Exception as e:
        print(f'Poll error: {e}')
        return  # Stop loop on error — no reschedule
    # Reschedule next frame (only reached on success)
    run('op("/TDDocker/poll_script").module.tick()',
        delayFrames=1)

# Auto-start on module load
run('op("/TDDocker/poll_script").module.tick()', delayFrames=1)
```

Changements clés :
- `getattr(td_docker.ext, 'TDDockerExt', None)` au lieu de `.ext.TDDockerExt` → pas d'exception si l'ext n'existe pas
- `return` sans reschedule si ext est None ou si exception → la boucle **s'arrête**
- Le `run(delayFrames=1)` pour le reschedule est APRÈS le try/except → ne se reschedule que si tout va bien
- Auto-start via `run(delayFrames=1)` en module-level → pas d'appel direct à `tick()` pendant le cook d'init

**`_ensure_poll_script` :** ne réécrire le texte que si le DAT vient d'être créé (pas à chaque init), pour éviter de reset le module et relancer tick.

```python
def _ensure_poll_script(self) -> None:
    ps = self.ownerComp.op("poll_script")
    created = False
    if not ps:
        ps = self.ownerComp.create("textDAT", "poll_script")
        ps.nodeX = 400
        ps.nodeY = -100
        ps.viewer = True
        created = True
    if created or ps.text.strip() != self._POLL_SCRIPT.strip():
        ps.text = self._POLL_SCRIPT
```

**`__init__` :** retirer `_start_flush_loop()`, garder seulement `_ensure_poll_script()`.

### Étape 7 : Restaurer l'extension TD après les tests

L'extension a été vidée en urgence (`td.par.extension1 = ''`). Il faut la remettre avec l'expression `ext0object` correcte. Ceci sera fait via MCP après implémentation.

---

## Vérification

1. **Tests unitaires** : `cd TDDocker && python -m pytest python/tests/ -v` — tous passent
2. **Lint** : `ruff check python/` — pas de nouvelle erreur
3. **Test manuel TD** :
   - Toggle NDI → pas de freeze
   - Check Docker (bouton) → réponse instantanée, status update au frame suivant
   - View Logs → pas de freeze
   - Remove Project (running) → containers stoppés PUIS COMPs détruits (vérifier ordre)
   - Rebuild (running) → down complet avant destroy + reload
4. **MCP** : vérifier que le flush loop tourne (ajouter un callback test, vérifier qu'il est consommé)
5. **MCP** : Docker down → Load → Up → vérifier message d'erreur dans le log
6. **MCP** : Restaurer l'extension → vérifier 60 FPS stable, pas de spam
