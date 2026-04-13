<!-- session_id: f134bad3-cff5-496f-ba38-b1d449406646 -->
# Plan : Enrichir les skills TD avec Cook, Optimize, Troubleshooting, Dependency, Event, Probe

## Context

Les skills td-guide et td-python couvrent bien la creation d'operateurs, le linting, et les utilitaires Python, mais il manque des concepts fondamentaux de l'architecture TD : le systeme de cook (pull-based), l'optimisation performance, le troubleshooting/crash recovery, les dependances (tdu.Dependency), le systeme d'evenements (push vs pull), et l'outil Palette:probe. Ces lacunes font que le skill ne peut pas guider correctement sur la performance, le debugging avance, ou les patterns reactifs Python.

Sources : 7 pages officielles Derivative (Cook, Optimize, Troubleshooting_in_TouchDesigner, Dependency, Dependency_Class, Event, Palette:probe).

---

## Fichiers a creer (2)

### 1. `.claude/skills/td-guide/references/basics/cook-system.md`

Nouveau fichier — architecture du cook system.

**Sections :**
- **Pull-Based Architecture** : TD est pull — les ops ne cookent que quand un downstream a besoin + quelque chose a change. Lazy evaluation, le viewer est un consommateur.
- **Cook Conditions** : Deux conditions requises simultanement :
  - Cook REQUEST : downstream connecte, reference par parametre, viewer actif, CHOP/DAT export, `op.cook(force=True)`
  - Cook REASON : input a cooke, ref a cooke, parametre change, script execute, expression change, time-dependent
- **Cook Dependency Graph** : Wire = data dependency (lignes solides), references param = reference dependency (lignes pointillees). `allowCooking=False` sur COMP arrete la propagation.
- **Outils diagnostiques** : Middle-click (cook count/time), Performance Monitor (Alt+Y), Perform CHOP, Palette:probe (Ctrl+P). Cross-ref vers debugging.md et python-environment.md.
- **Pieges courants** : `cook(force=True)` depuis onFrameEnd = boucle infinie (cross-ref guardrail 21), `absTime.seconds` rend time-dependent, Script CHOP modifiant son input = feedback.

### 2. `.claude/skills/td-guide/references/basics/optimization.md`

Nouveau fichier — strategies d'optimisation.

**Sections :**
- **CPU-GPU Pipeline** : assembly line, CPU (Python/CHOP/SOP/DAT/params), GPU (TOP/render/GLSL)
- **Identifier le bottleneck** :
  - CPU-bound : halve TOP res, FPS ne change pas → CPU
  - GPU-bound : halve TOP res, FPS double → GPU
  - Hog CHOP test, Perform CHOP `cpumsec` vs `gpumsec`
- **Optimisation CPU** : reordonner ops, transform au niveau Object pas SOP, Null CHOP selective mode, pre-compute refs, eviter scripts per-frame, CHOP Execute onValueChange vs polling
- **Optimisation GPU** : reduire render res, Early Depth-Test, Back-Face Culling, reduire vertices/lights, desactiver features MAT inutiles
- **Memoire** : Audio Play CHOP charge tout en RAM (utiliser Audio File In), Commit Size Task Manager, `op.cpuMemory`/`op.gpuMemory`
- **Cooking conditionnel** : `COMP.allowCooking = False`, `op.bypass = True`, toggle sur visibilite

---

## Fichiers a mettre a jour (7)

### 3. `.claude/skills/td-guide/references/basics/debugging.md`

Ajouter 3 sections apres le contenu existant (apres ligne 62) :

**Section "Troubleshooting & Crash Recovery" :**
- CrashAutoSave : `CrashAutoSave.project.toe` sauvegarde auto au crash
- Safe Mode : renommer `.toe`, ouvrir TD vide, charger (bypass startup scripts)
- Startup Error Dialog : Edit > Preferences > General
- WinDbg Preview : `.dmp` files pour stack traces
- ToeExpand / ToeCollapse : conversion `.toe` en structure ASCII lisible (debug, diff, version control)

**Section "Palette:probe — Moniteur de Performance Visuel" :**
- Toggle Ctrl+P, ou charger depuis Palette > Monitor > probe
- Overlay sur chaque operateur montrant le cook time
- CPU = cercles, GPU = diamants, stack de 10 time slices
- COMPs = donuts (inner=children, outer=total)
- Navigation : left-click=entrer COMP, background click=remonter, middle-click=params, right-click=editeur separe
- Parametres cles : cputime/gputime, performembed, opacity, renderres
- Overhead minimal, arrete de cooker quand cache

**Section "Memory Debugging" :**
- Task Manager Details > Commit Size (plus precis que la colonne Memory par defaut)
- Python : `op.cpuMemory`, `op.gpuMemory` par operateur
- Perform CHOP : `gpu_mem_used`, `cpu_mem_used`

### 4. `.claude/skills/td-guide/references/basics/index.md`

Ajouter 2 lignes au tableau de routage :

```
| Cook system architecture, pull model, cook requests/reasons, dependency graph | @cook-system.md |
| Performance optimization, CPU/GPU bottleneck, resolution scaling, conditional cooking | @optimization.md |
```

### 5. `.claude/skills/td-guide/references/index.md`

Ajouter 2 lignes au tableau de routage :

```
| Cook system, pull-based architecture, cook dependencies, cook request/reason model | @basics/cook-system.md |
| Performance optimization, CPU/GPU bottleneck identification, resolution scaling, memory | @basics/optimization.md |
```

### 6. `.claude/skills/td-guide/SKILL.md`

**Mental Model** (ajouter 1 bullet) :
- TD uses a pull-based cook system: operators only compute when downstream needs data AND something changed. Reference dependencies (dashed lines) and wire connections both trigger cooks. See `@basics/cook-system.md`.

**Critical Guardrails** (ajouter guardrails 24-25 apres la 23) :

24. **Cook system is pull-based.** Operators only cook when two conditions are met: a downstream cook REQUEST exists AND a cook REASON occurred. If nothing is connected downstream and no viewer is active, the operator does not compute.

25. **Events are push-based, cooking is pull-based.** TD is a hybrid system. Execute DAT callbacks fire immediately on events (push). Operator cooking is lazy/pull. A callback firing does not mean the operator has cooked yet.

### 7. `.claude/skills/td-python/references/tdstoretools.md`

Ajouter section `## tdu.Dependency` apres la section DependDict (apres la ligne ~90).

**Contenu :**
- Constructor : `tdu.Dependency(val=None)`
- `.val` (read=cree dependency, write=notifie), `.peekVal` (read sans dependency), `.callbacks`, `.ops`, `.listAttributes`
- `.modified()` pour mutations in-place sur contenus mutables
- `.setVal(val, setInfo=None)` avec info optionnel passe aux callbacks
- Piege critique : `op('comp1').Scale = 5` ecrase le Dependency → utiliser `.val = 5`
- Piege mutable : `dep.val.append(4)` ne notifie pas → appeler `dep.modified()`
- Exemple callback complet
- Tableau comparatif : tdu.Dependency vs DependDict vs plain variable

### 8. `.claude/skills/td-python/references/td-python-patterns.md`

Ajouter section `## Event System & Execute DATs` apres Callback Signatures (apres ligne ~79).

**Contenu :**
- Modele hybride TD : pull (cooking) + push (events)
- Taxonomie Execute DATs :
  - Internal : CHOP Execute, Parameter Execute, DAT Execute, Execute DAT, OP Execute, OP Find
  - UI Input : Panel Execute, Render Pick, Multi Touch In, Keyboard In
  - External : MIDI In, OSC In, Serial, TCP/IP, WebSocket, UDP In, Art-Net, MQTT
- Script operators (Script CHOP/DAT/TOP/SOP) ne sont PAS event-based
- `OP.par.parname.pulse()` pour pulse parameters (cross-ref guardrail 18 : frame-delayed)
- Pattern Event-to-Cook Bridge : CHOP Execute qui stocke dans comp.store pour le systeme pull

### 9. `.claude/skills/td-python/SKILL.md`

Ajouter guardrails 26-27 :

26. **`tdu.Dependency.val` not direct assignment.** `op('comp').Scale = 5` overwrites the Dependency with a plain value. Use `.val = 5` to notify dependents. See `@tdstoretools.md`.

27. **Mutable Dependency contents require `.modified()`.** Appending to a list or modifying a dict inside a `tdu.Dependency` does not notify dependents. Call `dep.modified()` after in-place mutations.

---

## Ordre d'execution

1. Creer `cook-system.md` et `optimization.md` (pas de dependances)
2. Mettre a jour les index (`basics/index.md`, `references/index.md`)
3. Etendre `debugging.md` (3 nouvelles sections)
4. Etendre `tdstoretools.md` (section tdu.Dependency)
5. Etendre `td-python-patterns.md` (section Event System)
6. Mettre a jour `td-guide/SKILL.md` (mental model + guardrails 24-25)
7. Mettre a jour `td-python/SKILL.md` (guardrails 26-27)

---

## Verification

- Relire chaque index et verifier que les nouvelles lignes pointent vers des fichiers existants
- Verifier que les numeros de guardrails sont sequentiels (td-guide: 24-25, td-python: 26-27)
- Verifier qu'il n'y a pas de duplication avec le contenu existant dans `python-environment.md` (profiling) ou `tdstoretools.md` (DependDict)
- Cross-references internes : guardrail 21 depuis cook-system.md, guardrail 18 depuis td-python-patterns.md
