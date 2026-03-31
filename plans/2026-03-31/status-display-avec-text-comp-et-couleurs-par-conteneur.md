<!-- session_id: d8d67442-82e4-461b-8530-4f4b42b4741f -->
# Plan: Status display avec Text COMP et couleurs par conteneur

## Context

Le status_display actuel est un `textTOP` sans formatage riche. On veut migrer vers un `textCOMP` pour utiliser les [Text Formatting Codes](https://derivative.ca/UserGuide/Text_Formatting_Codes) — couleur par conteneur selon son état, couleur globale pour le projet.

## Syntaxe Text COMP formatting

```
{#color(R,G,B)}texte coloré{#reset()}
```
- `{#color(r,g,b)}` — change la couleur du texte (0-255)
- `{#reset()}` — remet les valeurs par défaut
- `par.formatcodes = True` pour activer

## Fichier

`TDDocker/python/td_docker/td_docker_ext.py`

## Changements

### 1. `__init__` : remplacer textTOP par textCOMP

Ligne ~167 : remplacer `self.ownerComp.create("textTOP", ...)` par `textCOMP` avec `par.formatcodes = True`.

```python
if not self.ownerComp.op("status_display"):
    txt = self.ownerComp.create("textCOMP", "status_display")
    txt.par.w = 480
    txt.par.h = 300
    txt.par.fontsize = 16
    txt.par.formatcodes = True
    txt.par.bgalpha = 1
    txt.nodeX = 0
    txt.nodeY = 100
    txt.viewer = True
```

### 2. `_update_orchestrator_display()` : couleurs inline

Mapper les états aux couleurs RGB via les formatting codes :

| État | Couleur | RGB |
|------|---------|-----|
| running/healthy | Vert | 100,220,100 |
| created/loaded | Gris | 160,160,160 |
| paused/starting | Jaune | 220,200,50 |
| exited/dead/error | Rouge | 220,80,80 |
| unhealthy | Orange | 220,140,50 |

Projet : couleur basée sur `proj_label` (RUNNING=vert, ERROR=rouge, LOADED=gris).
Services : couleur basée sur l'état individuel du conteneur.

Format :
```
TDDocker
━━━━━━━━━━━━━━
Docker: {#color(100,220,100)}Online{#reset()}
1 project

{#color(100,220,100)}📁 Tests              RUNNING{#reset()}
  ├ {#color(100,220,100)}web               HEALTHY{#reset()}
  └ {#color(100,220,100)}echo              RUNNING{#reset()}
```

### 3. `_update_container_display()` : adapter si nécessaire

Cette méthode met à jour le textTOP sur chaque container COMP — elle n'est pas touchée (chaque container COMP garde son propre textTOP pour l'instant).

### 4. Supprimer l'ancien textTOP si présent

Dans `__init__`, si un `status_display` existe mais est un textTOP (pas textCOMP), le détruire et recréer.

## Vérification

1. `python -m pytest python/tests/ -v` — 88 pass
2. MCP : vérifier le contenu de `status_display.par.text` contient les codes `{#color(...)}`
3. Visuellement dans TD : couleurs distinctes par état
