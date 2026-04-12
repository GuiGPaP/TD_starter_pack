# Format & Typecheck Workflows

## Auto-Format with ruff

Preview formatting changes:
```
format_dat({ nodePath: '/project1/script1', dryRun: true })
```

If `changed == true`, review the `diff` and apply:
```
format_dat({ nodePath: '/project1/script1' })
```

Format applies ruff's opinionated formatting (line length, quotes, trailing commas). It does **not** fix lint violations — use `lint_dat` for that.

## Type-Check with pyright

Run pyright on DAT code (requires pyright — check `get_capabilities` first):
```
typecheck_dat({ nodePath: '/project1/script1' })
```

Review `diagnostics` with severity, message, line, column, and rule.

Pyright errors are **informational** — they don't auto-fix. Present them to the user for manual resolution. Common TD false positives include `op`, `me`, `tdu` which are runtime-injected globals.
