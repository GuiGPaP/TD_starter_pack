<!-- session_id: ef8d182e-4681-4c88-a70b-e2075d18223e -->
# Plan : Mettre à jour les skills avec les lessons learned

## Context

Session SLlidar a produit 6 lessons significatives qui ne sont PAS dans les skills actuels. Les memories sont créées mais les skills (td-guide, td-python) qui guident le comportement futur doivent être mis à jour.

## Fichiers à modifier

### 1. `td-guide/SKILL.md` — Ajouter 3 guardrails

Après le guardrail 16, ajouter :

**17. oscinCHOP pour données haute fréquence.** Pour des données OSC à haute fréquence (capteurs, lidar, >10Hz), utiliser `oscinCHOP` (natif, performant) plutôt que `oscinDAT` + tableDAT (parsing = 780K cells/sec = FPS drops). TDDocker crée oscinDAT par défaut via `Datatransport = 'osc'` — pour les capteurs, créer l'oscinCHOP manuellement.

**18. pulse() est frame-delayed.** `comp.par.Load.pulse()`, `comp.par.Up.pulse()` etc. ne s'exécutent qu'au frame suivant. Ne jamais essayer de lire le résultat dans le même script. Utiliser `run("...", delayFrames=2)` pour chaîner des opérations dépendantes.

**19. parexecDAT callbacks minimaux.** Les callbacks dans un parameterexecuteDAT doivent être minimaux — pas de `debug()`, pas de logique complexe. Pattern exact :
```python
def onPulse(par):
    ext = par.owner.ext.MyExtName
    if ext and hasattr(ext, 'onParPulse'):
        ext.onParPulse(par)
```

### 2. `td-guide/references/python-environment.md` — Compléter Thread Manager + ajouter pattern non-bloquant

Dans la section Threading, après le ThreadManager :

- Ajouter : **SuccessHook/ExceptHook may not fire** — en pratique les callbacks TDTask ne se déclenchent pas de manière fiable. Utiliser le pattern `threading.Thread + run(delayFrames)` comme alternative robuste.
- Ajouter section "Non-blocking subprocess pattern" :
```python
# Background thread for blocking calls
self._result = None
t = threading.Thread(target=self._blocking_work, daemon=True)
t.start()
# Poll on main thread
run(f"op('{comp.path}').ext.MyExt._poll()", delayFrames=1)

def _poll(self):
    if self._result is None:
        run(..., delayFrames=1)  # keep polling
        return
    # Result ready — safe to use TD ops here
    self.ownerComp.par.Status.val = 'Done'
```

### 3. `td-guide/references/basics/operator-creation.md` — Extension wiring pattern

Ajouter section "Extension Wiring on baseCOMP" :
- `comp.par.ext.sequence.numBlocks = 1` pour activer les slots
- ext0object en **CONSTANT mode** (pas EXPRESSION) : `op('./ext_dat').module.MyExt(me)`
- `project` n'est PAS disponible dans le contexte ext0object — utiliser des chemins relatifs ou inline le code
- Pour les imports externes, résoudre le chemin dans les méthodes (pas dans `__init__` ou module-level)

### 4. `td-python/references/tdresources.md` — Thread Manager warning

Ajouter après la section WebClient, avant FileDownloader :

```markdown
## ThreadManager (Caveats)

`op.TDResources.ThreadManager` exists (TD 2023+) but **SuccessHook callbacks do not fire reliably** in practice. See td-guide → python-environment.md for the recommended `threading.Thread + run()` pattern instead.
```

### 5. `td-guide/references/index.md` — Ajouter entrée performance

Ajouter une ligne au tableau :
```
| Performance profiling, cook time, FPS monitoring, Perform CHOP | @python-environment.md |
```

## Vérification

- Relire chaque fichier modifié pour vérifier cohérence
- Les nouveaux guardrails ne contredisent pas les existants
- Les patterns code compilent (syntaxe Python correcte)
