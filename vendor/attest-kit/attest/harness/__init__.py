"""attest.harness — Model-Agnostic Agent Verification & Mutation Harness.

Provides typed task specifications, FastMCP sandboxing, transactional shadow
worktree staging, and tiered verification (Task Gate + Batch Attestation Gate).
"""

from attest.harness.spec import (
    AttemptFeedback,
    ChangesetBundle,
    DiagnosticReport,
    FileAction,
    FileOperation,
    TaskManifest,
    TaskSpec,
    TaskStatus,
    is_path_matching,
    resolve_safe_path,
)

__all__ = [
    "TaskStatus",
    "FileOperation",
    "FileAction",
    "ChangesetBundle",
    "DiagnosticReport",
    "AttemptFeedback",
    "TaskSpec",
    "TaskManifest",
    "is_path_matching",
    "resolve_safe_path",
]
