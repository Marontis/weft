"""Transactional shadow staging workspace for the agent verification harness.

Provides isolated staging environments (via git worktree or fallback snapshot),
boundary validation, atomic changeset application, and zero-pollution rollbacks.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import List, Optional

from attest.harness.spec import (
    ChangesetBundle,
    DiagnosticReport,
    FileAction,
    FileOperation,
    is_path_matching,
    resolve_safe_path,
)


class ShadowWorkspace:
    """Manages transactional shadow staging for task verification."""

    def __init__(self, repo_root: Path, shadow_base_dir: Optional[Path] = None) -> None:
        self.repo_root = repo_root.resolve()
        if shadow_base_dir is None:
            self.shadow_base_dir = self.repo_root / ".attest" / "shadow"
        else:
            self.shadow_base_dir = shadow_base_dir.resolve()
        self.shadow_base_dir.mkdir(parents=True, exist_ok=True)

    def is_git_repo(self) -> bool:
        """Check if repo_root is a git repository."""
        return (self.repo_root / ".git").exists()

    def create_shadow(self, task_id: str) -> Path:
        """Create an isolated staging environment for the given task.

        Attempts git worktree first; falls back to directory snapshot.
        """
        clean_task_id = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in task_id)
        shadow_path = self.shadow_base_dir / clean_task_id

        # Clean up any leftover worktree or directory from previous run
        self.cleanup(shadow_path)

        if self.is_git_repo():
            try:
                # Create detached git worktree
                cmd = ["git", "worktree", "add", "--detach", str(shadow_path), "HEAD"]
                res = subprocess.run(
                    cmd,
                    cwd=str(self.repo_root),
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if res.returncode == 0 and shadow_path.exists():
                    self._sync_uncommitted_changes(shadow_path)
                    return shadow_path
            except Exception:
                pass  # fallback to copy below

        # Fallback: copy workspace snapshot
        self._create_snapshot_copy(shadow_path)
        return shadow_path

    def _sync_uncommitted_changes(self, shadow_path: Path) -> None:
        """Sync unstaged / untracked changes from repo_root to shadow_path, excluding metadata."""
        ignore_dirs = {".git", ".attest", ".pytest_cache", ".venv", "venv", "__pycache__", "build", "dist"}
        for root, dirs, files in os.walk(self.repo_root):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            rel_dir = Path(root).relative_to(self.repo_root)
            dest_dir = shadow_path / rel_dir
            dest_dir.mkdir(parents=True, exist_ok=True)
            for file in files:
                src_file = Path(root) / file
                dest_file = dest_dir / file
                # If modified or doesn't exist in worktree
                try:
                    if not dest_file.exists() or src_file.stat().st_mtime > dest_file.stat().st_mtime:
                        shutil.copy2(src_file, dest_file)
                except Exception:
                    pass

    def _create_snapshot_copy(self, shadow_path: Path) -> None:
        """Copy entire repo tree into shadow_path, ignoring VCS and temp artifacts."""
        def ignore_patterns(dirpath: str, filenames: List[str]) -> List[str]:
            ignored = []
            for name in filenames:
                if name in (".git", ".attest", ".pytest_cache", ".venv", "venv", "__pycache__"):
                    ignored.append(name)
            return ignored

        shutil.copytree(self.repo_root, shadow_path, ignore=ignore_patterns, dirs_exist_ok=True)

    def validate_and_apply(
        self, shadow_path: Path, bundle: ChangesetBundle, allowed_writes: List[str]
    ) -> Optional[DiagnosticReport]:
        """Validate paths against allowed_writes and apply mutations atomically.

        Returns None if successful, or DiagnosticReport if boundary/IO error occurs.
        """
        # Phase 1: Strict Boundary Check
        for action in bundle.actions:
            # Traversal check
            try:
                target_file = resolve_safe_path(shadow_path, action.path)
            except ValueError as e:
                return DiagnosticReport(
                    exit_code=1,
                    failure_type="PATH_VIOLATION",
                    message=f"Path traversal check failed: {e}",
                    sanitized_traceback=str(e),
                )

            # Anti-tampering check: protect internal harness infrastructure and execution metadata
            protected_patterns = [".attest/**", "attest/harness/**", ".git/**"]
            if is_path_matching(action.path, protected_patterns):
                return DiagnosticReport(
                    exit_code=1,
                    failure_type="HARNESS_TAMPERING_DETECTED",
                    message=f"Tampering detected: modification to internal harness path '{action.path}' is prohibited.",
                )

            # Whitelist check
            if not is_path_matching(action.path, allowed_writes):
                return DiagnosticReport(
                    exit_code=1,
                    failure_type="PATH_VIOLATION",
                    message=(
                        f"File '{action.path}' is not within permitted allowed_writes: {allowed_writes}"
                    ),
                )

        # Phase 2: Atomic File Application
        try:
            for action in bundle.actions:
                target_file = resolve_safe_path(shadow_path, action.path)
                if action.operation == FileOperation.DELETE:
                    if target_file.exists():
                        target_file.unlink()
                elif action.operation in (FileOperation.CREATE, FileOperation.MODIFY):
                    target_file.parent.mkdir(parents=True, exist_ok=True)
                    target_file.write_text(action.content or "", encoding="utf-8")
        except Exception as e:
            return DiagnosticReport(
                exit_code=1,
                failure_type="IO_ERROR",
                message=f"Failed to apply changeset to shadow workspace: {e}",
                sanitized_traceback=str(e),
            )

        return None

    def promote_to_main(self, bundle: ChangesetBundle, commit_message: str = "") -> bool:
        """Promote a verified changeset bundle to the main repository and commit."""
        # Write files to main repo
        try:
            for action in bundle.actions:
                dest_file = resolve_safe_path(self.repo_root, action.path)
                if action.operation == FileOperation.DELETE:
                    if dest_file.exists():
                        dest_file.unlink()
                elif action.operation in (FileOperation.CREATE, FileOperation.MODIFY):
                    dest_file.parent.mkdir(parents=True, exist_ok=True)
                    dest_file.write_text(action.content or "", encoding="utf-8")
        except Exception:
            return False

        # If git repo, commit the promoted changes
        if self.is_git_repo():
            try:
                paths = [action.path for action in bundle.actions]
                subprocess.run(["git", "add", "--"] + paths, cwd=str(self.repo_root), check=True)
                msg = commit_message or f"feat({bundle.task_id}): {bundle.rationale}"
                subprocess.run(["git", "commit", "-m", msg], cwd=str(self.repo_root), check=True)
            except Exception:
                pass  # Files are still applied even if git commit fails (e.g. no git user configured)

        return True

    def cleanup(self, shadow_path: Path) -> None:
        """Remove a shadow worktree and delete its directory."""
        if not shadow_path.exists():
            return

        if self.is_git_repo():
            try:
                subprocess.run(
                    ["git", "worktree", "remove", "--force", str(shadow_path)],
                    cwd=str(self.repo_root),
                    capture_output=True,
                    text=True,
                    check=False,
                )
            except Exception:
                pass

        try:
            if shadow_path.exists():
                shutil.rmtree(shadow_path, ignore_errors=True)
        except Exception:
            pass
