"""Synchronize canonical repo skills into agent-specific skill folders."""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

IGNORED_NAMES = {".DS_Store", "Thumbs.db"}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def as_repo_path(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def ensure_inside(path: Path, parent: Path) -> None:
    resolved_path = path.resolve()
    resolved_parent = parent.resolve()
    try:
        resolved_path.relative_to(resolved_parent)
    except ValueError as exc:
        msg = f"Refusing to operate outside {resolved_parent}: {resolved_path}"
        raise RuntimeError(msg) from exc


def skill_dirs(root: Path) -> dict[str, Path]:
    if not root.exists():
        return {}
    return {
        child.name: child
        for child in sorted(root.iterdir())
        if child.is_dir() and (child / "SKILL.md").is_file()
    }


def file_set(root: Path) -> set[Path]:
    if not root.exists():
        return set()
    files: set[Path] = set()
    for path in root.rglob("*"):
        if any(part in IGNORED_NAMES for part in path.parts):
            continue
        if path.is_file():
            files.add(path.relative_to(root))
    return files


def compare_tree(source: Path, target: Path, repo: Path) -> list[str]:
    problems: list[str] = []
    if not target.exists():
        return [f"MISSING {as_repo_path(target, repo)}/"]

    source_files = file_set(source)
    target_files = file_set(target)

    problems.extend(
        f"MISSING {as_repo_path(target / rel_path, repo)}"
        for rel_path in sorted(source_files - target_files)
    )
    problems.extend(
        f"EXTRA {as_repo_path(target / rel_path, repo)}"
        for rel_path in sorted(target_files - source_files)
    )
    problems.extend(
        f"MISMATCH {as_repo_path(target / rel_path, repo)}"
        for rel_path in sorted(source_files & target_files)
        if (source / rel_path).read_bytes() != (target / rel_path).read_bytes()
    )
    return problems


def check(source_root: Path, target_roots: tuple[Path, ...], repo: Path) -> list[str]:
    problems: list[str] = []
    source_skills = skill_dirs(source_root)

    if not source_skills:
        return [f"No skills found in {as_repo_path(source_root, repo)}"]

    for target_root in target_roots:
        target_skills = skill_dirs(target_root)
        for skill_name in sorted(source_skills):
            problems.extend(
                compare_tree(
                    source_skills[skill_name],
                    target_root / skill_name,
                    repo,
                )
            )
        problems.extend(
            f"EXTRA {as_repo_path(target_root / skill_name, repo)}/"
            for skill_name in sorted(set(target_skills) - set(source_skills))
        )

    return problems


def copy_tree(source: Path, target: Path, repo: Path) -> None:
    if not source.exists():
        msg = f"Missing source skill directory: {as_repo_path(source, repo)}"
        raise RuntimeError(msg)
    ensure_inside(source, repo)
    ensure_inside(target, repo)
    if target.exists() and source.resolve() == target.resolve():
        msg = (
            "Refusing to sync because source and target resolve to the same path: "
            f"{as_repo_path(source, repo)} -> {as_repo_path(target, repo)}"
        )
        raise RuntimeError(msg)
    if target.exists():
        ensure_inside(target, target.parent)
        shutil.rmtree(target)
    shutil.copytree(source, target)


def sync(source_root: Path, target_roots: tuple[Path, ...], repo: Path) -> None:
    source_skills = skill_dirs(source_root)
    if not source_skills:
        raise RuntimeError(f"No skills found in {as_repo_path(source_root, repo)}")

    for target_root in target_roots:
        ensure_inside(target_root, repo)
        target_root.mkdir(parents=True, exist_ok=True)
        target_skills = skill_dirs(target_root)

        for skill_name in sorted(set(target_skills) - set(source_skills)):
            extra_skill = target_root / skill_name
            ensure_inside(extra_skill, target_root)
            shutil.rmtree(extra_skill)

        for skill_name, source_skill in sorted(source_skills.items()):
            copy_tree(source_skill, target_root / skill_name, repo)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--check", action="store_true", help="fail if generated skill copies drift")
    action.add_argument(
        "--sync",
        action="store_true",
        help="copy canonical skills to generated folders",
    )
    return parser.parse_args()


def write_line(message: str = "") -> None:
    sys.stdout.write(f"{message}\n")


def main() -> int:
    args = parse_args()
    repo = repo_root()
    source_root = repo / "skills"
    target_roots = (repo / ".agents" / "skills", repo / ".claude" / "skills")

    if args.sync:
        sync(source_root, target_roots, repo)

    problems = check(source_root, target_roots, repo)
    if problems:
        write_line("Agent skill sync drift detected:")
        for problem in problems:
            write_line(f"  {problem}")
        write_line("Run: python scripts/sync_agent_skills.py --sync")
        return 1

    write_line("Agent skills are in sync.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
