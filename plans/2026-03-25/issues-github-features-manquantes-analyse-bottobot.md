<!-- session_id: 0c75190d-422d-4825-afc2-4fdcaab898e0 -->
# Plan : Issues GitHub — Features manquantes (analyse bottobot)

## Context

Analyse comparative du serveur `bottobot/touchdesigner-mcp-server` (21 tools, pure documentation offline) vs notre `TD_starter_pack` (57+ tools, contrôle live + knowledge bases). Objectif : créer des issues GitHub organisées en 4 phases pour implanter les features manquantes qui apportent de la valeur.

Notre serveur est déjà très supérieur (contrôle live, linting, GLSL deployment, assets, palette, lessons, toolkits). Les features à ajouter sont principalement des **knowledge bases offline** qui complètent notre capacité de contrôle.

---

## Issues à créer

### Phase 1 — Fondations knowledge (P1, haute valeur)

#### Issue #A : Workflow suggestions + operator connections
**Titre :** `Workflow suggestions : suggest_workflow + operator connections`
- Moteur de suggestion de connexions entre opérateurs
- `patterns.json` avec 30+ workflow patterns et transitions typiques
- Tool `suggest_workflow` : étant donné un opérateur, suggère les connexions aval/amont avec ports et justification
- Enrichit la capacité de l'IA à construire des réseaux cohérents
- S'appuie sur le registry existant (`_mcp_server/src/features/resources/`)

#### Issue #B : Network templates déployables
**Titre :** `Network templates : blueprints déployables pour setups TD courants`
- 5-10 templates JSON (video-player, generative-art, audio-reactive, data-viz, live-performance)
- Chaque template : liste d'opérateurs, table de connexions, paramètres, script Python de génération
- Tool `search_network_templates` (offline) + `deploy_network_template` (live)
- **Avantage vs bottobot** : on déploie réellement dans TD, pas juste un copier-coller

### Phase 2 — Enrichissement knowledge (P2, valeur moyenne)

#### Issue #C : Techniques avancées (au-delà du GLSL)
**Titre :** `Techniques library : ML, networking, audio-visual, Python avancé`
- Étendre le knowledge base au-delà des GLSL patterns existants
- 7 catégories : GLSL (existant), GPU compute, ML/IA, génératif, audio-visual, networking, Python avancé
- Chaque technique : difficulté, opérateurs requis, code snippets, chaînes d'opérateurs
- Tools `search_techniques` + `get_technique`
- Peut réutiliser l'architecture du GLSL pattern registry

#### Issue #D : Operator examples dédiés
**Titre :** `Operator examples : exemples de code Python par opérateur`
- Ajouter un champ `examples` aux entrées operator knowledge
- Exemples Python, expressions, patterns d'usage par opérateur
- Tool `get_operator_examples` ou enrichissement de `search_operators`
- Effort faible, valeur immédiate pour la génération de code

### Phase 3 — Documentation historique (P3, basse priorité)

#### Issue #E : Historique des versions TD
**Titre :** `TD version history : versions stables + breaking changes`
- Fichier JSON statique avec toutes les releases TD (099→2024)
- Par version : Python bundlé, nouveaux opérateurs, features, breaking changes
- Tools `get_version_info` + `list_versions`
- Utile pour la génération de code version-aware

#### Issue #F : Système de tutoriels
**Titre :** `Tutorial system : tutoriels TD cherchables et indexés`
- 10-15 tutoriels curatés avec sections, code, liens
- Tools `search_tutorials` + `get_tutorial`
- Complémente les skills (td-guide, td-glsl) avec du contenu pas-à-pas
- Peut réutiliser l'architecture lessons (registry + loader)

### Phase 4 — Niche (P4, optionnel)

#### Issue #G : Experimental build tracking
**Titre :** `Experimental builds : suivi des builds expérimentaux TD`
- Suivi de 6+ séries de builds expérimentaux (2020.20000→2025.10000)
- Features, breaking changes, nouvelles API Python, nouveaux opérateurs
- Filtre par domaine (rendering, Python API, operators, UI, networking)
- Tools `get_experimental_build` + `list_experimental_builds`
- ROI faible — les builds expérimentaux changent constamment

---

## Exécution

Créer 7 issues GitHub avec label `enhancement`, en français, au format du repo :
- Context / Analyse / Proposition / Fichiers impactés / Vérification
- Mentionner l'issue parente (Epic) dans chaque issue de phase
- Créer d'abord une issue Epic chapeau qui référence toutes les phases

**Total : 1 Epic + 7 issues features = 8 issues**
