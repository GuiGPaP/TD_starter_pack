<!-- session_id: 5c5b2219-b6ae-41fe-990a-ef4d94a4ff30 -->
# Publication TD_starter_pack — Minimal Viable Release

## Context

Le projet est déjà à ~80% prêt pour une publication OSS publique sur GitHub (`GuiGPaP/TD_starter_pack`) : LICENSE MIT au root, READMEs bilingues EN/FR, CI/CD fonctionnel, CHANGELOG root, aucun secret committé, submodules publics (TDpretext, TDDocker). Audit du 2026-04-08 listait des blockers — la majorité ont été traités entre le 2026-04-08 et aujourd'hui.

**Ce qui reste** relève de la "governance hygiene" standard OSS + du nettoyage de fichiers traînant à la racine. Scope volontairement **minimal viable** : on publie d'abord, on polish après.

## Scope retenu

- Governance docs : `CONTRIBUTING.md`, `SECURITY.md`
- Métadonnées `pyproject.toml`
- Nettoyage fichiers suspects root
- Documentation divergence de versions
- Commit TOE v4 en parallèle de l'existant

Hors scope (reporté) : `CODE_OF_CONDUCT.md`, issue/PR templates, alignement versions, examples/.

---

## 1. Governance docs à créer

### `CONTRIBUTING.md` (root)
Sections minimales :
- Prerequisites (TD 2023.12000+, Python 3.11+, Node 20+, mise/uv/just)
- Dev setup : `git submodule update --init --recursive` → `mise install` → `uv sync` → `cd _mcp_server && npm install`
- Workflow : plan mode, `just check`, `just test`, PR via `git-wt`
- Submodule workflow (TDpretext, TDDocker) — renvoie vers `CLAUDE.md#Submodules`
- Code style : ruff + pyright (root), ESLint + TS strict (_mcp_server)

### `SECURITY.md` (root)
Motivation : 3 modes d'exécution Python (`off` / `allowlist` / `on`) dans le MCP — **important à documenter**.
Sections :
- Script execution modes (renvoie à `_mcp_server/docs/` si détaillé ailleurs)
- Reporting vulnerabilities : email `guillaume.parrat@gmail.com` (ou GitHub Security Advisory)
- Out-of-scope : exécution Python locale voulue, TouchDesigner lui-même
- Defaults : `off` par défaut, opt-in explicite

## 2. Métadonnées `pyproject.toml`

**Fichier** : `C:\Users\guill\Desktop\TD_starter_pack\pyproject.toml`

Ajouter dans `[project]` (entre ligne 2 et 4) :
```toml
description = "TouchDesigner × Claude MCP starter pack — live control, introspection, GLSL deployment, and operator knowledge base"
authors = [{ name = "Guillaume Parrat", email = "guillaume.parrat@gmail.com" }]
license = { text = "MIT" }
readme = "README.md"
keywords = ["touchdesigner", "mcp", "claude", "glsl", "ai", "creative-coding"]
classifiers = [
  "Development Status :: 4 - Beta",
  "Intended Audience :: Developers",
  "License :: OSI Approved :: MIT License",
  "Programming Language :: Python :: 3.11",
  "Topic :: Multimedia :: Graphics",
  "Topic :: Software Development :: Libraries",
]

[project.urls]
Homepage = "https://github.com/GuiGPaP/TD_starter_pack"
Repository = "https://github.com/GuiGPaP/TD_starter_pack"
Issues = "https://github.com/GuiGPaP/TD_starter_pack/issues"
```

## 3. Nettoyage fichiers root

### `.gitignore` — ajouter
```
# Gource visualization output (generated, not versioned)
gource_vertical.mp4
```

### Fichiers à commiter (nouveaux, sidecars v4)
- `starter_pack.4.toe` — v4 du projet TD, côté à côté de `starter_pack.toe` (déjà tracké)
- `starter_pack.4.td-catalog.json` — sidecar JSON du catalog v4
- `starter_pack.4.td-catalog.md` — sidecar Markdown du catalog v4

### Fichiers déjà gitignorés mais présents en working tree (laisser tel quel)
- `.coverage`, `logs/`, `reports/` — runtime artifacts, OK
- `skills-lock.json` deleted (status D) — à clarifier : vérifier si c'est intentionnel avant le commit (soit le supprimer définitivement avec `git rm`, soit le restaurer). **À décider au moment de l'exécution.**

## 4. Documenter la divergence de versions

**Fichier** : `README.md` (section existante "Project structure" ou créer une sous-section "Versioning").

Ajouter un court paragraphe :
```markdown
## Versioning

This monorepo contains two independently versioned components:

- **`pyproject.toml` (v0.1.0)** — Python wrapper for the monorepo (tests, CI, modules). Follows its own SemVer starting from MVP.
- **`_mcp_server/package.json` (v1.5.0-td.1)** — TouchDesigner MCP server, forked from [8beeeaaat/touchdesigner-mcp](https://github.com/8beeeaaat/touchdesigner-mcp) v1.5.0. The `-td.1` suffix marks our divergence for TD_starter_pack.

These cycles stay separate by design: the MCP server may be published standalone on npm, while the root wrapper tracks the starter-pack release cadence.
```

Équivalent à répliquer dans `README.fr.md`.

---

## Fichiers critiques à modifier

| Fichier | Action |
|---|---|
| `C:\Users\guill\Desktop\TD_starter_pack\CONTRIBUTING.md` | **créer** |
| `C:\Users\guill\Desktop\TD_starter_pack\SECURITY.md` | **créer** |
| `C:\Users\guill\Desktop\TD_starter_pack\pyproject.toml` | edit — ajouter metadata `[project]` + `[project.urls]` |
| `C:\Users\guill\Desktop\TD_starter_pack\.gitignore` | edit — ajouter `gource_vertical.mp4` |
| `C:\Users\guill\Desktop\TD_starter_pack\README.md` | edit — section Versioning |
| `C:\Users\guill\Desktop\TD_starter_pack\README.fr.md` | edit — section Versioning |
| `starter_pack.4.toe` + 2 sidecars `.td-catalog.*` | `git add` (nouveaux fichiers) |

## Ordre d'exécution suggéré

1. Créer `CONTRIBUTING.md` + `SECURITY.md`
2. Edit `pyproject.toml` (metadata)
3. Edit `.gitignore` (gource)
4. Edit `README.md` + `README.fr.md` (section Versioning)
5. Décider de `skills-lock.json` (question ouverte)
6. `git add` les nouveaux fichiers + `.toe` v4 + sidecars
7. Commit : `docs: add governance docs (CONTRIBUTING, SECURITY), project metadata, v4 starter pack`
8. Vérifier `git status` propre
9. (Optionnel) Push + passer le repo de private → public sur GitHub

## Verification

1. **Metadata Python** : `uv build` doit produire un wheel avec les metadata correctes (`python -m build --sdist` puis `tar tzf dist/*.tar.gz` → PKG-INFO contient description/authors/license).
2. **Lint CI local** : `just check` passe.
3. **README render** : ouvrir README.md dans l'aperçu GitHub (preview local via `gh repo view` ou pousser sur une branche de test).
4. **Submodules OK** : cloner dans un dossier temp + `git submodule update --init --recursive` → TDpretext et TDDocker se clonent sans auth.
5. **Scan secrets final** : `gh secret-scan` ou lecture manuelle de `git log --all --full-history -p | rg -i "api[_-]?key|password|secret|token" | head -30`.
6. **Links check** : le workflow CI existant lance déjà `lychee` sur les liens README (si configuré).

## Out of scope / backlog

À traiter après la publication initiale :
- `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1)
- `.github/ISSUE_TEMPLATE/` (bug_report.yml, feature_request.yml) + `.github/PULL_REQUEST_TEMPLATE.md`
- `examples/` directory avec au moins 1 projet TD minimal + README d'utilisation
- Premier tag `v0.1.0` + GitHub Release notes
- Badges README (CI status, license, Python version)
- Alignement versions (si la divergence devient friction)
