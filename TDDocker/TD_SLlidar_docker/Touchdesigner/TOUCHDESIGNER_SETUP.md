# TouchDesigner LIDAR Integration Guide

## 🎨 Configuration Complète de l'Interface

### Vue d'ensemble
Ce guide vous explique comment configurer TouchDesigner pour contrôler votre système LIDAR avec une interface utilisateur complète permettant de :
- Sélectionner le modèle de LIDAR
- Configurer le port série
- Définir l'adresse IP du serveur
- Lancer/arrêter le LIDAR
- Visualiser les données en temps réel

## 🛠️ Étapes de Configuration

### 1. Création du Projet TouchDesigner

#### A. Structure des Composants
Créez cette hiérarchie dans TouchDesigner :

```
/project1
├── /lidar_controller
│   ├── text_lidar_config (Text DAT)
│   ├── text_lidar_websocket (Text DAT)  
│   ├── text_lidar_ui (Text DAT)
│   ├── execute_main (Execute DAT)
│   └── /ui
│       ├── dropdown_model (Select COMP)
│       ├── dropdown_port (Select COMP)
│       ├── dropdown_ip (Select COMP)
│       ├── button_launch (Button COMP)
│       ├── button_stop (Button COMP)
│       ├── button_connect (Button COMP)
│       ├── button_test (Button COMP)
│       └── text_status (Text COMP)
└── /visualization
    ├── table_cartesian (Table DAT)
    ├── table_polar (Table DAT)
    ├── table_status (Table DAT)
    ├── geometry_points (Geometry COMP)
    └── render (Render TOP)
```

### 2. Configuration des Scripts Python

#### A. Script de Configuration (`text_lidar_config`)
1. **Créer un Text DAT** nommé `text_lidar_config`
2. **Copier le contenu** du fichier `scripts/lidar_config.py`
3. **Modifier l'API key** (ligne 15) :
```python
self.api_key = "VOTRE_CLE_API_ICI"  # Copiez depuis .env
```

#### B. Script WebSocket (`text_lidar_websocket`)
1. **Créer un Text DAT** nommé `text_lidar_websocket`
2. **Copier le contenu** du fichier `scripts/lidar_websocket.py`

#### C. Script UI Controller (`text_lidar_ui`)
1. **Créer un Text DAT** nommé `text_lidar_ui`
2. **Copier le contenu** du fichier `scripts/lidar_ui_controller.py`

### 3. Script Principal d'Initialisation

#### Execute DAT (`execute_main`)
Créez un Execute DAT avec ce code :

```python
# Initialization script for LIDAR system
def onStart():
    """Initialize LIDAR system on project start"""
    
    # Import scripts
    config_script = op('text_lidar_config')
    websocket_script = op('text_lidar_websocket')  
    ui_script = op('text_lidar_ui')
    
    # Execute scripts to load classes
    exec(config_script.text)
    exec(websocket_script.text)
    exec(ui_script.text)
    
    # Initialize components
    config_manager = init_lidar_config(me)
    websocket_client = init_websocket_client(me)
    ui_controller = init_ui_controller(me)
    
    # Set references
    ui_controller.set_references(config_manager, websocket_client)
    
    # Set table references for data visualization
    points_table = op('/project1/visualization/table_cartesian')
    polar_table = op('/project1/visualization/table_polar')
    status_table = op('/project1/visualization/table_status')
    
    websocket_client.set_tables(points_table, polar_table, status_table)
    
    # Set UI element references
    model_dropdown = op('/project1/lidar_controller/ui/dropdown_model')
    port_dropdown = op('/project1/lidar_controller/ui/dropdown_port')
    ip_dropdown = op('/project1/lidar_controller/ui/dropdown_ip')
    launch_button = op('/project1/lidar_controller/ui/button_launch')
    stop_button = op('/project1/lidar_controller/ui/button_stop')
    connect_button = op('/project1/lidar_controller/ui/button_connect')
    status_text = op('/project1/lidar_controller/ui/text_status')
    
    ui_controller.set_ui_elements(
        model_dropdown, port_dropdown, ip_dropdown,
        launch_button, stop_button, connect_button, status_text
    )
    
    # Initialize UI
    ui_controller.initialize_ui()
    
    print("LIDAR system initialized successfully")

def onExit():
    """Cleanup on project exit"""
    # Stop LIDAR and disconnect WebSocket
    if 'lidar_ui' in globals() and lidar_ui:
        if lidar_ui.is_connected:
            lidar_ui.websocket_client.disconnect()
        if lidar_ui.is_lidar_running:
            lidar_ui.config_manager.stop_lidar()
    
    print("LIDAR system cleanup completed")
```

### 4. Configuration de l'Interface Utilisateur

#### A. Dropdown LIDAR Model (`dropdown_model`)
1. **Créer un Select COMP**
2. **Paramètres** :
   - Items: `a1 a2m7 a2m8 a2m12 a3 s1 s2 s3 c1 t1`
   - Labels: `"RPLIDAR A1" "RPLIDAR A2M7" "RPLIDAR A2M8" ...`
3. **Callback Script** :
```python
def onValueChange(comp, prev):
    if 'lidar_ui' in globals() and lidar_ui:
        selected_model = comp.par.items.eval().split()[comp.par.menuindex]
        lidar_ui.on_model_change(selected_model)
```

#### B. Dropdown Port Série (`dropdown_port`)
1. **Créer un Select COMP**
2. **Paramètres** :
   - Items: `/dev/ttyUSB0 /dev/ttyUSB1 /dev/ttyACM0 COM1 COM2 COM3 COM4`
3. **Callback Script** :
```python
def onValueChange(comp, prev):
    if 'lidar_ui' in globals() and lidar_ui:
        selected_port = comp.par.items.eval().split()[comp.par.menuindex]
        lidar_ui.on_port_change(selected_port)
```

#### C. Dropdown Adresse IP (`dropdown_ip`)
1. **Créer un Select COMP**
2. **Paramètres** :
   - Items: `localhost 127.0.0.1 192.168.1.100 192.168.1.101`
3. **Callback Script** :
```python
def onValueChange(comp, prev):
    if 'lidar_ui' in globals() and lidar_ui:
        selected_ip = comp.par.items.eval().split()[comp.par.menuindex]
        lidar_ui.on_ip_change(selected_ip)
```

#### D. Boutons de Contrôle

**Button Launch (`button_launch`)** :
```python
def onOffToOn(comp, prev):
    if 'lidar_ui' in globals() and lidar_ui:
        lidar_ui.on_launch_button()
```

**Button Stop (`button_stop`)** :
```python
def onOffToOn(comp, prev):
    if 'lidar_ui' in globals() and lidar_ui:
        lidar_ui.on_stop_button()
```

**Button Connect WebSocket (`button_connect`)** :
```python
def onOffToOn(comp, prev):
    if 'lidar_ui' in globals() and lidar_ui:
        lidar_ui.on_connect_button()
```

**Button Test Connection (`button_test`)** :
```python
def onOffToOn(comp, prev):
    if 'lidar_ui' in globals() and lidar_ui:
        lidar_ui.on_test_connection_button()
```

### 5. Visualisation des Données

#### A. Tables de Données
1. **table_cartesian** : Coordonnées X,Y des points LIDAR
2. **table_polar** : Angles et distances
3. **table_status** : État de connexion et statistiques

#### B. Géométrie 3D (`geometry_points`)
Créez un Geometry COMP pour visualiser les points :

```python
# Dans un Script DAT connecté au Geometry COMP
def onPulse(comp):
    """Update geometry from LIDAR data"""
    
    # Get cartesian table
    points_table = op('/project1/visualization/table_cartesian')
    
    if points_table.numRows > 1:  # Skip header
        # Clear existing geometry
        comp.clear()
        
        # Add points from table
        for i in range(1, points_table.numRows):  # Skip header row
            x = float(points_table[i, 0].val)
            y = float(points_table[i, 1].val)
            intensity = float(points_table[i, 2].val)
            
            # Create point with color based on intensity
            color = [intensity/255, 0.5, 1.0]  # Blue to white gradient
            comp.appendPoint([x, y, 0], color=color)
```

### 6. Configuration Réseau

#### Adresses IP Courantes
- **Développement local** : `localhost` ou `127.0.0.1`
- **Réseau local** : `192.168.1.x` ou `192.168.0.x`
- **Machine dédiée** : IP spécifique de votre serveur LIDAR

#### Ports
- **API REST** : 8080 (par défaut)
- **WebSocket** : 8080 (même port, endpoint /ws)

### 7. Workflow d'Utilisation

#### Étapes pour Lancer le LIDAR :
1. **Sélectionner le modèle** de LIDAR dans le dropdown
2. **Choisir le port série** (ex: `/dev/ttyUSB0` ou `COM3`)
3. **Définir l'adresse IP** du serveur API
4. **Tester la connexion** avec le bouton "Test"
5. **Lancer le LIDAR** avec le bouton "Launch"
6. **Connecter WebSocket** pour recevoir les données
7. **Visualiser** les données dans la vue 3D

#### Interface de Statut :
- **Vert** : Système opérationnel
- **Orange** : En cours de connexion
- **Rouge** : Erreur ou déconnecté

### 8. Dépannage Courant

#### LIDAR Non Détecté
- Vérifier le port série sélectionné
- Tester avec différents ports (USB0, USB1, COM1, etc.)
- Vérifier les permissions d'accès au device

#### Connexion API Échoue
- Vérifier que le serveur Docker est démarré
- Tester l'URL avec curl dans un terminal
- Vérifier la clé API dans le script

#### Pas de Données WebSocket
- S'assurer que le LIDAR est lancé avant de connecter WebSocket
- Vérifier la console TouchDesigner pour les messages d'erreur
- Tester la connexion WebSocket avec un autre client

### 9. Personnalisation Avancée

#### Ajouter de Nouveaux Modèles LIDAR
Modifiez le dictionnaire dans `lidar_config.py` :
```python
self.lidar_models["nouveau_modele"] = {
    "name": "Nouveau LIDAR",
    "baudrate": 115200,
    "description": "Description du nouveau LIDAR"
}
```

#### Modifier la Visualisation
- Ajustez les couleurs en fonction de l'intensité
- Créez des filtres pour certaines zones
- Ajoutez des effets visuels (trails, glow, etc.)

#### Intégration avec d'autres Systèmes
- Exportez les données vers OSC
- Intégrez avec Ableton Live via OSC
- Connectez à des systèmes d'éclairage DMX

Cette configuration vous donne un contrôle complet de votre système LIDAR depuis TouchDesigner avec une interface utilisateur professionnelle et intuitive.