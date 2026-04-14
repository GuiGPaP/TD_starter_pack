<!-- session_id: 70b58084-ddf7-4519-be58-43e9e2a86a51 -->
# Plan — Extraire TDpretext et TDDocker en repos GitHub publics

## Context

`TDpretext/` et `TDDocker/` vivent actuellement dans le mono-repo `TD_starter_pack`. Tu veux les publier comme **deux repos GitHub publics OSS distincts**, tout en gardant TD_starter_pack capable de les utiliser via **submodules git**.

Asymétrie clé entre les deux :
- **TDpretext** : 14 MB, **0 fichier tracké** par git (uniquement `.toe` + backups + un symlink vers un skill Claude). Extraction triviale = init + push.
- **TDDocker** : 79 MB, **49 fichiers trackés** (~20+ commits substantiels), package Python complet (`pyproject.toml`, tests, docs). Nécessite `git subtree split` pour préserver l'historique.

Décisions confirmées :
1. Réintégration via **submodules** dans le parent
2. **TD_SLlidar_docker reste dans TDDocker** ; son `sllidar_ros2/.git` → submodule pointant vers `Slamtec/sllidar_ros2`
3. **Public OSS** dès le départ → besoin de LICENSE + README anglais + CONTRIBUTING
4. **Préserver l'historique** TDDocker via `git subtree split`

## Stratégie

Helper disponible : `git-tools:submodule-setup` (déjà dans les skills, gère l'architecture submodule + GitHub Actions sync). On l'invoque pour structurer les submodules ; on fait le subtree split à la main car c'est un cas one-shot.

Ordre d'exécution : **TDpretext d'abord** (cas trivial, valide le workflow), puis **TDDocker** (cas complexe avec historique).

---

## Phase 0 — Pré-flight

1. **Backup local** :
   - `git bundle create ../TD_starter_pack-pre-extract.bundle --all` depuis le parent
   - Tag de sécurité dans le parent : `git tag pre-extract-tdpretext-tddocker`
2. **Vérifier état propre** :
   - Stash/commit des modifs en cours (le `git status` montre des untracked à filtrer)
   - Confirmer qu'aucun travail non-commité n'est dans `TDDocker/` tracké
3. **Choisir la license** : par défaut **MIT** pour les deux (à valider). Préparer les fichiers texte avant de toucher à l'arborescence.

---

## Phase 1 — TDpretext (cas simple, 0 historique)

**Cible repo** : `https://github.com/GuiGPaP/TDpretext` (à créer vide, sans README/license auto-générés).

1. **Nettoyer le symlink** : `TDpretext/skills/pretext` → `.agents/skills/pretext` n'aura plus de cible une fois extrait. Supprimer le symlink ; le contenu du skill reste dans le parent (`.agents/skills/pretext/SKILL.md` est un asset Claude, pas un livrable du repo TDpretext).
2. **Préparer le contenu du nouveau repo** dans un dossier temporaire hors parent (ex. `C:\Users\guill\Desktop\TDpretext-new\`) :
   - Copier `TDpretext/` (sauf le symlink supprimé)
   - Ajouter `LICENSE` (MIT), `README.md` anglais minimal (description, installation TD, lien vers skill `td-pretext` du starter-pack), `.gitignore` (ignore `TDImportCache/`, `*.toeBackup`, `Backup/*.toe` selon ta préférence — à confirmer si on veut versionner les backups TD).
3. **Init + premier commit** :
   ```bash
   cd /c/Users/guill/Desktop/TDpretext-new
   git init -b main
   git add . && git commit -m "Initial public release"
   gh repo create GuiGPaP/TDpretext --public --source=. --remote=origin --push
   ```
4. **Supprimer du parent** + **ré-ajouter comme submodule** :
   ```bash
   cd /c/Users/guill/Desktop/TD_starter_pack
   rm -rf TDpretext
   git submodule add https://github.com/GuiGPaP/TDpretext.git TDpretext
   git commit -m "chore: extract TDpretext as submodule"
   ```

---

## Phase 2 — TDDocker (subtree split + nested ROS2 submodule)

**Cible repo** : `https://github.com/GuiGPaP/TDDocker` (à créer vide).

### 2a — Extraction historique préservée

```bash
cd /c/Users/guill/Desktop/TD_starter_pack
git subtree split --prefix=TDDocker -b tddocker-extract
```
Crée une branche locale `tddocker-extract` dont la racine est l'ancien `TDDocker/`, avec l'historique des 49 fichiers trackés réécrit.

### 2b — Préparer le nouveau repo

```bash
git clone . /c/Users/guill/Desktop/TDDocker-new --branch tddocker-extract --single-branch
cd /c/Users/guill/Desktop/TDDocker-new
git remote remove origin
git checkout -b main && git branch -D tddocker-extract
```

Ajouts pour OSS public :
- `LICENSE` (MIT)
- `README.md` (déjà présent — vérifier qu'il est en anglais, sinon traduire)
- `CONTRIBUTING.md`
- `.gitignore` étendu : ajouter `td-overlay.yml`, `.venv/`, `.pytest_cache/`, `.ruff_cache/`, `.uv-cache/` (actuellement ces caches sont ignorés via `.gitignore` parent — il faut les répéter ici)

### 2c — Convertir `sllidar_ros2` en submodule

État actuel : `TDDocker/TD_SLlidar_docker/sllidar_ros2/` est un **clone vanilla** de `https://github.com/Slamtec/sllidar_ros2.git` (HEAD = `3430009`, untracked dans le parent, donc absent du subtree split).

Dans le repo TDDocker-new :
```bash
cd TD_SLlidar_docker
git submodule add https://github.com/Slamtec/sllidar_ros2.git sllidar_ros2
cd sllidar_ros2 && git checkout 3430009  # pin sur le commit testé
```
**À vérifier avant** : confirmer qu'il n'y a aucun commit local dans le clone actuel (`cd TDDocker/TD_SLlidar_docker/sllidar_ros2 && git log --not --remotes`). Si modifs locales → fork sous `GuiGPaP/sllidar_ros2` d'abord.

### 2d — Push initial

```bash
gh repo create GuiGPaP/TDDocker --public --source=. --remote=origin --push
git push --recurse-submodules=on-demand
```

### 2e — Remplacer dans le parent par un submodule

```bash
cd /c/Users/guill/Desktop/TD_starter_pack
git rm -r TDDocker
git commit -m "chore: extract TDDocker to its own repo"
git submodule add https://github.com/GuiGPaP/TDDocker.git TDDocker
git submodule update --init --recursive  # initialise sllidar_ros2 imbriqué
git commit -m "chore: re-add TDDocker as submodule"
```

---

## Phase 3 — Mises à jour du parent

Fichiers **à ajuster** dans `TD_starter_pack` après extraction :

| Fichier | Action |
|---------|--------|
| `.gitignore` | Retirer `TDDocker/td-overlay.yml` (déplacé dans `.gitignore` du sous-repo) |
| `.claude/hooks/validate-on-stop.mts` | **Aucun changement** — le path `TDDocker/python/` reste valide via le submodule |
| `CLAUDE.md` (root) | Ajouter une note dans la section "MCP Server" / nouvelle section "Submodules" listant les deux nouveaux repos et leur rôle |
| `.gitmodules` | Créé automatiquement par `git submodule add` |

**Aucun changement** requis dans les skills (`td-pretext`, `td-guide`, etc.) — leurs références sont sémantiques, pas des chemins durs vers les dossiers extraits.

---

## Phase 4 — Vérification end-to-end

1. **Clone test propre** :
   ```bash
   cd /tmp
   git clone --recursive https://github.com/GuiGPaP/TD_starter_pack.git verify
   ls verify/TDpretext/TDpretext.toe   # doit exister
   ls verify/TDDocker/pyproject.toml   # doit exister
   ls verify/TDDocker/TD_SLlidar_docker/sllidar_ros2/package.xml  # submodule imbriqué
   ```
2. **Hook de validation** (depuis le parent) :
   ```bash
   cd TD_starter_pack
   .claude/hooks/validate-on-stop.mts  # doit toujours linter TDDocker/python/
   ```
3. **Tests TDDocker standalone** :
   ```bash
   cd TDDocker && uv run pytest
   ```
4. **Historique préservé** : `cd TDDocker && git log --oneline | head -20` doit montrer les commits originaux (refactors, feat: async lifecycle, etc.).
5. **Push parent** :
   ```bash
   cd TD_starter_pack
   git push origin main
   ```

---

## Risques & Mitigations

| Risque | Mitigation |
|--------|------------|
| `git subtree split` lent sur gros historique | Acceptable (one-shot, ~30s pour 49 fichiers) |
| Symlink Windows cassé après extraction TDpretext | Supprimé en phase 1.1 |
| `sllidar_ros2` contient des modifs locales non-pushées | Vérification explicite en phase 2.2c, fork si nécessaire |
| Hook `validate-on-stop.mts` casse car submodule non-initialisé | Documenter dans README parent : `git submodule update --init --recursive` post-clone |
| `TDImportCache/` versionné par erreur dans TDpretext | À traiter dans `.gitignore` phase 1.2 |
| Backup `.toe` pollue le repo TDpretext | Décision à confirmer : versionner ou ignorer `Backup/`? |

---

## Fichiers critiques à modifier

- `C:\Users\guill\Desktop\TD_starter_pack\.gitignore` (retirer ligne TDDocker)
- `C:\Users\guill\Desktop\TD_starter_pack\CLAUDE.md` (note submodules)
- `C:\Users\guill\Desktop\TD_starter_pack\.gitmodules` (créé)
- Nouveaux : `TDpretext-new/{LICENSE,README.md,.gitignore}`, `TDDocker-new/{LICENSE,CONTRIBUTING.md,.gitignore augmenté}`

## Helpers à utiliser

- `git-tools:submodule-setup` skill (si on veut aussi automatiser le sync via GitHub Actions)
- `git-wt` (ton helper personnel) si on travaille en worktree pour isoler l'opération

## Décisions ouvertes (à confirmer avant exécution)

1. License : **MIT** par défaut ?
2. Versionner `TDpretext/Backup/*.toe` (57 fichiers) ou les ignorer ?
3. Nom GitHub : `GuiGPaP/TDpretext` et `GuiGPaP/TDDocker` ?
4. GitHub Actions sync auto via `git-tools:submodule-setup` ou rester manuel ?
