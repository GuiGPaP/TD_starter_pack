<!-- session_id: d8d67442-82e4-461b-8530-4f4b42b4741f -->
# Plan: Déplacer test-compose.yml dans un sous-dossier Tests

## Context

Le projet de test (`test-compose.yml`) est à la racine de `TDDocker/`. `_derive_project_name()` utilise le nom du dossier parent → le projet s'affiche "TDDocker" dans le status display, ce qui prête à confusion avec le COMP parent.

## Changements

1. Créer `TDDocker/Tests/`
2. Déplacer `TDDocker/test-compose.yml` → `TDDocker/Tests/test-compose.yml`
3. Déplacer `TDDocker/test-osc-compose.yml` → `TDDocker/Tests/test-osc-compose.yml` (même raison)
4. Mettre à jour les refs dans les tests/docs si nécessaire

Le projet s'affichera "Tests" dans le status display.

## Vérification

- `python -m pytest python/tests/ -v` — vérifier que les tests ne référencent pas ces fichiers en dur
- Le compose file chargé via le paramètre `Composefile` de TD — l'utilisateur devra pointer vers le nouveau chemin
