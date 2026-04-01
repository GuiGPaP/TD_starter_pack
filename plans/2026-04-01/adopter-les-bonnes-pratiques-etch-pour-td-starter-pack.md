<!-- session_id: a8ecda26-c2ab-47c0-ade4-7c306373b9eb -->
# Plan : Adopter les bonnes pratiques Etch pour TD_starter_pack

## Context

Hooks Claude Code actuels fragiles (bash non testable, pas de guard destructif, Stop illisible). Port des patterns Etch à valeur ajoutée, avec 3 corrections issues du feedback utilisateur.

---

## Étape 1 — Guard destructive (PreToolUse)

**Port de `etch/.claude/hooks/guard-destructive.mts`.**

**Fichier :** `.claude/hooks/guard-destructive.mts`

- `BLOCKED_PATTERNS` : `rm -rf`, `git push --force`, `git reset --hard`, `git clean -f`, `git checkout .`, `git branch -D`, `git stash drop/clear`
- `stripStringLiterals()` : strip heredocs + quoted strings AVANT le matching
- `parseHookInput()` : lecture JSON stdin
- Sortie JSON : `{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "..."}}`

**Fichier :** `.claude/hooks/guard-destructive.test.mts`

- Tests : heredoc ignoré, commit message inoffensif, patterns bloqués, JSON invalide
- Run : `node --experimental-strip-types --test .claude/hooks/guard-destructive.test.mts`

**Fichier :** `.claude/hooks/run-hook.js` (launcher universel)

Le problème : si `settings.json` appelle directement `node --experimental-strip-types guard.ts` et que Node < 22.6, le process crash avant même que le script TS ne démarre. Solution : un petit launcher `.js` (compatible Node 18+) qui choisit la stratégie d'exécution :

```js
// .claude/hooks/run-hook.js <script.ts>
// 1. Lit stdin en entier (Buffer)
// 2. Si Node >= 22.6 → spawnSync("node", ["--experimental-strip-types", script], {input: stdin})
// 3. Sinon → spawnSync(npxCmd, ["tsx", script], {input: stdin})
//    où npxCmd = process.platform === "win32" ? "npx.cmd" : "npx"
// 4. Si aucun runner dispo → exit 0 (stderr warning, guard désactivé)
// 5. Recopie stdout du subprocess tel quel (JSON de décision PreToolUse)
// 6. Exit avec le même code que le subprocess
```

**Contraintes d'implémentation :**
- Utiliser `spawnSync` (pas `execFileSync`) pour relayer stdin ET recopier stdout/stderr
- Sur Windows, appeler `npx.cmd` pas `npx` (sinon ENOENT selon l'environnement)
- Pas de `package.json` à la racine → Node traite les `.ts` en sémantique CommonJS. Les hooks doivent être écrits en style CJS-compatible (pas de top-level await, utiliser `require`-like patterns) OU renommés `.mts`. **Choix : écrire en `.mts`** (ES modules explicite) et adapter le launcher pour passer `--experimental-strip-types` qui gère `.mts`.

Le settings.json pointe vers : `node .claude/hooks/run-hook.js .claude/hooks/guard-destructive.mts`

## Étape 2 — Stop hook scope-aware

**Fichier :** `.claude/hooks/validate-on-stop.mts` (lancé via `run-hook.js`)

**3 scopes réels :**

| Scope | Glob | Checks |
|-------|------|--------|
| `python` | `modules/**/*.py` | `uv run ruff check modules/` + `uv run ruff format --check modules/` + `uv run pyright` |
| `typescript` | `_mcp_server/**/*.ts` | `cd _mcp_server && npx tsc --noEmit` + `npx biome check` (fichiers changés) |
| `tddocker` | `TDDocker/python/**/*.py` | `cd TDDocker && uv run ruff check python/` + `uv run ruff format --check python/` + `uv run pyright` |

**sync-check conditionnel :** Si scope `python` actif → `uv run python scripts/sync_modules.py --check` (aligné `justfile:25`).

**Choix quality gate :** pyright inclus pour `python` et `tddocker` — cohérent avec la CI (`ci.yml:25` et `TDDocker/pyproject.toml:15`). Le Stop est un **quality gate**, pas un simple lint gate. Les checks sont rapides individuellement (pyright ~3s), mais quand plusieurs scopes sont actifs simultanément le cumul peut atteindre 20-30s. Timeout à 60s pour être robuste.

**Logique :**
1. Lister fichiers changés (git diff + cached + untracked)
2. Classifier par scope (first-match, normaliser backslashes)
3. Lancer checks par scope actif (séquentiel)
4. Si `python` actif → sync-check
5. Exit 0 si clean, exit 2 + stderr si erreurs

## Étape 3 — settings.json + commit

**Fichier :** `.claude/settings.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/run-hook.js .claude/hooks/guard-destructive.mts",
            "timeout": 5
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/pre-commit-lint.sh",
            "timeout": 30
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/post-edit-lint.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/run-hook.js .claude/hooks/validate-on-stop.mts",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

## Étape 4 — Spike .claude/rules/ (optionnel)

Créer UN fichier test `.claude/rules/test-spike.md` avec `paths: ["_mcp_server/src/**"]`, éditer un fichier matching, vérifier le chargement dans le transcript. Si ça marche → créer les 3 rules réelles (`modules-python.md`, `mcp-server-typescript.md`, `tddocker.md`). Sinon → statu quo avec CLAUDE.md imbriqués existants.

## Ce qu'on N'adopte PAS

| Pattern Etch | Raison |
|-------------|--------|
| `checkMergeGuard` | Pas de policy merge linéaire |
| 27 rules files | 3 boundaries → 3 rules max |
| Convertir post-edit/pre-commit en TS | Bash suffit pour l'auto-format |
| `partitionLintOutput` | Ruff/biome pas de faux positifs |
| SubagentStop / fork pipeline | Pas de fork dans ce projet |

## Vérification

1. `node --experimental-strip-types --test .claude/hooks/guard-destructive.test.mts`
2. Test manuel guard : `echo '{"tool_input":{"command":"rm -rf /"}}' | node .claude/hooks/run-hook.js .claude/hooks/guard-destructive.mts` → deny
3. Test false positive : `echo '{"tool_input":{"command":"git commit -m \"dont rm -rf\""}}' | ...` → pass
4. Stop hook : modifier un fichier `modules/` → stop lance ruff + pyright + sync-check
5. Stop hook : modifier un fichier `TDDocker/python/` → stop lance ruff + pyright TDDocker
6. Stop hook : modifier un fichier `_mcp_server/` → stop lance tsc + biome

## Ordre d'exécution

| # | Fichiers | Commit |
|---|----------|--------|
| 1 | `.claude/hooks/run-hook.js` | — |
| 2 | `.claude/hooks/guard-destructive.mts` + `.test.ts` | oui |
| 3 | `.claude/hooks/validate-on-stop.mts` | oui |
| 4 | `.claude/settings.json` | oui (avec 2+3) |
| 5 | Spike rules (optionnel, pas commité) | — |

Étapes 1-2 et 3 en parallèle. Étape 4 après.
