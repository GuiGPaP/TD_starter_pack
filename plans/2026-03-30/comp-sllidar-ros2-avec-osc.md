<!-- session_id: ef8d182e-4681-4c88-a70b-e2075d18223e -->
# Plan : COMP SLlidar_ros2 avec OSC

## Context

Le projet `TDDocker/TD_SLlidar_docker/` contient déjà un stack Docker complet (ROS2 Humble + sllidar_ros2 + FastAPI bridge) qui supporte 10 modèles de lidar Slamtec (serial + ethernet). Cependant, le pont actuel est REST/WebSocket — pas OSC. L'objectif est de remplacer ce pont par un noeud ROS2→OSC et créer un COMP TouchDesigner propre avec choix du format de données.

## Architecture cible

```
LIDAR (USB/Ethernet) → Docker Container (ROS2 Humble)
                         ├── sllidar_node (C++, /scan topic)
                         └── osc_bridge_node (Python, subscribes /scan → OSC UDP)
                                    │
                                    ▼ OSC UDP
                         TouchDesigner (Windows)
                         └── COMP SLlidar_ros2
                              ├── oscIn CHOP (reçoit les scans)
                              ├── Custom Pars (modèle, port, format, etc.)
                              └── Visualisation CHOP/SOP
```

## Étapes

### 1. Noeud ROS2→OSC (`osc_bridge_node.py`)

**Fichier :** `TDDocker/TD_SLlidar_docker/osc_bridge/osc_bridge_node.py`

- Noeud ROS2 Python qui subscribe à `/scan` (sensor_msgs/LaserScan)
- Utilise `python-osc` pour envoyer en UDP vers l'hôte
- **Paramètres ROS2 :**
  - `osc_host` (default: IP de l'hôte Docker, typiquement `host.docker.internal`)
  - `osc_port` (default: 7000)
  - `output_format` : `polar`, `cartesian`, `both`
- **Adresses OSC :**
  - `/lidar/polar` → blob/array : [angle0, range0, intensity0, angle1, range1, intensity1, ...]
  - `/lidar/cartesian` → blob/array : [x0, y0, intensity0, x1, y1, intensity1, ...]
  - `/lidar/info` → [angle_min, angle_max, angle_increment, num_points, timestamp]
- Conversion polaire→cartésien si format == `cartesian` ou `both`
- Dépendance : `python-osc` ajoutée au Dockerfile

### 2. Mise à jour Docker

**Fichiers à modifier :**
- `TDDocker/TD_SLlidar_docker/dockerfile` — ajouter `python-osc` aux deps pip, copier `osc_bridge/`
- `TDDocker/TD_SLlidar_docker/ros_entrypoint.sh` — lancer le osc_bridge_node en plus du sllidar_node
- `TDDocker/TD_SLlidar_docker/docker-compose.dev.yml` — exposer port UDP OSC (7000/udp), variables d'env pour `OSC_HOST`, `OSC_PORT`, `OSC_FORMAT`
- `TDDocker/TD_SLlidar_docker/docker-compose.yml` — idem
- `TDDocker/TD_SLlidar_docker/docker-compose.windows.yml` — idem
- `TDDocker/TD_SLlidar_docker/.env.example` — ajouter `OSC_HOST`, `OSC_PORT`, `OSC_FORMAT`

### 3. Launch file unifié

**Fichier :** `TDDocker/TD_SLlidar_docker/launch/sllidar_osc_launch.py`

- Lance sllidar_node + osc_bridge_node ensemble
- Paramètres passés via launch arguments (modèle, port série, baudrate, OSC config)
- Remplace l'approche "un launch file par modèle" par un seul launch paramétrique

### 4. COMP TouchDesigner `SLlidar_ros2`

**Fichier principal :** Script Python dans le COMP (extension)

**Custom Parameters du COMP :**
- Page "Connection" :
  - `Lidarmodel` (Menu : a1, a2m7, a2m8, a2m12, a3, s1, s2, s3, c1, t1)
  - `Channeltype` (Menu : serial, tcp, udp) — auto-set selon le modèle, overridable
  - `Serialport` (Str : /dev/ttyUSB0)
  - `Tcpip` (Str : 192.168.1.100) — visible si channeltype == tcp/udp
  - `Tcpport` (Int : 20108) — visible si channeltype == tcp/udp
  - `Baudrate` (Int : auto-set selon modèle, overridable)
  - `Scanmode` (Menu : Standard, Express, Boost, DenseBoost)
- Page "OSC" :
  - `Oscport` (Int : 7000)
  - `Oscformat` (Menu : polar, cartesian, both)
- Page "Docker" :
  - `Dockermode` (Menu : dev, windows, production)
  - `Start` (Pulse) — lance docker-compose up
  - `Stop` (Pulse) — lance docker-compose down
  - `Status` (Str, read-only) — état du container

**Opérateurs internes du COMP :**
- `oscinN` — OSC In CHOP configuré sur `Oscport`
- `select_polar` / `select_cartesian` — Select CHOPs filtrant les adresses OSC
- `info` — DAT affichant les métadonnées du scan (angle_min, num_points, etc.)
- Sortie CHOP avec les channels lidar (angles, ranges, intensities ou x, y, intensities)

**Extension Python du COMP :**
- Gère les callbacks des Pulse parameters (Start/Stop)
- Met à jour les variables d'env Docker selon les custom pars
- Polling du status Docker via `docker ps`
- Auto-configure baudrate/channeltype quand le modèle change

### 5. Simplification du code existant

- **Supprimer** `api_bridge/ros_api_server.py` (remplacé par osc_bridge_node)
- **Supprimer** les scripts TD `Touchdesigner/scripts/lidar_websocket.py`, `lidar_config.py`, `lidar_ui_controller.py` (remplacés par le COMP)
- **Garder** `td_lidar_controller.py` comme base pour l'extension du COMP (logique Docker/USB)

## Fichiers critiques

| Fichier | Action |
|---------|--------|
| `osc_bridge/osc_bridge_node.py` | **Créer** — noeud ROS2→OSC |
| `launch/sllidar_osc_launch.py` | **Créer** — launch unifié |
| `dockerfile` | **Modifier** — ajouter python-osc + osc_bridge |
| `ros_entrypoint.sh` | **Modifier** — lancer le launch unifié |
| `docker-compose.*.yml` (x3) | **Modifier** — port UDP, env vars OSC |
| `.env.example` | **Modifier** — variables OSC |
| `api_bridge/ros_api_server.py` | **Supprimer** (remplacé) |
| `Touchdesigner/scripts/*.py` | **Supprimer** (remplacés par le COMP) |

## Vérification

1. **Build Docker** : `docker-compose -f docker-compose.dev.yml build` — doit réussir
2. **Test OSC sans hardware** : Le osc_bridge_node en mode dev doit publier des scans fictifs (ou rester en attente silencieuse)
3. **Test TD** : Créer le COMP, vérifier que les custom pars fonctionnent, que l'oscIn CHOP reçoit quand Docker tourne
4. **Test multi-modèle** : Changer le menu Lidarmodel → vérifier que baudrate/channeltype s'adaptent
5. **Test format** : Switcher polar/cartesian/both → vérifier les channels CHOP
