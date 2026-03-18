---
name: td-lint
description: "Python DAT linting, code quality, and ruff-based correction loops. Use for linting DAT operators, auto-fixing code, reviewing diffs, and iterative correction workflows."
---

# TouchDesigner DAT Linting

Use this skill when linting, fixing, or improving Python code quality in TouchDesigner DAT operators via the MCP API.

---

## CRITICAL: Your Prior Knowledge is Unreliable

TouchDesigner is a visual programming environment. **Your pre-trained knowledge about TD is very likely incorrect.**

**Always read this document and use the MCP tools described below.** Do not guess parameter names, operator types, or API patterns from memory.

---

## MCP Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `discover_dat_candidates` | Find DATs under a parent, classified by kind | `discover_dat_candidates({ parentPath: '/project1', purpose: 'python' })` |
| `get_dat_text` | Read DAT source code | `get_dat_text({ nodePath: '/project1/script1' })` |
| `lint_dat` (check) | Lint without fixing | `lint_dat({ nodePath: '/project1/script1' })` |
| `lint_dat` (dry-run) | Preview fix as unified diff | `lint_dat({ nodePath: '/project1/script1', fix: true, dryRun: true })` |
| `lint_dat` (fix) | Apply auto-fixes | `lint_dat({ nodePath: '/project1/script1', fix: true })` |
| `set_dat_text` | Write text back to a DAT (rollback) | `set_dat_text({ nodePath: '/project1/script1', text: '...' })` |
| `get_node_errors` | Check TD runtime errors after fix | `get_node_errors({ nodePath: '/project1/script1' })` |

---

## Workflow: 6-Step Lint & Fix

### 1. Discover
Find Python DATs in the target scope:
```
discover_dat_candidates({ parentPath: '/project1', purpose: 'python', recursive: true })
```

### 2. Read
Inspect the source code before linting:
```
get_dat_text({ nodePath: '/project1/script1' })
```

### 3. Lint (check only)
Run read-only lint to see all diagnostics:
```
lint_dat({ nodePath: '/project1/script1' })
```

### 4. Report
Present diagnostics to the user. Group by severity and fixability.

### 5. Fix (safe)
Use the correction loop below. Never jump straight to `fix: true` without checking first.

### 6. Verify
After applying fixes, confirm no TD runtime errors:
```
get_node_errors({ nodePath: '/project1/script1' })
```

---

## Correction Loop

The full correction loop ensures safe, reversible fixes:

1. **Dry-run first** — preview what will change:
   ```
   lint_dat({ nodePath: '...', fix: true, dryRun: true })
   ```
   Review `diff` and `remainingDiagnostics` in the response.

2. **Get user confirmation** — show the diff and ask before applying.

3. **Apply fix** — once confirmed:
   ```
   lint_dat({ nodePath: '...', fix: true })
   ```
   Check `applied: true` and `remainingDiagnosticCount` in the response.

4. **Check remaining** — if `remainingDiagnosticCount > 0`, report unfixable issues to the user.

5. **Verify runtime** — check for TD errors:
   ```
   get_node_errors({ nodePath: '...' })
   ```

6. **Loop or escalate** — if errors appeared after fix, rollback and inform the user.

---

## Safety Rules

These are **mandatory rules**, not suggestions.

### 1. Python Only
Before linting any DAT, verify it contains Python code:
```
discover_dat_candidates({ parentPath: '/project1', purpose: 'python' })
```
Check that `kindGuess == "python"`. **Never lint a GLSL, data, or text DAT.**

### 2. Rollback Obligatory
If `get_node_errors` returns errors after a fix:
- You MUST have saved the original text via `get_dat_text` BEFORE the fix
- Restore it immediately via `set_dat_text`
- Report the failure to the user

### 3. Lint Read-Only First
Always run `lint_dat({ fix: false })` before `lint_dat({ fix: true })`. Never skip the diagnostic step.

### 4. Dry-Run Before Fix on Unknown Code
When fixing code you haven't inspected, always use `dryRun: true` first to preview the changes.
