<!-- session_id: 966d4eab-28a8-49b9-a86c-879166de9bce -->
# Plan : Remplacer tab_bar par folderTabs + corriger centrage

## Context

L'UI `ui_main` utilise actuellement deux buttonToggle manuels pour la navigation entre pages (DJ Mixer / XY Pads). Le switching est buggy (deux pages visibles en même temps). L'utilisateur veut utiliser le widget Palette `folderTabs` natif, qui est le bon outil pour ca.

L'introspection du widget a révélé comment le configurer :
- **`Menunames`** (Str) : noms des onglets séparés par des espaces (ex: `"mixer pads"`)
- **`Menulabels`** (Str, optionnel) : labels affichés séparés par des espaces (ex: `"DJ\ Mixer XY\ Pads"`)
- **`Value0`** : valeur Menu qui reflète l'onglet sélectionné (= un des menuNames)
- **`out_menu0Index`** (outCHOP) : index numérique de l'onglet sélectionné

## Étapes

### 1. Supprimer `tab_bar` et ses enfants
- Supprimer `/project1/ui_main/tab_bar`

### 2. Charger folderTabs
- `load_palette_component: folderTabs → /project1/ui_main` (componentName: `tabs`)
- Configurer l'outer container : `hmode=fill`, `vmode=fixed`, `h=28`, `alignorder=0`
- Configurer l'inner widgetCOMP : `hmode=fill`, `vmode=fill`
- Configurer les onglets sur l'inner :
  ```python
  inner.par.Menunames = 'mixer pads'
  inner.par.Menulabels = 'DJ\\ Mixer XY\\ Pads'  # backslash-espace pour espaces dans les labels
  inner.par.Value0 = 'mixer'
  inner.par.Enablerollover = False
  inner.par.Labeldisplay = False
  ```

### 3. Corriger les expressions display des pages
- `page_mixer.par.display` : expression `op('tabs/folderTabs').par.Value0 == 'mixer'`
- `page_pads.par.display` : expression `op('tabs/folderTabs').par.Value0 == 'pads'`
- Mode : `par.display.mode = par.display.mode.EXPRESSION`
- Fixer `alignorder` : page_mixer=1, page_pads=2

### 4. Mettre à jour le widget-catalog.md
- Ajouter les pars `Menunames`, `Menulabels`, `Menuoptiontable` dans la doc du folderTabs
- Ajouter note sur le format (espace-séparé, backslash-espace pour labels avec espaces)

## Vérification

1. Ouvrir `/project1/ui_main` — onglets "DJ Mixer" / "XY Pads" visibles en haut
2. Cliquer "DJ Mixer" → seule page_mixer affichée
3. Cliquer "XY Pads" → seule page_pads affichée
4. Jamais deux pages en même temps
