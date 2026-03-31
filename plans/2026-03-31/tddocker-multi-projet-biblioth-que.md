<!-- session_id: 58278ef6-7ed6-4536-ac5d-da556de8b371 -->
# TDDocker Multi-Projet + Bibliothèque

## Contexte

Aujourd'hui TDDocker ne gère qu'**un seul** `docker-compose.yml` à la fois (paramètre `Composefile`). L'utilisateur veut :
1. Charger un projet Docker (déjà possible)
2. En **ajouter un autre** sans remplacer le premier
3. Avoir une **bibliothèque** de projets pré-configurés à disposition

## Approche : multi-projet via table + bibliothèque locale

### 1. Remplacer `Composefile` (str) par une table de projets

**Fichier** : `TDDocker/python/td_docker/td_docker_ext.py`

Aujourd'hui : `par.Composefile` = un seul chemin.
Après : un `tableDAT` nommé `projects` qui liste les compose files chargés.

| project_name | compose_path | session_id | status | overlay_path |
|---|---|---|---|---|
| SLlidar | C:/…/docker-compose.yml | a1b2c3 | running | C:/…/td-overlay.yml |
| my-osc-app | C:/…/docker-compose.yml | d4e5f6 | loaded | C:/…/td-overlay.yml |

**Changements dans `_load()`** :
- Garder `par.Composefile` pour sélectionner le fichier à ajouter
- Pulse `Load` → ajoute le projet à la table (au lieu de remplacer)
- Chaque projet a son propre `session_id` et son propre `td-overlay.yml`
- Les container COMPs sont groupés par projet : `/TDDocker/containers/{project_name}/`

**Changements dans `_up()` / `_down()`** :
- Nouvelle action `Upall` / `Downall` pour tout démarrer/arrêter
- `Up` / `Down` opère sur le projet sélectionné (sélection via menu `Activeproject`)
- Chaque projet a son propre watchdog

**Nouveau paramètre** :
- `Activeproject` (StrMenu) — sélection du projet courant parmi ceux chargés
- `Removeproject` (Pulse) — retire le projet actif de la table (et fait Down si running)

### 2. Bibliothèque de projets

**Dossier** : `TDDocker/library/`

```
TDDocker/library/
├── README.md              # Description du format
├── python-osc/
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── app/
│       └── main.py        # Exemple minimal OSC
├── nodejs-websocket/
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── server.js
└── ros2-sensor/           # Copie allégée du pattern SLlidar
    ├── docker-compose.yml
    ├── Dockerfile
    └── ...
```

Chaque sous-dossier est un projet autonome avec un `docker-compose.yml` valide. Pas de magie — c'est juste un dossier de compose files prêts à l'emploi.

**Intégration TD** :
- Nouveau paramètre `Library` (Folder) — pointe vers `TDDocker/library/` par défaut
- Scan le dossier → remplit un menu `Libraryproject` avec les sous-dossiers trouvés
- Pulse `Loadfromlibrary` → copie le projet dans un dossier de travail et le charge

### 3. Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `td_docker_ext.py` | Multi-projet : table `projects`, groupage des COMPs, session par projet, menu `Activeproject` |
| `compose.py` | Pas de changement — `compose_up/down` prennent déjà un `project_name` distinct |
| `watchdog.py` | Pas de changement — un watchdog par session, déjà supporté |
| `validator.py` | Pas de changement |

| Fichier | Nouveau |
|---------|---------|
| `TDDocker/library/python-osc/docker-compose.yml` | Template OSC minimal |
| `TDDocker/library/python-osc/Dockerfile` | Python slim + python-osc |
| `TDDocker/library/python-osc/app/main.py` | Script OSC minimal |
| `TDDocker/library/nodejs-websocket/docker-compose.yml` | Template WebSocket minimal |
| `TDDocker/library/nodejs-websocket/Dockerfile` | Node slim + ws |
| `TDDocker/library/nodejs-websocket/server.js` | Serveur WS minimal |

### 4. Séquence d'implémentation

**Étape 1** — Table de projets + multi-Load
- Créer le DAT `projects` dans `__init__`
- Modifier `_load()` : ajouter à la table au lieu de remplacer
- Grouper les container COMPs : `/containers/{project_name}/{service}/`
- Chaque projet a son propre `session_id`

**Étape 2** — Multi Up/Down
- `_up()` / `_down()` opèrent sur le projet actif (via `par.Activeproject`)
- Ajout `Upall` / `Downall`
- Un watchdog par projet actif

**Étape 3** — Bibliothèque
- Créer `TDDocker/library/` avec 2-3 projets exemples
- Paramètres `Library`, `Libraryproject`, `Loadfromlibrary`
- Scan + menu + copie + Load

### 5. Vérification

1. Load un premier compose → vérifie qu'il apparaît dans la table et les COMPs
2. Load un deuxième compose → vérifie qu'il s'ajoute (le premier reste)
3. Up sur un projet → vérifie que seul ce projet démarre
4. Down sur un projet → vérifie que l'autre reste up
5. Load from library → vérifie que le template est copié et chargé
6. Fermer TD → vérifie que les watchdogs tuent tous les conteneurs

### 6. Ce qui ne change PAS

- Le principe overlay (td-overlay.yml par projet)
- Le validateur de sécurité
- Les transports (WebSocket/OSC/NDI)
- Le watchdog (un par session, déjà isolé)
- `compose.py` (prend déjà un `project_name` distinct)
