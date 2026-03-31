<!-- session_id: 9c54df77-41a9-4582-8d68-24559db21dcd -->
# Plan: Callbacks transport + bind ports + layout

## Context

Suite du refactor Transport. L'utilisateur a déjà configuré les binds `parent().par.Oscinport` etc. sur les opérateurs dans TD. Il faut maintenant que le code Python :
1. Recrée les callback DATs (`oscin_callbacks`, `websocket_callbacks`) sous osc_in / websocket_dat
2. Utilise des expressions bind au lieu de valeurs fixes pour les ports
3. Inclue les callbacks dans le layout et le teardown

## Fichiers à modifier

### 1. `TDDocker/python/td_docker/td_container_ext.py`

**`_TRANSPORT_OPS`** — ajouter les callbacks pour le teardown :
```python
_TRANSPORT_OPS = {
    "osc": ("osc_in", "osc_out", "oscin_callbacks"),
    "ws": ("websocket_dat", "websocket_callbacks"),
    "ndi": ("video_in", "video_out"),
}
```

**`_configure_osc()`** — remplacer les ports hardcodés par des bind expressions + créer le callback DAT :
```python
osc_in.par.port.expr = "parent().par.Oscinport"
osc_out.par.port.expr = "parent().par.Oscoutport"

from td_docker.transports.osc import CALLBACK_SCRIPT
cb = self.ownerComp.create("textDAT", "oscin_callbacks")
cb.text = CALLBACK_SCRIPT
osc_in.par.callbacks = cb
```

**`_configure_websocket()`** — idem :
```python
ws.par.port.expr = "parent().par.Wsport"

from td_docker.transports.websocket import CALLBACK_SCRIPT
cb = self.ownerComp.create("textDAT", "websocket_callbacks")
cb.text = CALLBACK_SCRIPT
ws.par.callbacks = cb
```

### 2. `TDDocker/python/td_docker/td_docker_ext.py`

**`_layout_container_ops()`** — ajouter les callbacks sous leurs opérateurs respectifs, et les inclure dans la liste de stale ops à ne PAS supprimer :
```python
layout = {
    "status_display":        (0, 0),
    "log_dat":               (200, 0),
    "td_container_ext":      (0, -200),
    "parexec1":              (200, -200),
    # OSC
    "osc_in":                (0, -400),
    "oscin_callbacks":       (0, -600),
    "osc_out":               (200, -400),
    # WebSocket
    "websocket_dat":         (400, -400),
    "websocket_callbacks":   (400, -600),
    # NDI
    "video_in":              (0, -800),
    "video_out":             (200, -800),
}
```

**Stale ops list** — retirer `oscin_callbacks` et `websocket_callbacks` de la liste de suppression (garder uniquement les vrais anciens noms : `osc_in_callbacks`, `websocket_dat_callbacks`, `osc_callbacks`, `ws_callbacks`).

### 3. `TDDocker/python/td_docker/transports/osc.py` et `websocket.py`

Les CALLBACK_SCRIPT référencent `osc_data` / `ws_data` (tableDATs supprimés). Comme l'utilisateur dit que les données se lisent directement sur l'opérateur, les callbacks gardent uniquement le logging. Mettre à jour les scripts pour retirer les écritures vers les tableDATs inexistants.

## Verification

1. `python -m pytest python/tests/ -v` — pas de régression
2. Recharger extension dans TD, activer OSC → osc_in + oscin_callbacks apparaissent, port bindé
3. Activer WS → websocket_dat + websocket_callbacks apparaissent, port bindé
4. Désactiver → tous les ops supprimés proprement
5. Vérifier layout sans overlap
