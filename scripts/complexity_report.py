"""Full-repo cyclomatic complexity audit using lizard.

Scans Python and TypeScript source across all project boundaries,
excludes generated code and tests, and produces a ranked report.

Usage:
    uv run python scripts/complexity_report.py          # terminal + files
    uv run python scripts/complexity_report.py --json   # JSON only to stdout
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import lizard

ROOT = Path(__file__).resolve().parent.parent

# ── Scan paths ───────────────────────────────────────────────────────
INCLUDE_PATHS: list[Path] = [
    ROOT / "modules",
    ROOT / "_mcp_server" / "src",
    ROOT / "TDDocker" / "python" / "td_docker",
]

EXCLUDE_PATTERNS: set[str] = {
    "openapi_server",
    "generated_handlers.py",
    "node_modules",
    "dist",
    "gen",
    "__pycache__",
}

EXTENSIONS: set[str] = {".py", ".ts"}

# ── Thresholds ───────────────────────────────────────────────────────
WATCH = 10
HIGH = 15
CRITICAL = 25

TOP_N = 20


def _is_test_path(path: Path) -> bool:
    parts = path.parts
    return "tests" in parts or "test" in parts


def _is_excluded(path: Path) -> bool:
    parts = path.parts
    return any(exc in parts or path.name == exc for exc in EXCLUDE_PATTERNS)


def _collect_files() -> list[str]:
    files: list[str] = []
    for base in INCLUDE_PATHS:
        if not base.exists():
            continue
        for ext in EXTENSIONS:
            for p in base.rglob(f"*{ext}"):
                if _is_test_path(p) or _is_excluded(p):
                    continue
                files.append(str(p))
    return sorted(files)


def _severity(ccn: int) -> str:
    if ccn >= CRITICAL:
        return "critical"
    if ccn >= HIGH:
        return "high"
    if ccn >= WATCH:
        return "watch"
    return "ok"


def _severity_marker(sev: str) -> str:
    return {"critical": "!!!", "high": "!! ", "watch": "!  ", "ok": "   "}.get(sev, "")


def _relative(path: str) -> str:
    try:
        return str(Path(path).relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        return path


def run_audit() -> dict:
    files = _collect_files()
    if not files:
        print("No files found to analyze.", file=sys.stderr)
        sys.exit(1)

    results = lizard.analyze(files, threads=4)

    functions: list[dict] = []
    for file_info in results:
        for func in file_info.function_list:
            ccn = func.cyclomatic_complexity
            if ccn < WATCH:
                continue
            functions.append({
                "name": func.name,
                "file": _relative(file_info.filename),
                "line": func.start_line,
                "complexity": ccn,
                "nloc": func.nloc,
                "severity": _severity(ccn),
            })

    functions.sort(key=lambda f: f["complexity"], reverse=True)
    top = functions[:TOP_N]

    summary = {
        "total_functions": len(functions),
        "critical": sum(1 for f in functions if f["severity"] == "critical"),
        "high": sum(1 for f in functions if f["severity"] == "high"),
        "watch": sum(1 for f in functions if f["severity"] == "watch"),
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "thresholds": {"watch": WATCH, "high": HIGH, "critical": CRITICAL},
        "files_scanned": len(files),
        "summary": summary,
        "functions": top,
    }


def write_json(report: dict, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def write_markdown(report: dict, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    s = report["summary"]
    lines = [
        "# Cyclomatic Complexity Report",
        "",
        f"Generated: {report['generated_at']}",
        f"Files scanned: {report['files_scanned']}",
        f"Functions >= {WATCH}: **{s['total_functions']}** "
        f"(critical: {s['critical']}, high: {s['high']}, watch: {s['watch']})",
        "",
        f"## Top {len(report['functions'])} Hotspots",
        "",
        "| # | Sev | CCN | Lines | Function | File |",
        "|---|-----|-----|-------|----------|------|",
    ]
    for i, f in enumerate(report["functions"], 1):
        sev = f["severity"].upper()
        lines.append(
            f"| {i} | {sev} | {f['complexity']} | {f['nloc']} "
            f"| `{f['name']}` | `{f['file']}:{f['line']}` |"
        )
    lines.append("")
    lines.append(f"Thresholds: >= {WATCH} watch, >= {HIGH} high, >= {CRITICAL} critical")
    lines.append("")
    out.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    report = run_audit()

    if "--json" in sys.argv:
        print(json.dumps(report, indent=2))
        return

    report_dir = ROOT / "reports" / "complexity"
    write_json(report, report_dir / "latest.json")
    write_markdown(report, report_dir / "latest.md")

    s = report["summary"]
    print(f"Complexity audit: {s['total_functions']} functions >= {WATCH}")
    print(f"  critical: {s['critical']}  high: {s['high']}  watch: {s['watch']}")
    print(f"\nTop {len(report['functions'])} hotspots:")
    for i, f in enumerate(report["functions"], 1):
        marker = _severity_marker(f["severity"])
        print(f"  {marker} {f['complexity']:>3}  {f['name']:<40} {f['file']}:{f['line']}")
    print(f"\nReports: {report_dir / 'latest.md'}")
    print(f"         {report_dir / 'latest.json'}")


if __name__ == "__main__":
    main()
