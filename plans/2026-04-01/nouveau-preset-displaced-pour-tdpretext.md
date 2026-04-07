<!-- session_id: 499a8431-6c09-4e65-afe8-7b867ebd5ba9 -->
# Plan: Nouveau preset "displaced" pour TDPretext

## Context

Le réseau TDPretext a **deux chaînes parallèles non connectées** :

1. **Chaîne texte** : `webrender_flow` (HTML pretext) → `null_flow`
2. **Chaîne vidéo** : `videodevin1` (webcam) → `nvbackground1` (bg removal NVIDIA) → `thresh1` (seuil alpha) → `multiply1` (silhouette × vidéo) → `null1` (sortie = silhouette découpée)

L'objectif est de **connecter null1 comme source de displacement pour décaler le texte** rendu par webrender_flow, et d'encapsuler ça dans un nouveau preset.

## Approche

Ajouter un `displaceTOP` qui prend le texte en entrée 0 et la silhouette vidéo (null1) en entrée 1, puis créer un nouveau null de sortie. Enregistrer un preset "displaced" qui active ce mode.

## Étapes

### 1. Créer un Displace TOP (`displace1`)
- **Input 0** : `null_flow` (texte rendu)
- **Input 1** : `null1` (silhouette vidéo = displacement map)
- Paramètres initiaux :
  - `weightx` : 0.05, `weighty` : 0.05
  - `midpointx` : 0.5, `midpointy` : 0.5
  - `method` : horizontal and vertical

### 2. Créer un Null TOP de sortie (`null_displaced`)
- Input : `displace1`
- Sert de sortie propre pour la chaîne combinée

### 3. Ajouter des custom parameters sur `/TDPretext`
- `Displaceweightx` (float, default 0.05, range 0-0.5)
- `Displaceweighty` (float, default 0.05, range 0-0.5)

### 4. Ajouter le preset "displaced" dans `par_to_webrender`

**PAGE_MAP** : `'displaced': 'flow_page'`

**PRESETS['displaced']** :
```python
'displaced': {
    'Fontfamily': 'Segoe UI',
    'Fontsize': 28,
    'Fontweight': '400',
    'Lineheight': 42,
    'Textcolorr': 0.95, 'Textcolorg': 0.95, 'Textcolorb': 0.98, 'Textcolora': 0.92,
    'Bgcolorr': 0.0, 'Bgcolorg': 0.0, 'Bgcolorb': 0.0,
    'Padding': 40,
    'Pointerradius': 0,
    'Minsegwidth': 80,
    'Numobstacles': 0,
    'Obstacleradius': 0,
    'Shadowblur': 8,
    'Orbopacity': 0,
    'Displaceweightx': 0.05,
    'Displaceweighty': 0.05,
},
```

Style : fond noir, texte blanc quasi-opaque, pas d'obstacles/orbs (la silhouette vidéo fait le travail de déformation), léger shadow blur.

### 5. Mettre à jour `_push_config` pour envoyer les poids displace
- Ajouter `Displaceweightx` / `Displaceweighty` dans le dict config
- Mettre à jour le displace1 TOP via expression ou script python

### 6. Ajouter "displaced" au menu du paramètre Preset
- Ajouter `'displaced'` / `'Displaced'` aux menuNames/menuLabels

### 7. Layout des nodes
- Positionner `displace1` et `null_displaced` proprement dans le réseau

## Fichiers / Opérateurs modifiés

| Opérateur | Action |
|-----------|--------|
| `/TDPretext` (containerCOMP) | Ajouter custom pars `Displaceweightx`, `Displaceweighty`, menu entry |
| `/TDPretext/displace1` (displaceTOP) | **Créer** — inputs: null_flow + null1 |
| `/TDPretext/null_displaced` (nullTOP) | **Créer** — output de la chaîne combinée |
| `/TDPretext/par_to_webrender` (parexecDAT) | Ajouter preset "displaced" + push des poids displace |

## Vérification

1. Sélectionner le preset "Displaced" → les custom pars se mettent à jour
2. `displace1` reçoit bien null_flow (input 0) et null1 (input 1)
3. Le texte affiché dans `null_displaced` est déformé par la silhouette vidéo
4. Les autres presets continuent de fonctionner normalement (pas de régression)
5. Modifier `Displaceweightx`/`Displaceweighty` change l'intensité du displacement en temps réel
