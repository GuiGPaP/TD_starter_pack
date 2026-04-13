<!-- session_id: 966d4eab-28a8-49b9-a86c-879166de9bce -->
# Plan : Enrichir td-sketch-ui avec les best practices UI TD

## Context

Le skill td-sketch-ui fonctionne pour construire des panels, mais il manque des bonnes pratiques UI professionnelles identifiées dans un guide de référence. Le skill se concentre actuellement sur "comment instancier des widgets" mais pas sur "comment construire une UI maintenable et performante".

## Éléments à ajouter au skill

### Dans SKILL.md — nouvelle section "UI Design Principles"

Ajouter entre "Reference Files" et "Critical Guardrails" :

1. **Résolution et root container**
   - Toujours créer le root container à la résolution cible (1920x1080, 1280x720, etc.)
   - Demander la résolution cible à l'utilisateur si non spécifiée dans le sketch

2. **Séparation UI / logique / rendu**
   - UI : Panel/Widgets dans un container `ui_root`
   - Logique : CHOP/DAT de contrôle dans un container `logic` séparé
   - Rendu : TOPs/COMP de scène séparés
   - L'UI sort des Panel CHOP propres, le moteur ne dépend pas de la structure interne de l'UI

3. **Nommage cohérent**
   - Préfixes : `ui_` pour containers UI, `ctrl_` pour logique, `btn_` pour boutons, `slider_` pour sliders
   - Noms descriptifs : `slider_speed`, pas `slider1`

4. **Style visuel cohérent**
   - Définir une palette de couleurs (fond, accent, texte, états actif/inactif/erreur)
   - 1-2 polices max, tailles constantes (titres, labels, valeurs)
   - États visuels clairs : normal / hover / pressed / disabled
   - Contraste suffisant pour usage en performance live

### Dans SKILL.md — enrichir "Critical Guardrails"

5. **Guardrail 13 : Panel CHOP pour exporter les valeurs**
   - Après construction de l'UI, proposer d'ajouter un Panel CHOP par widget pour exporter les valeurs
   - Pattern : widget → Panel CHOP → export vers paramètres cibles

6. **Guardrail 14 : Performance — désactiver Viewer Active**
   - Sur les containers/pages non visibles : `par.viewer = False` (ou via display expression)
   - Éviter les TOPs UI en haute résolution inutile
   - Pour les UIs avec beaucoup de widgets : pagination via tabs ou sections collapsibles

7. **Guardrail 15 : Perform Mode**
   - Toujours rappeler de tester en Perform Mode via Window COMP
   - Vérifier que l'UI fonctionne à la résolution de projection réelle

### Dans references/layout-patterns.md — compléter

8. **Mode Anchor** (responsive)
   - Pattern pour UI qui doit s'adapter à différentes résolutions
   - Exemple avec `leftanchor`, `rightanchor`, `topanchor`, `bottomanchor`

9. **Pattern "Widget réutilisable" (clones)**
   - Créer un prototype de widget, utiliser des clones pour les instances
   - Utile pour des banques de paramètres identiques (layers vidéo, etc.)

### Dans references/widget-catalog.md — compléter

10. **Panel Execute DAT** — ajouter section sur les callbacks
    - `onOffToOn`, `onValueChange`, `whileOn` callbacks
    - Pattern recommandé : centraliser les callbacks par container

11. **Panel CHOP** — ajouter section
    - Comment convertir panel values en CHOP channels
    - Pattern d'export vers paramètres

## Fichiers à modifier

| Fichier | Changement |
|---------|-----------|
| `.claude/skills/td-sketch-ui/SKILL.md` | Ajouter "UI Design Principles", guardrails 13-15 |
| `.claude/skills/td-sketch-ui/references/layout-patterns.md` | Ajouter pattern Anchor + pattern Clones |
| `.claude/skills/td-sketch-ui/references/widget-catalog.md` | Ajouter sections Panel Execute DAT + Panel CHOP |

## Vérification

- Relire le skill complet pour vérifier la cohérence
- S'assurer que les nouvelles sections suivent les conventions (code examples, tables)
- Pas de duplication avec td-guide ou td-python (routing clair)
