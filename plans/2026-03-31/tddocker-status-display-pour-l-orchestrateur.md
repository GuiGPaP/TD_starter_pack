<!-- session_id: 58278ef6-7ed6-4536-ac5d-da556de8b371 -->
# TDDocker — Status Display pour l'orchestrateur

## Contexte

Chaque container COMP a un `status_display` (textTOP 320x200) qui affiche le nom du service et son état avec un code couleur. Le COMP orchestrateur `/TDDocker` n'a pas d'équivalent — l'utilisateur n'a pas de vue d'ensemble de tous les projets sans ouvrir chaque COMP.

## Objectif

Un `textTOP` sur `/TDDocker` qui affiche un résumé visuel : combien de projets, leurs noms, états, nombre de services, Docker status.

## Approche

### 1. Créer le textTOP `status_display` dans `_setup_multi_project()`

Comme pour les containers, créer un `textTOP` nommé `status_display` dans le COMP `/TDDocker` s'il n'existe pas.

- Résolution : **480x300** (plus grand que les containers car plus d'info)
- Position : `nodeX=0, nodeY=100` (au-dessus du réseau)
- Opviewer du COMP `/TDDocker` pointé vers ce TOP

### 2. Méthode `_update_orchestrator_display()`

Affiche un résumé texte :

```
TDDocker
━━━━━━━━━━━━━━
🐳 Docker: Online
📦 2 projects

TD_SLlidar_docker  ● RUNNING
  sllidar          ● healthy

python_osc         ● LOADED
  osc-server       ● created
```

**Couleur globale** du COMP `/TDDocker` :
- **Vert** — tous les projets running + healthy
- **Jaune** — au moins un projet loaded/paused (pas encore up)
- **Rouge** — au moins un service exited/dead/unhealthy
- **Gris** — aucun projet chargé

### 3. Appeler `_update_orchestrator_display()` à chaque changement d'état

Points d'appel (déjà existants, juste ajouter l'appel) :
- `_load()` — après enregistrement du projet
- `_apply_project_poll()` — après mise à jour des COMPs containers
- `_down_project()` — après arrêt
- `_remove_project()` — après suppression
- `_rebuild_status_table()` — fin de rebuild

### Fichier à modifier

| Fichier | Modification |
|---------|-------------|
| `td_docker_ext.py` | Ajouter création du textTOP dans `_setup_multi_project()`, méthode `_update_orchestrator_display()`, appels aux bons endroits |

### Vérification

1. Ouvrir TD → le textTOP existe sur `/TDDocker`
2. Load un projet → le display montre "1 project, LOADED"
3. Load un 2e projet → "2 projects"
4. Up → couleur passe au vert, states RUNNING
5. Down → couleur passe au rouge/gris
6. Remove → le projet disparaît du display
