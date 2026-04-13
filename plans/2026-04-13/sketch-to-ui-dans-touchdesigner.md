<!-- session_id: 966d4eab-28a8-49b9-a86c-879166de9bce -->
# Plan : Sketch-to-UI dans TouchDesigner

## Context

L'utilisateur veut pouvoir griffonner une UI sur papier, la photographier, et laisser Claude Code la reconstruire dans TouchDesigner en utilisant les composants Palette existants. C'est une nouvelle feature du workflow MCP qui combine la vision de Claude avec les outils `load_palette_component`, `create_td_node`, `update_td_node_parameters` et `layout_nodes`.

## Inventaire des widgets Palette disponibles (89 composants UI)

### Basic Widgets (utilisables directement via `load_palette_component`)

| Catégorie | Composants |
|-----------|-----------|
| **Boutons** | `buttonMomentary`, `buttonToggle`, `buttonCheckbox`, `buttonRadio`, `buttonRocker`, `buttonState`, `buttonScript` |
| **Sliders** | `sliderHorz`, `sliderVert`, `sliderHorzXFade`, `slider2D`, `slider3Rgb`, `slider3Hsv`, `slider4Rgba`, `slider4Hsva` |
| **Knobs** | `knobFixed`, `knobEndless` |
| **Champs texte** | `fieldString`, `fieldStringExec`, `fieldTextArea`, `fieldFileBrowser`, `fieldFolderBrowser` |
| **Champs numériques** | `float1`-`float4`, `int1`-`int4`, `range` |
| **Menus** | `dropDownButton`, `dropDownMenu`, `topMenu` |
| **Labels/Structure** | `label`, `header`, `windowHeader`, `footer`, `section`, `folderTabs` |
| **Références OP** | `operatorPath`, `referenceCHOP/COMP/DAT/MAT/OBJ/OP/SOP/TOP`, `opViewer` |
| **Gadgets** | `pathBar` |
| **Outils** | `autoUI`, `widgetCacher` |

### UI standalone (hors Basic Widgets)
`displayList`, `gal`, `lister`, `popDialog`, `popMenu`, `radioList`, `simpleList`, `treeLister`

## Architecture proposée : Skill `td-sketch-ui`

### Approche

Pas besoin de nouveau code MCP server ni de nouveau tool. On crée un **skill Claude Code** qui orchestre les outils existants :

1. **L'utilisateur** donne une image (photo de sketch papier ou wireframe)
2. **Claude** (via sa capacité vision) analyse l'image et identifie les éléments UI
3. **Claude** génère un plan de layout structuré (arbre de widgets + positions)
4. **Claude** exécute le plan via les outils MCP existants :
   - `load_palette_component` pour charger chaque widget depuis la Palette
   - `update_td_node_parameters` pour configurer labels, tailles, ranges
   - `layout_nodes` pour positionner spatialement les nodes dans le network
   - Un script Python final pour ajuster le layout panel (anchors, fill, alignment)

### Fichiers à créer

```
.claude/skills/td-sketch-ui/
├── SKILL.md                    # Instructions du skill
└── references/
    ├── widget-catalog.md       # Catalogue complet des widgets + paramètres clés
    └── layout-patterns.md      # Patterns de layout (container nesting, anchors, fill)
```

### Contenu du skill (`SKILL.md`)

Le skill contiendra :

1. **Mapping sketch → widget** : table de correspondance entre formes dessinées et widgets Palette
   - Rectangle avec texte → `buttonMomentary` ou `buttonToggle`
   - Barre horizontale → `sliderHorz`
   - Cercle avec indicateur → `knobFixed`
   - Champ avec curseur texte → `fieldString`
   - Texte seul → `label`
   - Liste déroulante → `dropDownMenu`
   - Case à cocher → `buttonCheckbox`
   - Groupe encadré → `containerCOMP` avec `header`
   - Onglets → `folderTabs`
   - etc.

2. **Workflow en 4 étapes** :
   - **Étape 1 - Analyse** : Décrire ce qu'on voit dans le sketch (éléments, hiérarchie, layout)
   - **Étape 2 - Mapping** : Associer chaque élément à un widget Palette
   - **Étape 3 - Génération** : Créer le containerCOMP racine, charger les widgets, configurer
   - **Étape 4 - Vérification** : Screenshot du résultat, comparaison avec le sketch

3. **Patterns de layout** :
   - Container racine en mode `fill` pour prendre toute la fenêtre
   - Sections verticales via `align = "Top to Bottom"`
   - Groupes via containers imbriqués avec `header` + `section`
   - Spacing et margins pour aérer

### Référence widget-catalog.md

Pour chaque widget, documenter :
- Nom Palette exact (pour `load_palette_component`)
- Paramètres custom clés (label, range, default value, etc.)
- Taille par défaut et taille recommandée
- Screenshot ou description visuelle

### Référence layout-patterns.md

- Pattern "panneau de contrôle vertical" (sliders empilés)
- Pattern "toolbar horizontale" (boutons en ligne)
- Pattern "panneau à onglets" (folderTabs + containers switchés)
- Pattern "grille de paramètres" (labels + champs numériques en colonnes)
- Pattern "fenêtre flottante" (windowHeader + body container)

## Étapes d'implémentation

- [ ] **1. Créer le skill `td-sketch-ui/SKILL.md`** — Instructions complètes du workflow sketch→UI, table de mapping sketch→widget, guidelines d'analyse d'image
- [ ] **2. Créer `references/widget-catalog.md`** — Catalogue des 55+ widgets avec noms exacts, params clés, tailles. Source : Palette indexée + `get_node_parameter_schema` sur chaque widget chargé
- [ ] **3. Créer `references/layout-patterns.md`** — 5-6 patterns de layout récurrents avec code Python d'exécution
- [ ] **4. Ajouter entrée dans le Skill Decision Tree** (CLAUDE.md) — Pour que le routing fonctionne
- [ ] **5. Test end-to-end** — Donner un sketch simple, exécuter le skill, vérifier le résultat dans TD via `screenshot_operator`

## Vérification

1. Charger un sketch simple (ex: 3 sliders + 1 bouton + 1 label dans un container)
2. Exécuter le skill
3. `screenshot_operator` sur le container résultant
4. Comparer visuellement sketch vs résultat
5. Vérifier que les widgets sont interactifs (panel values fonctionnels)
