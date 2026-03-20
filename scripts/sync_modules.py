"""Sync manual Python modules: root modules/ → _mcp_server/td/modules/.

Usage:
    python scripts/sync_modules.py --check   # CI: fail if drift detected
    python scripts/sync_modules.py --sync    # Dev: copy root → submodule
"""

from __future__ import annotations

import argparse
import difflib
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULES_ROOT = ROOT / "modules"
SUBMODULE_MODULES = ROOT / "_mcp_server" / "td" / "modules"

# Relative paths (from modules/) of manually-maintained files to sync.
# version.py is driven by the submodule's package.json — excluded.
MANUAL_FILES: list[str] = [
    "mcp/__init__.py",
    "mcp/controllers/__init__.py",
    "mcp/controllers/api_controller.py",
    "mcp/controllers/openapi_router.py",
    "mcp/services/__init__.py",
    "mcp/services/api_service.py",
    "mcp/services/completion/__init__.py",
    "mcp/services/completion/builtin_stubs.py",
    "mcp/services/completion/context_aggregator.py",
    "mcp/services/completion/indexer.py",
    "mcp/services/completion/scan_script.py",
    "mcp_webserver_script.py",
    "utils/config.py",
    "utils/error_handling.py",
    "utils/logging.py",
    "utils/result.py",
    "utils/serialization.py",
    "utils/types.py",
    "utils/utils_logging.py",
]


def check() -> bool:
    """Return True if all synced files are identical, False otherwise."""
    ok = True
    for rel in MANUAL_FILES:
        src = MODULES_ROOT / rel
        dst = SUBMODULE_MODULES / rel
        if not src.exists():
            print(f"MISSING root: {rel}")
            ok = False
            continue
        if not dst.exists():
            print(f"MISSING submodule: {rel}")
            ok = False
            continue
        src_text = src.read_text(encoding="utf-8")
        dst_text = dst.read_text(encoding="utf-8")
        if src_text != dst_text:
            print(f"DRIFT: {rel}")
            diff = difflib.unified_diff(
                dst_text.splitlines(keepends=True),
                src_text.splitlines(keepends=True),
                fromfile=f"submodule: {rel}",
                tofile=f"root: {rel}",
                n=3,
            )
            sys.stdout.writelines(diff)
            ok = False
    if ok:
        print(f"OK: {len(MANUAL_FILES)} files in sync")
    return ok


def sync() -> None:
    """Copy each manual file from root → submodule."""
    for rel in MANUAL_FILES:
        src = MODULES_ROOT / rel
        dst = SUBMODULE_MODULES / rel
        if not src.exists():
            print(f"SKIP (missing root): {rel}")
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        print(f"COPIED: {rel}")
    print(f"Synced {len(MANUAL_FILES)} files")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="CI: fail if drift")
    group.add_argument("--sync", action="store_true", help="Dev: copy root → submodule")
    args = parser.parse_args()

    if args.check:
        if not check():
            sys.exit(1)
    else:
        sync()


if __name__ == "__main__":
    main()
