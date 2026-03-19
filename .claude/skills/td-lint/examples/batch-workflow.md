# Batch Lint Workflow (Project-Wide)

For linting all Python DATs under a scope at once:

```
lint_dats({ parentPath: '/project1', recursive: true })
```

## Reading the Report

The aggregated report contains:
- `totalDatsScanned`, `datsWithErrors`, `datsClean` — high-level counts
- `bySeverity` breakdown (error/warning/info)
- `worstOffenders` — top DATs by issue count
- Per-DAT `diagnostics` array

## When to Use

- **Project-wide audits** — get a bird's-eye view of code quality across all DATs
- **Before a release** — ensure no regressions in code quality
- **After bulk changes** — verify nothing broke

## After Batch Lint

For individual fixes, switch to the 6-step workflow on each DAT (see @correction-loop.md). Batch lint is read-only — it does not apply fixes.
