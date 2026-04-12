<!-- session_id: 770e6710-a131-41e3-aa64-8e8931ea4540 -->
# Comparaison approfondie : TD_starter_pack MCP vs Embody (Envoy)

## Vue d'ensemble

| | **TD_starter_pack MCP** | **Embody (Envoy)** |
|---|---|---|
| **Auteur** | GuiGPaP | Dylan Roscover |
| **Version** | 1.5.0-td.1 | 5.0.320 |
| **Licence** | MIT | MIT |
| **Stars GitHub** | — | 68 |
| **Développement actif depuis** | ~2025 | Mai 2024 (~2 ans) |

---

## 1. Architecture fondamentale

### TD_starter_pack MCP — Architecture externe (dual-stack)
```
Claude Code ←STDIO/HTTP→ Node.js (TypeScript) ←REST/HTTP→ TD WebServer DAT (Python)
```
- Le serveur MCP tourne dans un **processus Node.js externe**
- Communique avec TD via **HTTP REST** sur le port 9981
- Design **OpenAPI-first** : le contrat API génère les types TypeScript (orval) ET les handlers Python
- Le Python dans TD est un **serveur web recevant des commandes**, pas l'initiateur

### Embody/Envoy — Architecture embarquée (pure Python)
```
Claude Code ←STDIO→ envoy_bridge.py ←HTTP→ Worker Thread (FastMCP/uvicorn) ←Queue→ Main Thread TD
```
- Le serveur MCP tourne **à l'intérieur de TouchDesigner** comme extension `.tox`
- Utilise un **worker thread** (FastMCP + uvicorn) sur port 9870
- Un **bridge STDIO** traduit entre Claude Code et le serveur HTTP
- Toutes les opérations TD passent par la main thread via Queue + Event

### Verdict architecture
| Critère | TD_starter_pack | Embody |
|---------|----------------|--------|
| **Découplage** | ✅ Fort — serveur indépendant de TD | ❌ Couplé — tourne dans TD |
| **Mode offline** | ✅ Fonctionne sans TD (mode docs-only) | ⚠️ Bridge fonctionne, mais outils limités |
| **Latence** | ⚠️ HTTP double-hop (Node→TD) | ✅ Accès direct à l'API TD (même process) |
| **Crash resilience** | ✅ Serveur survit si TD crash | ⚠️ Bridge survit, serveur meurt avec TD |
| **Installation** | npm install | Drag & drop .tox + auto-venv via uv |

---

## 2. Outils MCP

### Quantité
- **TD_starter_pack : 79 outils**
- **Embody : 45 outils + 4 meta-tools bridge**

### Couverture comparative

| Domaine | TD_starter_pack | Embody |
|---------|----------------|--------|
| **CRUD opérateurs** | ✅ create, delete, copy, connect, layout | ✅ create, delete, copy, rename, connect, layout |
| **Paramètres** | ✅ get/update params, schema | ✅ get/set (constant/expression/bind) |
| **Introspection** | ✅ 18 outils (nodes, info, classes, channels, extensions) | ✅ 6 outils (info, errors, classes, methods, modules) |
| **Code execution** | ✅ execute_python_script (3 modes sécurité) | ✅ execute_python (main thread) |
| **DAT content** | ✅ get/set text, lint, format, typecheck, validate GLSL/JSON | ✅ get/set content |
| **GLSL validation** | ✅ glslangValidator auto-provisionné | ❌ Absent |
| **Search/Catalogue** | ✅ 11 outils (operators, patterns, tutorials, techniques, workflows, assets) | ❌ Absent (pas de knowledge base) |
| **Templates/Deploy** | ✅ deploy assets, GLSL patterns, network templates, palette | ❌ Absent |
| **Performance** | ✅ get_performance + trail stats (avg/min/max/p95) | ✅ get_op_performance + get_project_performance |
| **Feedback loops** | ✅ create_feedback_loop dédié | ❌ Manuel |
| **Instancing** | ✅ configure_instancing dédié | ❌ Manuel |
| **Geometry COMP** | ✅ create_geometry_comp dédié | ❌ Manuel |
| **Error scanning** | ✅ scan_network_errors (deep tree) | ✅ get_op_errors |
| **Project indexing** | ✅ index_td_project, get_td_context, complete_op_paths | ❌ Absent |
| **Annotations** | ❌ Absent | ✅ create/get/set annotations + enclosed ops |
| **Op flags** | ❌ Absent (via update_params) | ✅ get/set flags dédié |
| **Screenshots** | ✅ screenshot_operator | ✅ capture_top (inline MCP ImageContent) |
| **Externalization** | ❌ Absent | ✅ 5 outils (tag, save, status, remove) |
| **TDN format** | ❌ Absent | ✅ export/import network (JSON diffable) |
| **Multi-instance** | ❌ Single instance | ✅ Jusqu'à 10 instances, switch_instance |
| **Launch/Restart TD** | ❌ Absent | ✅ launch_td, restart_td via bridge |
| **Tests intégrés** | ❌ Tests externes (Vitest) | ✅ run_tests dans TD |
| **Logs** | ❌ Absent | ✅ get_logs + auto-piggyback sur chaque réponse |

---

## 3. Knowledge Base & Intelligence

### TD_starter_pack — Knowledge-first
- **542 fichiers JSON** de connaissance offline :
  - 405 documents opérateurs
  - 16 patterns GLSL (pixel/vertex/compute)
  - 15 techniques avancées
  - 15 workflows complets
  - 10 tutoriels multi-sections
  - 8 network templates déployables
  - 5 lessons capturées
  - 4 modules TD documentés
- **Fusion Service** : merge intelligent données live + knowledge offline
- **31+ formatters** spécialisés avec contrôle de détail (minimal/summary/detailed)
- **Token-optimized** : les réponses sont compressées pour maximiser le contexte LLM

### Embody — Live-first
- **Pas de knowledge base offline**
- S'appuie sur la **génération automatique de config AI** :
  - Auto-génère `CLAUDE.md`, `AGENTS.md`
  - Crée `.claude/rules/` (7 fichiers de règles)
  - Crée `.claude/skills/` (10 répertoires)
  - Crée `.claude/commands/` (4 slash commands)
- Approche : donner à l'AI les bonnes **règles et contraintes** plutôt qu'une base de données

### Verdict
TD_starter_pack est nettement plus riche en connaissances embarquées. Un AI peut écrire du TD correct même **sans TD ouvert**. Embody mise sur le live et la génération de contexte projet.

---

## 4. Sécurité

| | TD_starter_pack | Embody |
|---|---|---|
| **Modes d'exécution** | 3 modes (read-only, safe-write, full-exec) | Pas de restriction explicite |
| **Analyse statique** | ✅ Pattern-based avant exécution | ❌ |
| **Builtins allowlist** | ✅ Exclut eval, exec, __import__ | ❌ |
| **Audit logging** | ✅ Toute exécution loggée | ✅ Logs disponibles |
| **Réseau** | localhost only | localhost only |

---

## 5. Fonctionnalité unique à Embody : TDN + Externalization

C'est **la killer feature** d'Embody qui n'a pas d'équivalent dans TD_starter_pack :

### TDN (TouchDesigner Network format)
- Format JSON qui représente des réseaux TD entiers en texte **diffable et mergeable**
- Spec v1.3 avec JSON Schema formel
- Ne stocke que les propriétés non-default (compact)
- Supporte : templates de paramètres, séquences, clones palette

### Externalization
- Tag des COMPs/DATs → export automatique vers fichiers (.tox, .py, .json, .glsl, .tdn)
- Structure miroir de la hiérarchie réseau sur disque
- **Les fichiers sur disque sont la source de vérité**
- Restauration automatique à l'ouverture du projet (3 phases : Frame 30/45/60)

### Impact
Cela résout le problème fondamental de TD : les fichiers `.toe` sont des **blobs binaires** impossibles à versionner. Embody transforme un projet TD en quelque chose de **git-friendly**.

---

## 6. Fonctionnalités uniques à TD_starter_pack

| Feature | Description |
|---------|-------------|
| **Knowledge Base (542 fichiers)** | Opérateurs, patterns GLSL, techniques, workflows, tutoriels |
| **Mode docs-only** | Fonctionne sans TD pour de la recherche/documentation |
| **GLSL Validation** | glslangValidator auto-provisionné, validation shader hors TD |
| **Code quality pipeline** | Lint (ruff), format, typecheck (pyright) pour les DATs Python |
| **Deploy patterns** | Templates réseau, patterns GLSL, assets déployables en 1 commande |
| **Project indexing** | Index complet du projet pour code completion op() |
| **Presenter system** | 31+ formatters avec optimisation tokens |
| **Fusion service** | Merge live + offline pour des réponses enrichies |
| **OpenAPI contract-first** | API générée des deux côtés (TS + Python) |
| **Lesson detection** | Détecte automatiquement patterns (feedback loops, instancing) et pièges |

---

## 7. Tests & Qualité

| | TD_starter_pack | Embody |
|---|---|---|
| **Framework** | Vitest (TS) + pytest (Python) | Test runner custom dans TD |
| **Fichiers de test** | 57 fichiers, ~13,192 LOC | 40 suites |
| **Types** | Unit + Integration + Live E2E | Sandbox isolation dans TD |
| **Coverage** | v8 coverage plugin | Non documenté |
| **CI** | Biome + Ruff + Pyright | Headless smoke testing |

---

## 8. Stack technique

| | TD_starter_pack | Embody |
|---|---|---|
| **Langage serveur** | TypeScript (Node.js) | Python (dans TD) |
| **Langage TD** | Python | Python |
| **MCP SDK** | @modelcontextprotocol/sdk | FastMCP (Python mcp) |
| **HTTP** | Express 5 + axios | uvicorn (FastMCP) |
| **Validation** | Zod 4 | — |
| **Build** | tsc | Aucun (interprété) |
| **Linting** | Biome (TS) + Ruff (Python) | — |
| **LOC total estimé** | ~23,000+ (TS+Python+Tests) | ~15,000+ (Python) |

---

## 9. Philosophies opposées

| | TD_starter_pack | Embody |
|---|---|---|
| **Philosophie** | "L'AI doit savoir avant de toucher" | "L'AI doit pouvoir toucher et voir" |
| **Approche** | Knowledge-first, offline-capable | Live-first, embedded |
| **Force** | Profondeur de connaissance, qualité de code | Workflow git, externalisation, simplicité d'install |
| **Public cible** | Dev TD avancé, projets complexes | Tout utilisateur TD voulant versionner + AI |
| **Dépendance TD** | Optionnelle (mode docs) | Requise (sauf bridge) |

---

## 10. Ce que chaque projet pourrait emprunter à l'autre

### TD_starter_pack devrait considérer :
1. **TDN ou équivalent** — un format texte diffable pour les réseaux TD serait transformateur pour le workflow git
2. **Externalization** — exporter les DATs/COMPs tagués vers des fichiers sur disque
3. **Auto-génération de config AI** — scaffolder `.claude/rules/` et `CLAUDE.md` depuis l'état du projet
4. **Multi-instance** — supporter plusieurs sessions TD simultanées
5. **Bridge meta-tools** — pouvoir lancer/relancer TD depuis l'AI
6. **Annotations** — créer/lire les annotations réseau

### Embody devrait considérer :
1. **Knowledge base offline** — ne pas dépendre uniquement du live pour l'intelligence
2. **GLSL validation** — valider les shaders sans compiler dans TD
3. **Code quality pipeline** — lint/format/typecheck des DATs Python
4. **Modes de sécurité** — restreindre l'exécution de scripts
5. **Project indexing** — index pour code completion et navigation
6. **Deploy patterns** — templates réutilisables de réseaux

---

## Conclusion

**Ce ne sont pas des concurrents directs** — ils résolvent des problèmes différents avec des philosophies complémentaires :

- **TD_starter_pack** est un **serveur de connaissance et d'outillage** qui donne à l'AI une compréhension profonde de TD avant d'agir. Sa force est la qualité et la fiabilité des interactions.

- **Embody** est un **outil de workflow** qui résout le problème fondamental du versioning TD et donne à l'AI un accès direct au runtime. Sa force est l'intégration git et la simplicité.

L'idéal serait un hybride : la knowledge base et le pipeline qualité de TD_starter_pack, combinés avec l'externalisation TDN et le workflow git d'Embody.
