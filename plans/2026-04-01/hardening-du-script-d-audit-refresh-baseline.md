<!-- session_id: d3f2a6c1-314d-40d2-8546-7445b6165df8 -->
# Plan : Hardening du script d'audit + refresh baseline

## Contexte

L'infrastructure de complexité (Phase 1) est livrée. Il reste deux corrections mineures sur le script d'audit avant de passer au backlog de refactor :
1. Le rapport `reports/complexity/latest.md` est périmé (liste encore `complete_op_paths` refactoré)
2. `lizard.analyze(files, threads=4)` peut échouer sur Windows avec `PermissionError`

## Fichiers à modifier

### 1. `scripts/complexity_report.py`

- **Ligne 98** : remplacer `threads=4` par `threads=1` — lizard en mono-thread est déjà rapide sur ~100 fichiers, et évite les `PermissionError` Windows sur les handles de fichier
- Pas de fallback try/except — `threads=1` est le bon défaut pour un audit local

### 2. Régénérer le baseline

- Exécuter `just complexity` après le fix pour produire un rapport à jour
- Le rapport sera automatiquement ignoré par git (`reports/complexity/` dans `.gitignore`)

## Vérification

1. `uv run python scripts/complexity_report.py` → exit 0 sans exception
2. `complete_op_paths` absent du top 20
3. Le top 20 commence par les hotspots TS/Python restants (glslPatternFormatter, registry, serialization, etc.)
4. Le fichier `reports/complexity/latest.md` est cohérent avec la sortie terminal

## Hors scope

Le backlog de refactor (TS presenters, registry, Python serialization, etc.) sera traité séparément après validation de ce refresh.
