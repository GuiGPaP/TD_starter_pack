# Response Schemas

JSON shapes returned by the lint-related MCP tools. All responses are wrapped in `{ "success": true, "data": { ... } }`.

---

## `lint_dat` — check mode (no fix)

Call: `lint_dat({ nodePath: '/project1/script1' })`

```json
{
  "path": "/project1/script1",
  "name": "script1",
  "diagnosticCount": 2,
  "diagnostics": [
    {
      "code": "F401",
      "message": "`os` imported but unused",
      "line": 1,
      "column": 1,
      "endLine": 1,
      "endColumn": 10,
      "fixable": true
    },
    {
      "code": "E711",
      "message": "Comparison to `None` should use `is`",
      "line": 5,
      "column": 4,
      "endLine": 5,
      "endColumn": 15,
      "fixable": false
    }
  ]
}
```

Fields:
- `diagnosticCount` — total number of diagnostics found
- `diagnostics[].code` — ruff rule code (e.g., `F401`, `E711`, `W291`)
- `diagnostics[].fixable` — `true` if ruff can auto-fix this diagnostic
- `diagnostics[].line` / `column` — 1-based location in the DAT text

---

## `lint_dat` — dry-run mode (preview diff)

Call: `lint_dat({ nodePath: '/project1/script1', fix: true, dryRun: true })`

```json
{
  "path": "/project1/script1",
  "name": "script1",
  "diagnosticCount": 2,
  "diagnostics": [ ... ],
  "fixed": true,
  "applied": false,
  "diff": "--- /project1/script1 (original)\n+++ /project1/script1 (fixed)\n@@ -1,3 +1,2 @@\n-import os\n import td\n",
  "fixedText": "import td\n...",
  "remainingDiagnostics": [
    {
      "code": "E711",
      "message": "Comparison to `None` should use `is`",
      "line": 4,
      "column": 4,
      "endLine": 4,
      "endColumn": 15,
      "fixable": false
    }
  ],
  "remainingDiagnosticCount": 1
}
```

Key fields:
- `applied` — always `false` in dry-run mode (DAT text unchanged)
- `diff` — unified diff string showing what would change
- `fixed` — `true` if ruff found fixable issues, `false` if nothing to fix
- `fixedText` — the complete fixed source code
- `remainingDiagnostics` — diagnostics that persist after auto-fix (unfixable issues)

---

## `lint_dat` — fix mode (apply changes)

Call: `lint_dat({ nodePath: '/project1/script1', fix: true })`

```json
{
  "path": "/project1/script1",
  "name": "script1",
  "diagnosticCount": 2,
  "diagnostics": [ ... ],
  "fixed": true,
  "applied": true,
  "fixedText": "import td\n...",
  "remainingDiagnostics": [ ... ],
  "remainingDiagnosticCount": 1
}
```

Key fields:
- `applied` — `true` means the DAT's `.text` was updated in the live TD session
- No `diff` field in fix mode — the change is already applied

---

## `lint_dat` — nothing to fix

When ruff finds no fixable issues:

```json
{
  "path": "/project1/script1",
  "name": "script1",
  "diagnosticCount": 0,
  "diagnostics": [],
  "fixed": false,
  "applied": false,
  "remainingDiagnostics": [],
  "remainingDiagnosticCount": 0
}
```

---

## `discover_dat_candidates`

Call: `discover_dat_candidates({ parentPath: '/project1', purpose: 'python', recursive: true })`

```json
{
  "parentPath": "/project1",
  "purpose": "python",
  "count": 3,
  "candidates": [
    {
      "path": "/project1/script1",
      "name": "script1",
      "opType": "scriptDAT",
      "kindGuess": "python",
      "confidence": "high",
      "why": "scriptDAT operator",
      "lineCount": 42,
      "parentComp": "/project1",
      "isDocked": false
    },
    {
      "path": "/project1/container1/text1",
      "name": "text1",
      "opType": "textDAT",
      "kindGuess": "python",
      "confidence": "medium",
      "why": "Python markers (2 found)",
      "lineCount": 15,
      "parentComp": "/project1/container1",
      "isDocked": true
    }
  ]
}
```

Fields:
- `kindGuess` — `"python"`, `"glsl"`, `"text"`, or `"data"`. Only lint when `"python"`.
- `confidence` — `"high"`, `"medium"`, `"low"`. For `"low"`, read the DAT text first to confirm.
- `why` — human-readable reason for the classification
- `isDocked` — `true` if the DAT is docked to a parent (shader DATs are typically docked)

Sort order: high confidence first, then alphabetical by name.

---

## `get_node_errors`

Call: `get_node_errors({ nodePath: '/project1/script1' })`

```json
{
  "nodePath": "/project1/script1",
  "nodeName": "script1",
  "opType": "scriptDAT",
  "errorCount": 1,
  "hasErrors": true,
  "errors": [
    {
      "nodePath": "/project1/script1",
      "nodeName": "script1",
      "opType": "scriptDAT",
      "message": "NameError: name 'undefined_var' is not defined"
    }
  ]
}
```

No errors (healthy state):

```json
{
  "nodePath": "/project1/script1",
  "nodeName": "script1",
  "opType": "scriptDAT",
  "errorCount": 0,
  "hasErrors": false,
  "errors": []
}
```

Use `hasErrors` as the quick check — if `true` after a fix, rollback immediately.
