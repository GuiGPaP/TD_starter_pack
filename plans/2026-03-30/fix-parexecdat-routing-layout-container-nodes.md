<!-- session_id: ef8d182e-4681-4c88-a70b-e2075d18223e -->
# Plan : Fix parexecDAT routing + layout container nodes

## Context

Le COMP SLlidar launcher fonctionne quand on appelle `ext._start()` directement, mais le bouton Start (pulse parameter) ne déclenche pas le callback via parexecDAT. De plus, les nodes dans `/TDDocker/containers/sllidar` ne sont pas ordonnés proprement.

## Fix 1 : parexecDAT

Le script du parexecDAT utilise `debug()` et `hasattr()` qui peuvent échouer silencieusement dans le contexte d'exécution du DAT. Solution : simplifier pour matcher exactement le pattern TDDocker (qui fonctionne) :

```python
def onValueChange(par, prev):
    return

def onPulse(par):
    ext = par.owner.ext.SLlidarLauncherExt
    if ext and hasattr(ext, 'onParPulse'):
        ext.onParPulse(par)
```

**Fichier** : textDAT `/TDDocker/SLlidar/parexec1` (via `set_dat_text`)

## Fix 2 : Layout nodes dans container COMP

Utiliser `layout_nodes` MCP tool pour ordonner les nodes dans `/TDDocker/containers/sllidar` :
- Ligne 1 (OSC) : `osc_in` → `osc_callbacks` → `data_in` (horizontal)
- Ligne 2 (infra) : `osc_out`, `osc_in_callbacks`
- Ligne 3 (system) : `td_container_ext`, `parexec1`, `log_dat`, `status_display`

Utiliser `layout_nodes` en mode horizontal avec spacing adapté.

## Vérification

1. Pulse Start via MCP → status passe à "Running"
2. Pulse Stop → status passe à "Stopped"
3. Les nodes dans le container COMP sont alignés visuellement
