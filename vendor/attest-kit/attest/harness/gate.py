"""Verification gate implementation for the agent verification harness.

Implements:
- Tier 1: Task Verification Gate (fast inner loop: boundary check + shadow execution + atomic promotion/rollback)
- Tier 2: Batch Attestation Gate (outer loop: attest scan + attest check + attest report)
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from attest.harness.instincts import Instinct, record_instinct
from attest.harness.runner import build_diagnostic_report, execute_command
from attest.harness.shadow import ShadowWorkspace
from attest.harness.spec import (
    ChangesetBundle,
    DiagnosticReport,
    TaskManifest,
    TaskSpec,
    TaskStatus,
    resolve_dependency_digest,
)


def check_for_assertion_weakening(repo_root: Path, bundle: ChangesetBundle) -> Optional[str]:
    """Audit proposed modifications to test files against assertion weakening (arXiv:2609.00069)."""
    for action in bundle.actions:
        norm_path = action.path.replace("\\", "/")
        if not (norm_path.startswith("tests/") or norm_path.endswith("_test.py") or "/test_" in norm_path):
            continue

        orig_file = repo_root / norm_path
        if not orig_file.exists():
            continue  # authoring a brand new test file is completely permitted

        orig_content = orig_file.read_text(encoding="utf-8", errors="ignore")
        new_content = action.content or ""

        # Count assertions
        orig_asserts = len(re.findall(r"^\s*assert\b", orig_content, re.MULTILINE))
        new_asserts = len(re.findall(r"^\s*assert\b", new_content, re.MULTILINE))

        if new_asserts < orig_asserts:
            return (
                f"Assertion weakening detected in '{action.path}': original test had {orig_asserts} "
                f"assertions, but proposed modification only has {new_asserts}. "
                f"Test assertions cannot be deleted or weakened during implementation."
            )

        if "assert True" in new_content and "assert True" not in orig_content:
            return (
                f"Assertion neutralizing detected in '{action.path}': introduced 'assert True' "
                f"which bypasses verification."
            )

    return None


def detect_loop_oscillation(past_bundles: List[ChangesetBundle], current_bundle: ChangesetBundle) -> Optional[str]:
    """Detect if the current bundle repeats an earlier failed attempt or oscillates."""
    if not past_bundles:
        return None

    prev = past_bundles[-1]
    if len(prev.actions) == len(current_bundle.actions):
        match_count = 0
        for a1, a2 in zip(prev.actions, current_bundle.actions):
            if a1.path == a2.path and a1.operation == a2.operation and a1.content == a2.content:
                match_count += 1
        if match_count == len(prev.actions):
            return "Oscillation detected: current changeset bundle is identical to previous failed attempt without changes."

    return None


class VerificationGate:
    """Coordinates Tier 1 task verification and Tier 2 batch attestation."""

    def __init__(self, repo_root: Path, shadow_manager: Optional[ShadowWorkspace] = None) -> None:
        self.repo_root = repo_root.resolve()
        self.shadow_manager = shadow_manager or ShadowWorkspace(self.repo_root)
        self._history: Dict[str, List[ChangesetBundle]] = {}

    def _write_handoff(
        self,
        task: TaskSpec,
        bundle: ChangesetBundle,
        passed: bool,
        diag: Optional[DiagnosticReport],
    ) -> Path:
        """Record operational handoff state in .attest/handoffs/."""
        handoff_dir = self.repo_root / ".attest" / "handoffs"
        handoff_dir.mkdir(parents=True, exist_ok=True)
        now_iso = datetime.now(timezone.utc).isoformat()
        record = {
            "task_id": task.task_id,
            "attempt": task.current_attempt,
            "timestamp": now_iso,
            "outcome": "PASS" if passed else "FAIL",
            "diagnostic_summary": diag.message if diag else None,
            "files_touched": [a.path for a in bundle.actions],
        }
        fname = f"{task.task_id}_attempt-{task.current_attempt}.json"
        out_file = handoff_dir / fname
        out_file.write_text(json.dumps(record, indent=2), encoding="utf-8")
        return out_file

    def _finish_evaluation(
        self,
        task: TaskSpec,
        bundle: ChangesetBundle,
        passed: bool,
        diag: Optional[DiagnosticReport],
    ) -> Tuple[bool, Optional[DiagnosticReport]]:
        """Record handoffs and invariant instincts before concluding evaluation."""
        self._write_handoff(task, bundle, passed, diag)

        if not passed and diag and diag.failure_type in ("HARNESS_TAMPERING_DETECTED", "TEST_FAILURE", "MUTANT_SURVIVOR"):
            now_iso = datetime.now(timezone.utc).isoformat()
            if diag.counterexample_witnesses:
                for witness in diag.counterexample_witnesses[:2]:
                    record_instinct(
                        self.repo_root,
                        Instinct(
                            id=f"{task.task_id}-{witness.kind.lower()}-{witness.line_number or 'unknown'}",
                            trigger=f"when modifying {witness.target_file}",
                            action=f"Avoid: {witness.message}",
                            confidence=0.6,
                            evidence=f"{witness.kind} at {witness.target_file}:{witness.line_number} ({task.task_id})",
                            task_id=task.task_id,
                            scope_patterns=[witness.target_file],
                            created_at=now_iso,
                        ),
                    )
            else:
                record_instinct(
                    self.repo_root,
                    Instinct(
                        id=f"{task.task_id}-{diag.failure_type.lower()}-{task.current_attempt}",
                        trigger=f"when executing task {task.task_id}",
                        action=f"Avoid failure: {diag.message[:120]}",
                        confidence=0.5,
                        evidence=f"{diag.failure_type}: {diag.message[:200]}",
                        task_id=task.task_id,
                        scope_patterns=list(task.allowed_writes),
                        created_at=now_iso,
                    ),
                )

        return passed, diag

    def evaluate_task_proposal(
        self, task: TaskSpec, bundle: ChangesetBundle
    ) -> Tuple[bool, Optional[DiagnosticReport]]:
        """Execute the Tier 1 Verification Gate on a proposed ChangesetBundle.

        Returns:
            (True, None) if verification command succeeded and changes were promoted.
            (False, DiagnosticReport) if verification or boundary check failed.
        """
        task.status = TaskStatus.EVALUATING

        # 1. PlanFence: Dependency Lineage Validation (arXiv:2609.03340)
        if task.dependency_fingerprints:
            stale_deps = []
            for dep_key, expected_hash in task.dependency_fingerprints.items():
                current_hash = resolve_dependency_digest(self.repo_root, dep_key)
                if current_hash != expected_hash:
                    stale_deps.append((dep_key, expected_hash, current_hash))
            if stale_deps:
                task.status = TaskStatus.IN_PROGRESS
                stale_summary = "; ".join(
                    f"{k} (expected {exp[:8]}, current {cur[:8] if cur else 'not found'})"
                    for k, exp, cur in stale_deps
                )
                diag = DiagnosticReport(
                    exit_code=1,
                    failure_type="STALE_PLAN_VIOLATION",
                    message=f"PlanFence: Action dependencies are stale or mutated: {stale_summary}. Task replan required.",
                    sanitized_traceback=f"Stale dependencies: {stale_deps}",
                )
                task.last_failure = diag
                return self._finish_evaluation(task, bundle, False, diag)

        # 2. Harness Tampering Audit: Assertion Weakening Check (arXiv:2609.00069)
        tamper_msg = check_for_assertion_weakening(self.repo_root, bundle)
        if tamper_msg:
            task.current_attempt += 1
            diag = DiagnosticReport(
                exit_code=1,
                failure_type="HARNESS_TAMPERING_DETECTED",
                message=tamper_msg,
                sanitized_traceback=tamper_msg,
            )
            task.last_failure = diag
            if task.current_attempt >= task.max_retries:
                task.status = TaskStatus.FAILED
            else:
                task.status = TaskStatus.IN_PROGRESS
            return self._finish_evaluation(task, bundle, False, diag)

        # Check for loop oscillation against previous attempts
        past_attempts = self._history.get(task.task_id, [])
        oscillation_msg = detect_loop_oscillation(past_attempts, bundle)
        self._history.setdefault(task.task_id, []).append(bundle)

        # 3. Create isolated shadow staging environment
        shadow_path = self.shadow_manager.create_shadow(task.task_id)

        try:
            # 4. Path boundary check and tentative application
            diag = self.shadow_manager.validate_and_apply(
                shadow_path, bundle, task.allowed_writes
            )
            if diag is not None:
                task.current_attempt += 1
                task.last_failure = diag
                if task.current_attempt >= task.max_retries:
                    task.status = TaskStatus.FAILED
                else:
                    task.status = TaskStatus.IN_PROGRESS
                return self._finish_evaluation(task, bundle, False, diag)

            # 5. Execute deterministic verification command in shadow directory
            exec_res = execute_command(
                task.verification_cmd,
                cwd=shadow_path,
                timeout_seconds=task.timeout_seconds,
            )

            # 6. Handle gate outcome
            if exec_res.exit_code == 0:
                # PASS: Promote changes to main workspace
                commit_msg = f"feat({task.task_id}): {bundle.rationale}"
                self.shadow_manager.promote_to_main(bundle, commit_message=commit_msg)

                task.status = TaskStatus.COMPLETED
                task.last_failure = None
                return self._finish_evaluation(task, bundle, True, None)
            else:
                # FAIL: Extract diagnostics and roll back
                diag = build_diagnostic_report(exec_res)
                if oscillation_msg:
                    diag.message = f"{diag.message} [{oscillation_msg}]"
                task.current_attempt += 1
                task.last_failure = diag
                if task.current_attempt >= task.max_retries:
                    task.status = TaskStatus.FAILED
                else:
                    task.status = TaskStatus.IN_PROGRESS
                return self._finish_evaluation(task, bundle, False, diag)

        finally:
            # Atomic cleanup: shadow workspace is always purged
            self.shadow_manager.cleanup(shadow_path)

    def evaluate_batch_attestation(
        self, manifest: TaskManifest, skip_mutation: bool = False
    ) -> Tuple[bool, List[str]]:
        """Execute the Tier 2 Batch Attestation Gate.

        Checks:
        1. All tasks in manifest must be COMPLETED.
        2. attest scan must exit 0 (zero drift between claims.json and code).
        3. attest check must exit 0 (unless skip_mutation=True, e.g. on Windows without WSL).
        4. attest report --update must exit 0.
        """
        errors: List[str] = []

        # 1. Verify all tasks are completed
        incomplete = [t.task_id for t in manifest.tasks if t.status != TaskStatus.COMPLETED]
        if incomplete:
            errors.append(
                f"Cannot run batch attestation: tasks {incomplete} are not COMPLETED."
            )
            return False, errors

        # 2. Run attest scan
        scan_res = execute_command("attest scan", cwd=self.repo_root)
        if scan_res.exit_code != 0:
            errors.append(
                f"attest scan failed with exit code {scan_res.exit_code}: {scan_res.stderr or scan_res.stdout}"
            )
            return False, errors

        # 3. Run attest check if requested
        if not skip_mutation:
            check_res = execute_command("attest check", cwd=self.repo_root)
            # Exit code 3 is environment limitation (e.g. Windows native without WSL)
            if check_res.exit_code not in (0, 3):
                errors.append(
                    f"attest check failed with exit code {check_res.exit_code}: {check_res.stderr or check_res.stdout}"
                )
                return False, errors

        # 4. Update golden evidence report
        rep_res = execute_command("attest report --update", cwd=self.repo_root)
        if rep_res.exit_code != 0:
            errors.append(
                f"attest report --update failed with exit code {rep_res.exit_code}: {rep_res.stderr or rep_res.stdout}"
            )
            return False, errors

        manifest.status = TaskStatus.COMPLETED
        return True, []
