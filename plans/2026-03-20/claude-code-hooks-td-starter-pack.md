<!-- session_id: 37861586-090c-4eb3-9862-0af6d2e60fef -->
# Claude Code Hooks — TD_starter_pack

## Context

On a dû lancer `biome check --write` manuellement après chaque Edit sur le TS du submodule. Le hook PostToolUse actuel ne couvre que les `.py` dans `modules/`. Le hook Stop ne fait que pyright. Les 3 dernières CI failures étaient dues à du format drift (ruff format sur `modules/`), ce qui aurait été attrapé localement avec des hooks plus complets.

**Objectif :** Des hooks Claude Code qui attrapent localement ce que la CI vérifie, sans sur-ingénierie.

## CI actuelle (5 jobs)

| Job | Commande | Couvert par hook actuel ? |
|-----|----------|--------------------------|
| lint | `ruff check` + `ruff format --check` sur `modules/` | ✅ PostToolUse (check --fix + format) |
| typecheck | `pyright` | ✅ Stop (pyright) |
| test | `pytest --cov` | ❌ |
| sync-check | `scripts/sync_modules.py --check` | ❌ |
| generated-check | `npm run gen:handlers` + diff | ❌ (hors scope — rare) |

**Failures récentes :** 3/3 étaient du format drift Python. Le hook PostToolUse actuel devrait les attraper mais le TS n'est pas couvert.

## Plan

### Hook 1 — PostToolUse : ajouter biome sur TS du submodule

**Fichier :** `.claude/settings.json` — modifier le hook PostToolUse existant

Le hook actuel (inline bash) fait ruff sur `modules/**/*.py`. On ajoute une 2ème entrée pour les `.ts` dans `_mcp_server/`.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'input=$(cat); f=$(echo \"$input\" | jq -r \".tool_input.file_path // empty\"); [[ \"$f\" == *.py && \"$f\" == */modules/* ]] && uv run ruff check --fix \"$f\" && uv run ruff format \"$f\" || true'",
            "timeout": 10
          },
          {
            "type": "command",
            "command": "bash -c 'input=$(cat); f=$(echo \"$input\" | jq -r \".tool_input.file_path // empty\"); [[ \"$f\" == *.ts && \"$f\" == */_mcp_server/* ]] && cd _mcp_server && npx biome check --write \"$f\" || true'",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

**Pourquoi inline et pas un script séparé :** Le pattern existant est inline bash. Pas besoin de créer un script TS avec Bun (contrairement à etch qui a un setup plus complexe avec workspaces). Le one-liner est suffisant et lisible.

**Note `biome check --write` :** Combine format + lint fix en une commande. C'est exactement ce qu'on a dû faire manuellement.

### Hook 2 — Stop : vérification complète selon les fichiers modifiés

Le hook Stop actuel fait juste `uv run pyright | tail -3`. On veut :
- Si des `.py` dans `modules/` ont changé → `ruff check` + `ruff format --check` + `pyright`
- Si des `.ts` dans `_mcp_server/` ont changé → `tsc --noEmit` + `biome check`
- Si les deux → les deux

On détecte les fichiers modifiés via `git diff --name-only HEAD`.

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'changed=$(git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null); py=$(echo \"$changed\" | grep \"^modules/.*\\.py$\" || true); ts=$(echo \"$changed\" | grep \"^_mcp_server/.*\\.ts$\" || true); ok=true; if [ -n \"$py\" ]; then echo \"=== Python checks ===\"; uv run ruff check modules/ || ok=false; uv run ruff format --check modules/ || ok=false; uv run pyright 2>&1 | tail -5 || ok=false; fi; if [ -n \"$ts\" ]; then echo \"=== TypeScript checks ===\"; cd _mcp_server && npx tsc --noEmit || ok=false; npx biome check || ok=false; fi; $ok'",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**Pourquoi pas `just check` directement :** `just check` inclut `sync-check` qui nécessite le submodule checkout. Et il ne couvre pas le TS. Le script custom cible exactement les 4 jobs CI qui échouent le plus.

### Hook 3 — Stop : sync-check si modules/ modifié

Séparé du hook 2 pour la clarté du diagnostic. Si des fichiers dans `modules/` ont changé, vérifier que la sync root→submodule est cohérente.

Inclus dans le hook 2 ci-dessus plutôt qu'un hook séparé — on ajoute `uv run python scripts/sync_modules.py --check` dans le bloc `if [ -n "$py" ]`.

## Fichiers modifiés

```
.claude/settings.json   (hooks PostToolUse + Stop)
```

Un seul fichier. Pas de scripts externes, pas de dépendances supplémentaires.

## Design final du settings.json

Le fichier final contiendra :
- **PostToolUse** : 2 hooks (ruff sur .py, biome sur .ts)
- **Stop** : 1 hook (détecte py/ts modifiés, lance les checks correspondants + sync-check)

## Vérification

| Test | Attendu |
|------|---------|
| Éditer un `.ts` dans `_mcp_server/` | biome auto-format appliqué |
| Éditer un `.py` dans `modules/` | ruff check --fix + format appliqué |
| Éditer un `.json` | Aucun hook déclenché |
| Fin de session après edit `.ts` | tsc + biome check |
| Fin de session après edit `.py` | ruff check + format --check + pyright + sync-check |
| Fin de session sans changements code | Aucun check |
