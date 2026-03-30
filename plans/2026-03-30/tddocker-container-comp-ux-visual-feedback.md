<!-- session_id: 84e6d814-9413-4da1-be34-591ceb341b4a -->
# TDDocker — Container COMP UX (Visual Feedback)

## Context

Les container COMPs sont des baseCOMP gris sans feedback visuel. L'utilisateur veut voir d'un coup d'oeil le nom du service, son etat, et une couleur representative.

## Design

### Visuel dans la preview (opviewer)

Chaque container COMP contient un **textTOP** (`status_display`) qui montre :
```
osc-test
━━━━━━━━
● RUNNING
```
- Ligne 1 : nom du service (gras)
- Ligne 2 : separateur
- Ligne 3 : indicateur etat (● + texte)

Le textTOP est set comme `opviewer` du COMP → visible dans le network editor.

**Resolution :** 320x200 (petit, lisible dans le network)

### Couleurs

| Etat | Couleur COMP (node) | Couleur fond textTOP | Couleur texte etat |
|------|--------------------|--------------------|-------------------|
| `created` / jamais lance | Gris `(0.4, 0.4, 0.4)` | `(0.15, 0.15, 0.15)` | Gris clair |
| `running` + healthy/none | Vert `(0.2, 0.6, 0.2)` | `(0.05, 0.15, 0.05)` | Vert |
| `running` + unhealthy | Rouge `(0.7, 0.2, 0.2)` | `(0.15, 0.05, 0.05)` | Rouge |
| `exited` / `dead` | Rouge `(0.7, 0.2, 0.2)` | `(0.15, 0.05, 0.05)` | Rouge |
| `paused` | Jaune `(0.7, 0.6, 0.1)` | `(0.15, 0.12, 0.02)` | Jaune |

Note : "en cours de lancement" = l'etat entre Load (created) et le premier poll qui retourne `running`. On peut traiter `created` apres un Up comme jaune. Simple : si le container a un ID mais state != running → jaune.

### Mise a jour

La couleur/texte se met a jour dans `PollStatus()` de l'orchestrateur — deja appele toutes les 2s. Apres la mise a jour des parametres State/Health, on appelle une nouvelle methode `_update_container_display(child, state, health)`.

## Implementation

### Fichier : `python/td_docker/td_docker_ext.py`

**1. Dans `_init_container_comp()`** — apres creation du `log_dat`, creer le textTOP :

```python
# Create status display TOP
if not comp.op("status_display"):
    txt = comp.create("textTOP", "status_display")
    txt.par.resolutionw = 320
    txt.par.resolutionh = 200
    txt.par.text = f"{svc_name}\n━━━━━━━━\n● CREATED"
    txt.par.fontsizex = 18
    txt.par.alignx = 1  # center
    txt.par.aligny = 1  # center
    txt.par.fontcolorr, txt.par.fontcolorg, txt.par.fontcolorb = 0.8, 0.8, 0.8
    txt.par.bgcolorr, txt.par.bgcolorg, txt.par.bgcolorb = 0.15, 0.15, 0.15
    txt.par.bgalpha = 1
    txt.viewer = True
comp.par.opviewer = comp.op("status_display")
```

**2. Nouvelle methode `_update_container_display()`** :

```python
_STATE_COLORS = {
    "running":  {"comp": (0.2, 0.6, 0.2), "bg": (0.05, 0.15, 0.05), "fg": (0.3, 0.9, 0.3)},
    "created":  {"comp": (0.4, 0.4, 0.4), "bg": (0.15, 0.15, 0.15), "fg": (0.6, 0.6, 0.6)},
    "paused":   {"comp": (0.7, 0.6, 0.1), "bg": (0.15, 0.12, 0.02), "fg": (0.9, 0.8, 0.2)},
    "exited":   {"comp": (0.7, 0.2, 0.2), "bg": (0.15, 0.05, 0.05), "fg": (0.9, 0.3, 0.3)},
    "dead":     {"comp": (0.7, 0.2, 0.2), "bg": (0.15, 0.05, 0.05), "fg": (0.9, 0.3, 0.3)},
}

def _update_container_display(self, comp, state, health):
    txt = comp.op("status_display")
    if not txt:
        return
    svc_name = comp.par.Servicename.eval()

    # Unhealthy override
    effective = state
    if state == "running" and health == "unhealthy":
        effective = "dead"  # red colors

    colors = _STATE_COLORS.get(effective, _STATE_COLORS["created"])

    # Yellow for "has container ID but not running yet"
    cid = comp.par.Containerid.eval() if hasattr(comp.par, "Containerid") else ""
    if cid and state == "created":
        colors = _STATE_COLORS["paused"]  # yellow = starting

    # Update text
    symbol = "●"
    label = state.upper()
    if health == "unhealthy":
        label = "UNHEALTHY"
    txt.par.text = f"{svc_name}\n━━━━━━━━\n{symbol} {label}"

    # Update colors
    txt.par.fontcolorr, txt.par.fontcolorg, txt.par.fontcolorb = colors["fg"]
    txt.par.bgcolorr, txt.par.bgcolorg, txt.par.bgcolorb = colors["bg"]
    comp.color = colors["comp"]
```

**3. Dans `PollStatus()`** — appeler apres la mise a jour des parametres :

```python
self._update_container_display(child, st.state, st.health or "none")
```

**4. Cleanup list** dans `_configure_data_transport`/`_configure_video_transport` — ne PAS detruire `status_display` (il n'est pas dans la liste, donc OK).

### Fichiers modifies

| Fichier | Change |
|---------|--------|
| `TDDocker/python/td_docker/td_docker_ext.py` | `_init_container_comp` + `_update_container_display` + appel dans `PollStatus` |

Pas de nouveaux fichiers, pas de nouveau test (c'est purement visuel TD).

## Verification

1. Load + Up → les COMPs containers montrent le nom + "● RUNNING" en vert
2. Down → les COMPs restent avec le dernier etat (ou gris si jamais lance)
3. Container unhealthy → COMP rouge + texte "● UNHEALTHY"
4. Visuellement lisible dans le network editor de TD
