# Ruff Rules for TD Python

Ruff runs against DAT text using the project's `pyproject.toml` config. This file covers which rules matter for TouchDesigner Python and how to handle TD-specific false positives.

## Active Rule Sets

From `pyproject.toml [tool.ruff.lint]`:

```
select = [
  "E",      # pycodestyle errors
  "F",      # pyflakes (unused imports, undefined names)
  "W",      # pycodestyle warnings
  "I",      # isort (import ordering)
  "UP",     # pyupgrade (modernize to 3.11+)
  "B",      # flake8-bugbear (common bugs)
  "SIM",    # flake8-simplify
  "RUF",    # ruff-specific rules
  "T20",    # no print() (use TD logging instead)
  "C4",     # clean comprehensions
  "RET",    # clean returns
  "PIE",    # no-op code
  "PERF",   # performance anti-patterns
  "FURB",   # modern idioms
  "S",      # bandit security basics
  "ARG",    # unused arguments
  "ISC",    # implicit string concatenation
  "TC",     # type-checking imports
]
```

## TD False Positives — The F821/F401 Problem

TD injects these names into the Python execution environment at runtime. Ruff cannot see them:

| Name | What it is | Ruff flags |
|---|---|---|
| `op` | Node reference function | F821 (undefined name) |
| `me` | Current operator reference | F821 |
| `parent()` | Parent COMP accessor | F821 |
| `ipar` | Custom parameter interface | F821 |
| `tdu` | TD utility module | F821 |
| `ext` | Extension accessor | F821 |
| `mod` | Module accessor (MOD class) | F821 |
| `absTime` | Absolute time object | F821 |
| `project` | Project reference | F821 |
| `ui` | UI reference | F821 |
| `from TDStoreTools import *` | TD storage utilities | F403 (star import), F401 |
| `from TDStd import *` | TD standard library | F403, F401 |

### How to handle

**Do NOT auto-fix these.** Removing `op` or `me` references breaks the DAT at runtime.

When you encounter F821 for any of the names above:
1. Report them as TD false positives in your diagnostic summary
2. Suggest adding `# noqa: F821` to the specific line, or note that these are expected in TD Python
3. Never apply a ruff fix that removes these references

## Rules That Commonly Fire on TD Python

| Rule | What it catches | TD context |
|---|---|---|
| `F401` | Unused import | Often valid — but check for `import td` which may be used implicitly |
| `E711` | `== None` instead of `is None` | Safe to fix in TD Python |
| `W291/W293` | Trailing whitespace | Safe to fix |
| `I001` | Unsorted imports | Safe to fix — ruff isort handles this |
| `UP` rules | Old Python syntax (e.g., `dict()` vs `{}`) | Safe to fix |
| `T20` | `print()` calls | In DATs, print goes to TD textport — may be intentional logging |
| `B006` | Mutable default argument | Safe to fix |
| `SIM` rules | Simplifiable conditionals | Review case-by-case — TD callbacks sometimes need explicit structure |
| `ARG001` | Unused function argument | Often false positive in TD callbacks with fixed signatures |
| `S` rules | Security (eval, exec, subprocess) | Intentionally suppressed in `api_service.py`; in DATs, flag but don't auto-fix |

## Per-File Ignores

The project already suppresses certain rules for specific files via `[tool.ruff.lint.per-file-ignores]`. When linting DAT text (which runs through a temp file), these per-file ignores do **not** apply — the temp file path won't match the patterns.

This means DAT text gets the full ruleset. Be prepared for more diagnostics than the codebase typically shows.

## Config Inheritance

Ruff runs with `cwd` set to the project root, so `pyproject.toml` settings are inherited automatically:
- `target-version = "py311"` — Python 3.11 syntax is valid
- `line-length = 100` — lines over 100 chars flagged
- `src = ["modules"]` — affects isort first-party detection
