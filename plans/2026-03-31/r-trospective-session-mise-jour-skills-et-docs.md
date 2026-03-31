<!-- session_id: d8d67442-82e4-461b-8530-4f4b42b4741f -->
# Plan: Rétrospective session — mise à jour skills et docs

## Context

Pendant cette session (async TDDocker), on a rencontré 9 problèmes récurrents qui auraient pu être évités si les skills/docs les documentaient. Objectif : patcher les fichiers de référence pour que ces erreurs ne se reproduisent pas.

## Problèmes rencontrés → Leçons

### 1. `textDAT.run()` ≠ `run()` global
**Ce qui s'est passé :** `ps.run('code_string', delayFrames=1)` — on pensait exécuter du code arbitraire, mais `textDAT.run()` exécute le *contenu du DAT*, pas la string passée.
**Fichier à patcher :** `td-guide/references/python-environment.md` — section Threading

### 2. poll_script sans auto-start ni guard
**Ce qui s'est passé :** Le flush loop ne démarrait jamais car appelé pendant `__init__`. Puis quand relancé N fois, N boucles parallèles → 3 FPS.
**Fichier à patcher :** `td-guide/references/python-environment.md` — ajouter un pattern "self-scheduling DAT loop"

### 3. `comp.ext.ExtName` throw si l'ext n'existe pas
**Ce qui s'est passé :** `td_docker.ext.TDDockerExt` → AttributeError quand l'extension est déchargée → spam d'erreurs chaque frame.
**Fichier à patcher :** `td-guide/references/python-environment.md` — guardrail `getattr(comp.ext, 'Name', None)`

### 4. `importlib.reload()` ne met pas à jour le module du textDAT
**Ce qui s'est passé :** `importlib.reload(sys.modules['td_docker.td_docker_ext'])` recharge depuis le fichier .py, mais le textDAT extension garde son ancien `.module`. Il faut toggler le texte du DAT.
**Fichier à patcher :** `td-guide/references/python-environment.md` — section module reload

### 5. f-string avec `\uXXXX` → SyntaxError (Python < 3.12)
**Ce qui s'est passé :** `f'{svc} \u2022 {indicator}'` dans une f-string imbriquée → SyntaxError. Les escapes unicode ne sont pas autorisés dans les expressions f-string avant Python 3.12.
**Fichier à patcher :** `td-lint/references/td-python-patterns.md`

### 6. textCOMP `par.text` en mode CONSTANT ignore les `\n`
**Ce qui s'est passé :** `sd.par.text = "line1\nline2"` affiche tout sur une ligne. En mode constant, les escape sequences sont traitées comme littéraux. Fix : `sd.par.text.expr = repr(content)`.
**Fichier à patcher :** `td-guide/references/basics/operator-creation.md` — section Parameters

### 7. `_projects` dict vide au reinit mais COMPs persistent
**Ce qui s'est passé :** Après un save/reload du .toe, `__init__` recrée `_projects = {}` mais les container COMPs existent toujours dans TD → `_load()` crée des doublons.
**Fichier à patcher :** `td-guide/references/python-environment.md` — guardrail extension state vs TD persistence

### 8. `check_docker()` ne matchait pas "failed to connect"
**Ce qui s'est passé :** Docker Desktop Windows retourne "failed to connect to the docker API at npipe://..." mais le parsing ne cherchait que "Cannot connect" et "connection refused".
**Fichier à patcher :** `TDDocker/CLAUDE.md` seulement (spécifique au projet)

### 9. `get_performance` MCP rapportait 60 FPS pendant un freeze à 3 FPS
**Ce qui s'est passé :** L'outil MCP a rapporté 60 FPS alors que l'utilisateur était à 3 FPS. Ne pas faire confiance au `get_performance` comme source de vérité.
**Fichier à patcher :** mémoire feedback

---

## Fichiers à modifier

### A. `td-guide/references/python-environment.md`
Ajouter/modifier les sections :

**1. Après "Non-blocking Subprocess Pattern" — nouveau pattern "Self-Scheduling DAT Loop"**
```markdown
### Self-Scheduling DAT Loop Pattern

For per-frame callbacks (flush queues, polling), use a textDAT that reschedules
itself via `run(delayFrames=1)` at module level:

```python
# poll_script textDAT content
import time as _time

def tick():
    try:
        ext = getattr(op('/myComp').ext, 'MyExt', None)
        if not ext:
            return  # Stop loop — no reschedule
        ext.on_tick()
    except Exception as e:
        print(f'tick error: {e}')
        return  # Stop loop on error
    # Only reschedule on success
    run('op("/myComp/poll_script").module.tick()', delayFrames=1)

# Auto-start on module load
run('op("/myComp/poll_script").module.tick()', delayFrames=1)
```

**Key rules:**
- Auto-start via module-level `run(delayFrames=1)` — NOT `tick()` directly
- `getattr(comp.ext, 'Name', None)` — never bare `.ext.Name`
- `return` without rescheduling on error or missing ext → loop dies gracefully
- `_ensure_poll_script` must NOT rewrite text if unchanged (avoids module reset → duplicate loops)
- `textDAT.run()` executes the DAT's own content — it does NOT execute an arbitrary string
```

**2. Nouvelle section "Extension Reinit & TD Persistence"**
```markdown
### Extension Reinit & TD Persistence

When `__init__` runs (project save/load, extension toggle), the Python instance
is fresh (`self._state = {}`) but **TD operators persist** (COMPs, DATs, TOPs
created by previous init). Always guard against duplicates:

```python
# BAD — creates duplicates on reinit
comp = parent.create("baseCOMP", "myComp")

# GOOD — reuse existing
comp = parent.op("myComp")
if not comp:
    comp = parent.create("baseCOMP", "myComp")
```
```

**3. Nouvelle section "Module Reload in TD"**
```markdown
### Module Reload

`importlib.reload()` updates `sys.modules` but does NOT update a textDAT's
`.module` cache. To force a textDAT to re-import:

```python
ext_dat = op('/myComp/my_ext_dat')
old = ext_dat.text
ext_dat.text = old + '\n'  # Toggle forces recompile
ext_dat.text = old
```
```

### B. `td-guide/references/basics/operator-creation.md`
Ajouter après la section "Parameters" :

```markdown
### textCOMP: Newlines and Formatting

`par.text` in constant mode treats escape sequences as literals — `\n` renders
as-is, not as a newline.

```python
# BAD — all on one line
txt.par.text = "line1\nline2"

# GOOD — use expression mode
txt.par.text.expr = repr("line1\nline2")
```

For rich text with colors, enable `par.formatcodes = True`:
```python
txt.par.formatcodes = True
txt.par.text.expr = repr("{#color(100,220,100)}green{#reset()}\nwhite")
```
```

### C. `td-lint/references/td-python-patterns.md`
Ajouter un guardrail :

```markdown
### f-string Unicode Escapes (Python < 3.12)

Backslash escapes (`\uXXXX`, `\n`) are NOT allowed inside f-string expression
parts before Python 3.12 (TD ships 3.11). Extract to a variable first:

```python
# BAD — SyntaxError in Python 3.11
f"  {branch} {_fc(key, f'{svc} \u2022 {ind}')}"

# GOOD
dot = "\u2022"
f"  {branch} {_fc(key, f'{svc} {dot} {ind}')}"
```
```

### D. `td-python/references/tdresources.md`
Ajouter à la section PopDialog un exemple d'usage dans une extension :

```markdown
### PopDialog from Extension Code

```python
def _show_popup(self):
    try:
        pop = self.ownerComp.op("/TDResources/popDialog")
        if not pop:
            return
    except Exception:
        return
    pop.Open(
        text="Docker is not running.\nStart Docker Desktop?",
        title="MyExt",
        buttons=["Start", "Cancel"],
        callback=self._on_popup,
        escButton=2, enterButton=1, escOnClickAway=True,
    )

def _on_popup(self, info):
    if info.get("buttonNum") == 1:
        self._do_action()
```
```

### E. Mémoire feedback
Mettre à jour `feedback_td_perf_patterns.md` et ajouter un nouveau fichier mémoire.

## Vérification

- Relire chaque fichier modifié pour s'assurer de la cohérence
- Pas de tests à exécuter — c'est de la doc uniquement
