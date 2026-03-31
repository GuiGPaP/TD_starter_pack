<!-- session_id: 9c54df77-41a9-4582-8d68-24559db21dcd -->
# Plan: Refactor Transport page — toggles individuels par transport

## Context

La page Transport des container COMPs utilise actuellement un menu unique "Data Transport" (none/websocket/osc) et "Video Transport" (none/ndi). L'utilisateur veut des **toggles indépendants** pour chaque type de transport, avec les paramètres d'entrée/sortie (port, source) visibles par transport.

## Nouveau layout de la page Transport

```
── OSC ──────────────────
  Oscenable     [toggle]
  Oscinport     [int]      ← port écoute TD (oscinDAT)
  Oscoutport    [int]      ← port envoi TD (oscoutDAT)

── WebSocket ────────────
  Wsenable      [toggle]
  Wsport        [int]      ← port websocketDAT

── NDI ──────────────────
  Ndienable     [toggle]
  Ndisource     [str]      ← NDI source name
```

Chaque toggle active/désactive indépendamment son transport. Plusieurs transports peuvent être actifs simultanément (OSC + NDI par exemple).

## Paramètres supprimés

- `Datatransport` (menu) → remplacé par `Oscenable` + `Wsenable`
- `Dataport` (int) → remplacé par `Oscinport`/`Oscoutport`/`Wsport`
- `Videotransport` (menu) → remplacé par `Ndienable`

## Fichiers à modifier

### 1. `TDDocker/python/td_docker/td_container_ext.py`

**`onParValueChange`** — router les nouveaux noms :
```python
def onParValueChange(self, par, prev):
    name = par.name
    if name == "Oscenable":
        self._configure_osc()
    elif name == "Wsenable":
        self._configure_websocket()
    elif name == "Ndienable":
        self._configure_ndi()
    elif name == "Ndisource":
        self._update_ndi_source()
```

**Nouvelles méthodes** (remplacent `_configure_data_transport` et `_configure_video_transport`) :

- `_configure_osc()` : si `Oscenable` → créer osc_in, osc_out, data_in, osc_callbacks ; sinon détruire
- `_configure_websocket()` : si `Wsenable` → créer websocket_dat, ws_data_in, ws_callbacks ; sinon détruire
- `_configure_ndi()` : si `Ndienable` → créer video_in, video_out + notify orchestrator ; sinon détruire

**Important** : OSC et WS peuvent être actifs en même temps → le tableDAT data ne peut plus s'appeler `data_in` pour les deux. Renommer :
- OSC → `osc_data` (tableDAT)
- WebSocket → `ws_data` (tableDAT)

**`_DATA_OPS` / `_VIDEO_OPS`** → remplacer par `_TRANSPORT_OPS` :
```python
_TRANSPORT_OPS = {
    "osc": ("osc_in", "osc_out", "osc_data", "osc_callbacks"),
    "ws": ("websocket_dat", "ws_data", "ws_callbacks"),
    "ndi": ("video_in", "video_out"),
}
```

**`ensureTransports()`** — vérifier chaque toggle indépendamment :
```python
def ensureTransports(self):
    for key, enable_par, ops in [
        ("osc", "Oscenable", self._configure_osc),
        ("ws", "Wsenable", self._configure_websocket),
        ("ndi", "Ndienable", self._configure_ndi),
    ]:
        enabled = (getattr(self.ownerComp.par, enable_par, None) or False)
        expected = self._TRANSPORT_OPS[key]
        if enabled and any(not self.ownerComp.op(n) for n in expected):
            ops()
```

**`_notify_ndi_enabled`** — inchangé.
**`_update_ndi_source`** — inchangé.

### 2. `TDDocker/python/td_docker/td_docker_ext.py`

**`_init_container_comp()` (~line 1072-1086)** — nouvelle page Transport :
```python
transport_page = comp.appendCustomPage("Transport")
# OSC
transport_page.appendToggle("Oscenable", label="OSC")[0].val = False
transport_page.appendInt("Oscinport", label="OSC In Port")[0].val = 0
transport_page.appendInt("Oscoutport", label="OSC Out Port")[0].val = 0
# WebSocket
transport_page.appendToggle("Wsenable", label="WebSocket")[0].val = False
transport_page.appendInt("Wsport", label="WS Port")[0].val = 0
# NDI
transport_page.appendToggle("Ndienable", label="NDI")[0].val = False
transport_page.appendStr("Ndisource", label="NDI Source")[0].val = ""
```

**parexecDAT pars** (~line 1121-1123) :
```python
pe.par.pars = (
    "Start Stop Restart Logs "
    "Oscenable Wsenable Ndienable Ndisource"
)
```

**`_restore_projects()` (~line 271)** — NDI check :
```python
# Avant: str(comp.par.Videotransport) == "ndi"
# Après:
ndi_enabled = bool(getattr(comp.par, "Ndienable", False))
```

**`_ensure_transports_deferred()` (~line 309)** — filtre :
```python
# Avant: hasattr(c.par, "Datatransport")
# Après:
hasattr(c.par, "Oscenable")
```

### 3. `TDDocker/python/td_docker/transports/osc.py` et `websocket.py`

Vérifier si les CALLBACK_SCRIPT référencent `data_in` — si oui, mettre à jour :
- `osc.py` : `data_in` → `osc_data`
- `websocket.py` : `data_in` → `ws_data`

## Verification

1. `cd TDDocker && python -m pytest python/tests/ -v` — pas de régression
2. Dans TD : créer un container, activer OSC → osc_in/osc_out/osc_data apparaissent
3. Activer WS en même temps → websocket_dat/ws_data apparaissent (coexistence)
4. Désactiver OSC → ops OSC disparaissent, WS reste
5. Activer NDI → video_in/video_out apparaissent
6. Sauvegarder .toe, rouvrir → tous les transports actifs sont restaurés
