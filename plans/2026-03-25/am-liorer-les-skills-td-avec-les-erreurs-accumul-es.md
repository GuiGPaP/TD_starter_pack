<!-- session_id: 6ce21031-d411-4bae-bd0c-5f80f704d359 -->
# Améliorer les skills TD avec les erreurs accumulées

## Context

13 erreurs distinctes ont été rencontrées lors de cette session en écrivant du Python TD via MCP. 21 feedbacks ont été accumulés dans les sessions précédentes. Les skills actuels (td-guide, td-python) couvrent certains pièges mais pas les erreurs spécifiques à l'exécution de scripts Python via MCP dans un contexte de création d'opérateurs et de manipulation de réseau.

## Erreurs à intégrer

### Ajouts à td-guide/SKILL.md — Section "Critical Guardrails"

Ajouter les guardrails **10 à 17** après le guardrail 9 existant :

**10. `create()` prend des strings, pas des classes.**
`comp.create('geometryCOMP', 'myGeo')` et non `comp.create(geometryCOMP, 'myGeo')`. Les classes TD Python (`geometryCOMP`, `textDAT`, `noiseTOP`) ne sont pas dans le namespace des scripts MCP. Utiliser les noms en string : `'geometryCOMP'`, `'baseCOMP'`, `'containerCOMP'`, `'textDAT'`, `'tableDAT'`, `'nullDAT'`, `'selectDAT'`, `'noiseTOP'`, `'textTOP'`, `'nullCHOP'`, `'audiodeviceinCHOP'`.

**11. `allowCooking` ne s'applique qu'aux COMPs.**
`op.allowCooking = False` crashe sur les DATs/TOPs/CHOPs/SOPs. Toujours vérifier `op.isCOMP` avant : `if copy.isCOMP: copy.allowCooking = False`.

**12. `/project1` peut ne pas exister.**
Les projets TD n'ont pas forcément de `/project1`. Le COMP principal peut s'appeler `/ProjectName`, `/myProject`, etc. Toujours vérifier avec `op('/').children` avant de cibler un chemin.

**13. `findChildren()` depuis `/` ne traverse pas les privacy flags.**
Scanner chaque conteneur de premier niveau séparément plutôt que `op('/').findChildren(depth=10)`. Les COMPs avec privacy=on bloquent la traversée.

**14. COMP connectors ≠ DAT connectors.**
Les `inputConnectors` d'un baseCOMP/containerCOMP attendent des connexions COMP-à-COMP. On ne peut pas connecter un DAT directement à un COMP connector. Pour passer des données DAT à un COMP, soit utiliser les paramètres du COMP (`par.dat = dat.path`), soit placer le DAT à l'intérieur du COMP et le connecter au `in1` interne.

**15. Ne pas deviner les noms de paramètres d'opérateurs inconnus.**
`opviewerTOP.par.comp` n'existe pas — c'est `par.opviewer`. `audiodeviceinCHOP.par.volume` n'existe pas. Toujours vérifier avec `[p.name for p in op.pars()]` ou `get_node_parameter_schema` avant d'écrire un paramètre.

**16. Geo COMP crée un torus par défaut.**
Un `geometryCOMP` créé via `create('geometryCOMP', ...)` contient automatiquement un `torus1` SOP. Le supprimer immédiatement si non désiré : `geo.op('torus1').destroy()`.

### Ajouts à td-python/SKILL.md — Section "Critical Guardrails"

Ajouter les guardrails **12 à 16** après le guardrail 11 existant :

**12. `root` n'existe pas — utiliser `op('/')`.**
Dans les scripts `execute_python_script`, `root` n'est pas défini. Utiliser `op('/')` pour accéder à la racine du projet.

**13. `td.Page` est unhashable.**
Les objets `Page` ne peuvent pas être utilisés comme clés de dictionnaire. Convertir avec `str(p.page)` avant utilisation en tant que clé.

**14. `Exception` peut ne pas être défini dans les longs scripts.**
Dans les scripts Python très longs exécutés via MCP, certains builtins standards (`Exception`, `TypeError`) peuvent ne pas être dans le namespace. Éviter les `except Exception` et utiliser des `except` nus ou des checks préventifs (`if not geo: continue`).

**15. MCP execution modes et le security analyzer.**
Le security analyzer de `execute_python_script` détecte des patterns par regex :
- `read-only` bloque `.text =`, `.par.xxx =`, `.eval()` (même dans `par.Mypar.eval()`)
- `safe-write` bloque `destroy()`, filesystem ops
- `full-exec` permet tout
Choisir le mode minimum nécessaire. Note : `.eval()` dans un nom de paramètre (ex: `par.Generallights.eval()`) est un faux positif en read-only — utiliser `safe-write` ou accéder via `str(par.Generallights)`.

**16. `result` doit être la variable de sortie.**
Les scripts `execute_python_script` doivent assigner leur résultat à une variable nommée `result`. Le type de retour du template MCP attend `{ result: T }`. Pour les listes, `result = myList` (pas `result = {"items": myList}`).

### Ajout à tasks/lessons.md

Ajouter une section "TD Python via MCP" avec les patterns d'erreurs récurrents.

## Fichiers impactés

| Fichier | Modification |
|---|---|
| `.claude/skills/td-guide/SKILL.md` | Ajouter guardrails 10-16 |
| `.claude/skills/td-python/SKILL.md` | Ajouter guardrails 12-16 |
| `tasks/lessons.md` | Ajouter section "TD Python via MCP" |

## Vérification

- [ ] `td-guide/SKILL.md` compile (markdown valide)
- [ ] `td-python/SKILL.md` compile (markdown valide)
- [ ] Chaque nouvelle guardrail correspond à une erreur réelle documentée
- [ ] Pas de doublons avec les guardrails existantes
- [ ] Numérotation continue sans gaps
