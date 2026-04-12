<!-- session_id: bf51da8e-07f6-417a-ab28-602a20138483 -->
# Epic 14 — Claude Code Intelligence: Token Economy, Learning Loop, Strict Code Generation

## Contexte

Le MCP server TD_starter_pack a 85 outils, 479 entrees knowledge base, 9 skills Claude Code — mais trois faiblesses structurelles :
1. **Token waste** : reponses MCP trop verboses par defaut, skills relues inutilement, memory surchargee
2. **Pas de feedback loop automatique** : les erreurs sont bloquees (stop hook) mais jamais capturees ni correlees aux lecons passees
3. **Code genere non valide avant deploy** : les guardrails sont advisory, aucune verification pre-injection dans TD

Chaque phase = 1 issue GitHub, testable independamment. Les phases sont cumulatives.

---

## Phase 1 — Token Economy (Quick Wins)
**Issue: `14.1 — Token economy: default detailLevel, memory cleanup, skill cache instructions`**

### Changements

#### 1a. Default `detailLevel: "summary"` global
- **Fichier**: `_mcp_server/src/features/tools/types.ts`
- Le schema `detailLevelSchema` est deja `.optional()` — les handlers font `detailLevel ?? "summary"` ou `detailLevel ?? "detailed"` selon l'outil
- **Action**: Uniformiser tous les handlers pour defaulter a `"summary"` (pas `"detailed"`)
- Grep actuel : `detailLevel ?? "detailed"` apparait dans `assetTools.ts:280`, `lessonTools.ts:337`, `glslPatternTools.ts` — les convertir en `"summary"`
- Les `get_*` single-item (get_lesson, get_td_asset, get_glsl_pattern) restent `"detailed"` car l'utilisateur demande explicitement un item

#### 1b. Instruction skill "ne pas relire si deja lu"
- **Fichiers**: Chaque `SKILL.md` (8 fichiers)
- Ajouter en haut de la section progressive loading :
  ```
  **Cache rule**: If you already read this SKILL.md or a reference file in the current conversation, do NOT re-read it. Use your memory of the content.
  ```

#### 1c. Archiver les memory resolues
- **Fichier**: `.claude/projects/C--Users-guill-Desktop-TD-starter-pack/memory/MEMORY.md`
- Passer de 43 entrees a ~20 actives : archiver les feedback dont l'incident est resolu et le fix est dans le code/skill
- Candidats a l'archivage : `feedback_tddocker_mcp_async.md` (COMPLETED), `feedback_mcp_fps_lie.md` (FIXED), incidents one-shot documentes dans les skills

#### 1d. Deduplication guardrails lessons/memory/skills
- **Action**: Auditer les doublons entre `tasks/lessons.md`, `memory/feedback_*.md`, et les SKILL.md
- Regle : lessons.md = regles courtes, memory = contexte d'incident, skill = reference detaillee
- Supprimer les doublons, ajouter des renvois

### Tests de validation
- [ ] `cd _mcp_server && npm test` — pas de regression
- [ ] Appeler `search_lessons` sans `detailLevel` → verifier que la reponse est format `summary`
- [ ] Appeler `get_lesson` sans `detailLevel` → verifier que la reponse est format `detailed` (single-item exception)
- [ ] Compter les tokens d'une reponse `search_operators({query:"noise"})` avant/apres (objectif: reduction visible)
- [ ] Verifier que MEMORY.md a < 25 lignes d'entrees actives

---

## Phase 2 — Post-Write Validation Hook
**Issue: `14.2 — Auto-validate generated code: PostToolUse hook for set_dat_text`**

### Changements

#### 2a. Hook PostToolUse pour les outils MCP d'ecriture
- **Fichier**: `.claude/settings.json`
- Ajouter un matcher pour les appels MCP `set_dat_text` via PostToolUse
- Probleme : les hooks Claude Code matchent sur le nom de l'outil (`Write`, `Edit`, `Bash`), pas sur les outils MCP
- **Solution alternative** : Ajouter une instruction dans les skills GLSL et Python qui **oblige** Claude a valider apres ecriture
- **Fichiers**: `.claude/skills/td-glsl/SKILL.md`, `.claude/skills/td-pops/SKILL.md`, `.claude/skills/td-glsl-vertex/SKILL.md`, `.claude/skills/td-lint/SKILL.md`
- Ajouter un guardrail obligatoire :
  ```
  **Post-write validation (MANDATORY)**:
  After ANY `set_dat_text` call that writes GLSL or Python code:
  1. GLSL code → immediately call `validate_glsl_dat` on the same node
  2. Python code → immediately call `lint_dat` on the same node
  3. If validation fails → fix and re-write before proceeding
  Never skip this step. Never mark the task as done without a clean validation.
  ```

#### 2b. dryRun pour deploy_network_template
- **Fichier**: `_mcp_server/src/features/tools/handlers/networkTemplateTools.ts`
- `deploy_glsl_pattern` a deja `dryRun` (ligne 64, 388-401)
- `deploy_network_template` n'a PAS de dryRun — l'ajouter avec le meme pattern :
  - Schema : ajouter `dryRun: z.boolean().optional().default(false)`
  - Handler : si `dryRun`, retourner le script Python sans l'executer
- Faire pareil pour `deploy_td_asset` si absent

#### 2c. Instruction default read-only pour execute_python_script
- **Fichiers**: Skills td-guide, td-context, td-glsl
- Ajouter :
  ```
  **Execution mode rule**: Default to `read-only` for introspection. Only escalate to `safe-write` when creating/modifying operators. Never use `full-exec` unless the user explicitly asks.
  ```

### Tests de validation
- [ ] `cd _mcp_server && npm test` — pas de regression
- [ ] Appeler `deploy_network_template` avec `dryRun: true` → reponse contient le script Python, aucun operateur cree dans TD
- [ ] Ecrire du GLSL invalide via `set_dat_text` → verifier que Claude appelle `validate_glsl_dat` immediatement (test manuel avec Claude Code)
- [ ] Verifier que l'instruction read-only par defaut est presente dans les 3 skills

---

## Phase 3 — Error Capture & Feedback Loop
**Issue: `14.3 — Error feedback loop: auto-capture errors, replay at session start`**

### Changements

#### 3a. Creer `tasks/errors-log.md`
- **Fichier**: `tasks/errors-log.md`
- Format :
  ```markdown
  # Error Log
  
  ## Unresolved
  
  ### 2026-04-09 — GLSL POP crash after cook(force=True)
  - **Scope**: glsl-pop
  - **Error**: TD crash, no recovery
  - **Related lesson**: feedback_glsl_pop_crash.md
  - **Status**: unresolved / captured in skill
  
  ## Resolved
  (moved here after fix confirmed)
  ```

#### 3b. Enrichir validate-on-stop pour capturer les erreurs
- **Fichier**: `.claude/hooks/validate-on-stop.mts`
- Apres la detection de failures (ligne 144-154), ajouter :
  1. Lire `tasks/errors-log.md` si existant
  2. Pour chaque failure, creer une entree datee avec le scope et le premier message d'erreur (tronque a 200 chars)
  3. Ecrire le fichier mis a jour
  4. Le hook continue a exit(2) comme avant — le log est un effet de bord

#### 3c. Instruction session-start : lire les erreurs recentes
- **Fichier**: `CLAUDE.md`
- Ajouter dans la section Workflow :
  ```
  ### 7. Session Start Checklist
  - Read `tasks/errors-log.md` (if exists) — check for unresolved errors from past sessions
  - If unresolved errors relate to current task, address them first
  ```

#### 3d. Correlation erreur → lecon passee
- **Fichier**: `tasks/lessons.md`
- Ajouter un header de section par scope (Runtime, TD Python, GLSL, POP, etc.) pour faciliter la recherche
- **Fichier**: `CLAUDE.md`
- Ajouter :
  ```
  When encountering an error, BEFORE investigating:
  1. Check `tasks/errors-log.md` for similar past errors
  2. Check `tasks/lessons.md` for related rules
  3. Search memory with `feedback_*` pattern for past incidents
  ```

### Tests de validation
- [ ] Introduire volontairement une erreur Python dans `modules/` → lancer le stop hook → verifier que `tasks/errors-log.md` est cree/mis a jour avec l'erreur
- [ ] Corriger l'erreur → relancer → verifier que le hook passe clean
- [ ] Verifier que CLAUDE.md contient l'instruction session-start
- [ ] Test manuel : demarrer une nouvelle session Claude Code, verifier que Claude lit `tasks/errors-log.md`

---

## Phase 4 — Code Generation Contracts
**Issue: `14.4 — Code contracts: machine-verifiable rules for GLSL and Python DAT generation`**

### Changements

#### 4a. Contracts GLSL (pixel shader)
- **Fichier**: `_mcp_server/src/features/tools/security/` (nouveau fichier `glslContracts.ts`)
- Regles verifiables par regex/AST sur le code GLSL avant `set_dat_text` :
  1. `out vec4 fragColor;` present au scope global
  2. `TDOutputSwizzle(fragColor)` appele dans main()
  3. Pas de `#version` directive
  4. `normalize()` jamais appele sans guard `length() > 0`
  5. Pas de `gl_FragColor` (deprecated)
- Fonction `validateGlslContract(code: string, shaderType: "pixel"|"vertex"|"compute"): ContractResult`
- Integrer dans `set_dat_text` quand le DAT cible est un GLSL DAT (detection par nom ou contexte)

#### 4b. Contracts Python DAT
- Meme fichier ou `pythonContracts.ts`
- Regles :
  1. Pas de `import os`, `import subprocess` en mode safe-write
  2. Pas de `print()` sans `debug()` wrapper (pattern TD)
  3. References `me`, `op`, `parent()` coherentes avec le contexte TD
- Plus leger que le GLSL — principalement des warnings

#### 4c. Integration dans le flow MCP
- **Fichier**: `_mcp_server/src/features/tools/handlers/tdTools.ts`
- Dans le handler `set_dat_text` : si le contenu ressemble a du GLSL (detection heuristique), appeler `validateGlslContract` et ajouter les warnings dans la reponse
- Non-bloquant (advisory) mais visible dans la reponse MCP

#### 4d. Contracts documentes dans les skills
- Mettre a jour les SKILL.md pour lister les contracts verifies automatiquement
- Distinguer "guardrails advisory" vs "contracts auto-verifies"

### Tests de validation
- [ ] `cd _mcp_server && npm test` — nouveaux unit tests pour glslContracts et pythonContracts
- [ ] Test : code GLSL sans `TDOutputSwizzle` → contract violation dans la reponse
- [ ] Test : code GLSL avec `#version 330` → contract violation
- [ ] Test : code GLSL valide → pas de violation
- [ ] Test : `set_dat_text` avec du GLSL invalide → reponse contient les warnings de contract
- [ ] Test d'integration : deployer un pattern GLSL via MCP, verifier que les contracts passent

---

## Phase 5 — Automated Lesson Capture & Frequency Tracking
**Issue: `14.5 — Auto-capture lessons: scan_for_lessons on session end, frequency tracking`**

### Changements

#### 5a. Auto-scan en fin de session (si TD connecte)
- **Fichier**: `.claude/hooks/validate-on-stop.mts`
- Apres les checks de qualite, si un scope TD est detecte :
  1. Tenter un health check rapide vers TD (HTTP GET `http://localhost:9981/api/v1/health`, timeout 2s)
  2. Si TD repond : appeler `scan_for_lessons` via HTTP POST avec `autoCapture=false` (preview only)
  3. Logger les lessons candidates trouvees dans `tasks/errors-log.md` sous une section `## Lesson Candidates`
  4. Ne PAS auto-capturer (risque de faux positifs) — juste signaler

#### 5b. Compteur de frequence dans lessons.md
- **Fichier**: `tasks/lessons.md`
- Ajouter un format optionnel :
  ```
  - Never cook(force=True) a GLSL POP right after writing shader [x3]
  ```
- Le `[xN]` indique combien de fois l'erreur a ete rencontree
- **Fichier**: `CLAUDE.md`
- Ajouter l'instruction :
  ```
  When a lesson is triggered again, increment its counter [xN] in lessons.md.
  Lessons with [x3+] should be escalated: add the rule as a guardrail in the owning skill's SKILL.md.
  ```

#### 5c. Escalade automatique lesson → skill guardrail
- Process documente dans CLAUDE.md :
  1. Si une lecon atteint [x3], elle devient un guardrail dans le skill correspondant
  2. Le guardrail est ajoute a la section "Critical guardrails" du SKILL.md
  3. La lecon dans lessons.md est marquee `→ promoted to {skill-name} guardrail`

### Tests de validation
- [ ] Stop hook avec TD online : verifier que les lesson candidates apparaissent dans errors-log.md
- [ ] Stop hook avec TD offline : verifier que le scan est skip silencieusement (pas d'erreur)
- [ ] Verifier le format [xN] dans lessons.md sur un exemple existant
- [ ] Test manuel : creer volontairement une lecon connue 3 fois → verifier qu'elle est escaladee dans le skill

---

## Phase 6 — Snapshot & Rollback + CI Skill Drift Detection
**Issue: `14.6 — Deploy safety: pre-deploy snapshot, rollback, skill drift CI`**

### Changements

#### 6a. Snapshot pre-deploy
- **Fichier**: `_mcp_server/src/features/tools/handlers/networkTemplateTools.ts` et `glslPatternTools.ts`
- Avant chaque `deploy_*` (sauf dryRun) :
  1. Appeler `index_td_project` en mode compact sur le `parentPath` cible
  2. Stocker le snapshot dans un registre en memoire (max 5 snapshots, LIFO)
  3. Retourner un `snapshotId` dans la reponse de deploy

#### 6b. Outil undo_last_deploy
- **Fichier**: nouveau handler `rollbackTools.ts`
- Outil `undo_last_deploy` :
  - Input : `snapshotId` optionnel (defaut = dernier)
  - Compare l'etat actuel avec le snapshot
  - Genere un script Python qui supprime les operateurs ajoutes par le deploy
  - Avec `dryRun` par defaut (montre ce qui serait supprime)
  - `confirm: true` pour executer la suppression

#### 6c. CI skill drift detection
- **Fichier**: nouveau script `scripts/check-skill-drift.ts`
- Verifie que :
  1. Les noms de parametres dans les exemples des skills correspondent aux schemas MCP actuels
  2. Les noms d'outils MCP references dans les skills existent dans `register.ts`
  3. Les patterns GLSL dans les templates sont valides (appel glslangValidator)
- Integrable dans le stop hook ou en CI (GitHub Action)
- Pas bloquant en v1 — rapport seulement

### Tests de validation
- [ ] `cd _mcp_server && npm test` — nouveaux tests pour rollback + snapshot
- [ ] Deploy un template → verifier que `snapshotId` est dans la reponse
- [ ] `undo_last_deploy(dryRun: true)` → liste les ops a supprimer
- [ ] `undo_last_deploy(confirm: true)` → les ops sont supprimes, le reseau est restaure
- [ ] `check-skill-drift` sur l'etat actuel → 0 erreurs (baseline clean)
- [ ] Introduire un nom d'outil invalide dans un SKILL.md → drift detecte

---

## Phase 7 — Batch Operations & Advanced Token Optimization
**Issue: `14.7 — Batch MCP operations and field selection for token reduction`**

### Changements

#### 7a. get_td_context multi-path
- **Fichier**: `_mcp_server/src/features/tools/handlers/tdTools.ts`
- Enrichir `get_td_context` pour accepter `paths: string[]` (en plus du `path` existant)
- Retourne un objet indexe par path avec le contexte de chaque node
- Limite a 10 paths par appel

#### 7b. Field selection sur get_td_node_parameters
- **Fichier**: `_mcp_server/src/features/tools/handlers/tdTools.ts`
- Ajouter `fields?: string[]` au schema de `get_td_node_parameters`
- Si present, filtrer la reponse pour ne retourner que les parametres demandes
- Un baseCOMP a 200+ params — si Claude n'en veut que 3, ca economise ~95% de tokens

#### 7c. Batch get_td_nodes
- Ajouter `get_td_nodes_batch` ou enrichir `get_td_nodes` avec `paths: string[]`
- Retourne les enfants de N parents en un seul appel

#### 7d. Response size metrics
- **Fichier**: `_mcp_server/src/features/tools/presenter/responseFormatter.ts`
- Ajouter un champ `_meta.tokens_estimate` dans chaque reponse formatee (approximation: chars / 4)
- Permet a Claude de savoir combien de tokens il consomme et d'ajuster ses prochains appels

### Tests de validation
- [ ] `cd _mcp_server && npm test` — nouveaux tests
- [ ] `get_td_context({paths: ["/project1/geo1", "/project1/noise1"]})` → retourne les 2 contextes
- [ ] `get_td_node_parameters({path: "/project1/baseCOMP", fields: ["tx", "ty", "tz"]})` → seulement 3 params
- [ ] Comparer la taille de reponse avec/sans `fields` sur un COMP complexe
- [ ] Verifier que `_meta.tokens_estimate` est present dans les reponses

---

## Resume des issues GitHub

| Issue | Titre | Type | Effort |
|---|---|---|---|
| 14.1 | Token economy: default detailLevel, memory cleanup, skill cache instructions | enhancement | S |
| 14.2 | Auto-validate generated code: PostToolUse hook for set_dat_text | enhancement | M |
| 14.3 | Error feedback loop: auto-capture errors, replay at session start | enhancement | M |
| 14.4 | Code contracts: machine-verifiable rules for GLSL and Python DAT | enhancement | L |
| 14.5 | Auto-capture lessons: scan_for_lessons on session end, frequency tracking | enhancement | M |
| 14.6 | Deploy safety: pre-deploy snapshot, rollback, skill drift CI | enhancement | L |
| 14.7 | Batch MCP operations and field selection for token reduction | enhancement | L |

## Fichiers critiques

- `_mcp_server/src/features/tools/types.ts` — detailLevel schema
- `_mcp_server/src/features/tools/handlers/tdTools.ts` — set_dat_text, get_td_context, get_td_node_parameters
- `_mcp_server/src/features/tools/handlers/glslPatternTools.ts` — deploy_glsl_pattern, dryRun
- `_mcp_server/src/features/tools/handlers/networkTemplateTools.ts` — deploy_network_template
- `.claude/hooks/validate-on-stop.mts` — stop hook
- `.claude/settings.json` — hook configuration
- `.claude/skills/td-glsl/SKILL.md` — GLSL guardrails
- `.claude/skills/td-pops/SKILL.md` — POP guardrails
- `CLAUDE.md` — workflow instructions
- `tasks/lessons.md` — lessons
- `tasks/errors-log.md` — a creer
