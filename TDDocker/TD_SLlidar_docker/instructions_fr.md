# Récapitulatif - Intégration ROS2 LIDAR avec TouchDesigner via Docker

## 📋 Demande Initiale

### Contexte
- **Objectif** : Intégrer un projet ROS2 (sllidar_ros2) dans Docker pour le contrôler depuis TouchDesigner (Windows)
- **Projet source** : Package ROS2 pour contrôler des LIDAR SLAMTEC
- **Besoin spécifique** : Pouvoir choisir dynamiquement depuis TouchDesigner l'argument de la fonction `ros2 launch sllidar_ros2` (notamment le choix du modèle de LIDAR)
- **Environnement** : TouchDesigner sur Windows, Docker pour l'isolation du système ROS2

### Défis Techniques
1. Communication bidirectionnelle entre TouchDesigner (Windows) et Docker (Linux/ROS2)
2. Contrôle dynamique des paramètres de lancement ROS2
3. Streaming des données LIDAR en temps réel vers TouchDesigner
4. Gestion des différents modèles de LIDAR avec leurs configurations spécifiques

## 🚀 Solution Proposée

### Architecture Globale

```
TouchDesigner (Windows)     ←→     Docker Container
         │                              │
    [Interface UI]                 [ROS2 + sllidar]
         │                              │
    [Web Client DAT]               [API REST/WebSocket]
    [WebSocket DAT]                [FastAPI Server]
         │                              │
    [Visualisation]                [LIDAR Data Stream]
```

### Composants Développés

#### 1. **Conteneur Docker**
- Image basée sur `ros:humble-ros-base`
- Intégration du package sllidar_ros2
- Installation des dépendances Python pour l'API
- Configuration des permissions USB pour accès au LIDAR
- Exposition des ports pour l'API (8080) et WebSocket (9090)

#### 2. **API Bridge (FastAPI)**
Un serveur Python qui fait le pont entre TouchDesigner et ROS2 :

**Endpoints REST :**
- `POST /launch` : Lance un LIDAR avec le modèle spécifié
- `POST /stop` : Arrête le LIDAR en cours
- `GET /status` : Retourne l'état actuel du système
- `GET /models` : Liste les modèles de LIDAR disponibles

**WebSocket :**
- `/ws` : Stream temps réel des données LIDAR (angles, distances, intensités)

**Fonctionnalités :**
- Gestion dynamique des processus ROS2
- Buffer circulaire pour les données LIDAR
- Broadcasting multi-clients WebSocket
- Configuration automatique selon le modèle de LIDAR

#### 3. **Intégration TouchDesigner**
- **Web Client DAT** : Envoi des commandes de contrôle
- **WebSocket DAT** : Réception des données temps réel
- **Scripts Python** : 
  - Lancement/arrêt du LIDAR
  - Parsing des données JSON
  - Conversion polaire → cartésien
- **Visualisation** : Pipeline de rendu des points LIDAR

### Modèles de LIDAR Supportés

| Modèle | Baudrate | Launch File |
|--------|----------|-------------|
| A1 | 115200 | sllidar_a1_launch.py |
| A2M7 | 256000 | sllidar_a2m7_launch.py |
| A2M8 | 115200 | sllidar_a2m8_launch.py |
| A2M12 | 256000 | sllidar_a2m12_launch.py |
| A3 | 256000 | sllidar_a3_launch.py |
| S1 | 256000 | sllidar_s1_launch.py |
| S2 | 1000000 | sllidar_s2_launch.py |
| S3 | 1000000 | sllidar_s3_launch.py |
| C1 | 460800 | sllidar_c1_launch.py |
| T1 | UDP | sllidar_t1_launch.py |

## ✅ Fonctionnalités Réalisées

### Contrôle Dynamique
- ✅ Sélection du modèle de LIDAR depuis TouchDesigner
- ✅ Configuration automatique des paramètres (baudrate, port série)
- ✅ Lancement/arrêt à la demande
- ✅ Gestion des états et erreurs

### Communication Temps Réel
- ✅ Streaming WebSocket des données LIDAR
- ✅ Buffer de données côté serveur
- ✅ Format JSON optimisé pour TouchDesigner
- ✅ Support multi-clients

### Visualisation
- ✅ Conversion des données polaires en cartésiennes
- ✅ Pipeline de rendu dans TouchDesigner
- ✅ Affichage des intensités
- ✅ Mise à jour temps réel

### Docker & Déploiement
- ✅ Dockerfile complet avec toutes les dépendances
- ✅ Docker Compose pour orchestration simple
- ✅ Accès privilégié aux ports USB
- ✅ Script d'entrée pour initialisation ROS2

## 📁 Structure du Projet

```
sllidar_docker/
├── Dockerfile                    # Image Docker ROS2 + API
├── docker-compose.yml           # Orchestration des services
├── ros_entrypoint.sh           # Script d'initialisation
├── api_bridge/
│   ├── ros_api_server.py      # Serveur FastAPI/WebSocket
│   └── requirements.txt        # Dépendances Python
├── sllidar_ros2/               # Package ROS2 original
│   ├── src/
│   ├── launch/
│   └── ...
└── touchdesigner/
    └── sllidar_control.toe     # Projet TouchDesigner
```

## 🎯 Avantages de cette Solution

1. **Isolation** : ROS2 tourne dans Docker, indépendant du système Windows
2. **Flexibilité** : Changement de LIDAR sans redémarrer Docker
3. **Scalabilité** : Possibilité de gérer plusieurs LIDAR
4. **Temps réel** : WebSocket pour latence minimale
5. **Extensibilité** : Architecture prête pour d'autres capteurs ROS2
6. **Cross-platform** : Fonctionne sur Windows, Mac, Linux

## 🔧 Utilisation

### Côté Docker
```bash
# Build et lancement
docker-compose up --build

# L'API est accessible sur http://localhost:8080
# WebSocket sur ws://localhost:8080/ws
```

### Côté TouchDesigner
1. Ouvrir le projet `TD_SLlidar.toe`
2. Sélectionner le modèle de LIDAR dans le menu
3. Cliquer sur "Launch" pour démarrer
4. Les données s'affichent automatiquement
5. "Stop" pour arrêter le LIDAR

## 🔄 Flux de Données

```
LIDAR Hardware
     ↓ (USB/Serial)
Docker Container
     ↓ (ROS2 Topic /scan)
FastAPI Server
     ↓ (WebSocket JSON)
TouchDesigner
     ↓ (Processing)
Visualization
```

Cette solution répond complètement au besoin initial en permettant un contrôle total du système LIDAR depuis TouchDesigner, avec la possibilité de changer dynamiquement de modèle et de visualiser les données en temps réel.