<!-- session_id: ef8d182e-4681-4c88-a70b-e2075d18223e -->
# Plan : Test lidar RPLidar A1 via TDDocker + OSC

## Context

Le stack Docker ROS2 + OSC bridge est prêt et intégré dans TDDocker. Le lidar RPLidar A1 est sur bus USB 4-4 (CP210x, affiché COM5 par usbipd / COM14 dans Device Manager Windows). Il faut l'attacher à WSL2 et lancer le container avec accès hardware.

## Étapes

### 1. Attacher le lidar à WSL2

```bash
usbipd attach --busid 4-4 --wsl
```

Vérifier qu'il apparaît dans WSL2 :
```bash
wsl ls -la /dev/ttyUSB*
```

### 2. Modifier docker-compose.windows.yml pour monter le device

Décommenter la section `devices` dans `docker-compose.windows.yml` :
```yaml
devices:
  - /dev/ttyUSB0:/dev/ttyUSB0
```

Et ajouter `cap_add: [CAP_DAC_OVERRIDE]` pour l'accès device.

### 3. Rebuild + lancer via TDDocker

Dans TD :
1. `Compose File` → `TD_SLlidar_docker/docker-compose.windows.yml`
2. **Load**
3. Sur le COMP `sllidar` : `Datatransport` = osc, `Dataport` = 7000
4. **Up**

Ou en CLI pour tester d'abord :
```bash
cd TD_SLlidar_docker
docker compose -f docker-compose.windows.yml up -d --build
docker logs -f sllidar_ros2
```

### 4. Vérifier les données OSC dans TD

- Le `data_in` tableDAT dans `/TDDocker/containers/sllidar` devrait recevoir des lignes
- Adresses : `/lidar/polar`, `/lidar/cartesian`, `/lidar/info`

## Fichiers à modifier

| Fichier | Changement |
|---------|-----------|
| `docker-compose.windows.yml` | Décommenter `devices` section |

## Vérification

1. `usbipd attach` réussit, `/dev/ttyUSB0` visible dans WSL
2. Container démarre sans erreur `80008004`
3. Logs montrent `sllidar_node` publie sur `/scan`
4. Logs montrent `osc_bridge` envoie des scans
5. `data_in` dans TD reçoit des données
