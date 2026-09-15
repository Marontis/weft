"""Typed specification models and boundary validators for the agent verification harness.

Implements the contract for:
- TaskSpec and TaskManifest (strict Pydantic schemas)
- ChangesetBundle and FileAction (atomic multi-file edit proposals)
- DiagnosticReport and AttemptFeedback (stateless retry payload)
- Path traversal and boundary sandboxing helpers
"""

from __future__ import annotations

import fnmatch
import hashlib
import json
from enum import Enum
from pathlib import Path, PurePosixPath
from typing import Any, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


class TaskStatus(str, Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    EVALUATING = "EVALUATING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class FileOperation(str, Enum):
    CREATE = "create"
    MODIFY = "modify"
    DELETE = "delete"


class FileAction(BaseModel):
    """An individual file mutation operation within a ChangesetBundle."""

    path: str = Field(..., description="Repo-relative POSIX path (e.g. 'src/auth.py')")
    operation: FileOperation = Field(..., description="Action to perform on file")
    content: Optional[str] = Field(
        None, description="Full file content for create or modify operations"
    )

    @field_validator("path")
    @classmethod
    def validate_path_format(cls, v: str) -> str:
        # Normalize to forward slashes and strip leading/trailing whitespace
        norm = v.strip().replace("\\", "/")
        if not norm:
            raise ValueError("File path cannot be empty")
        if norm.startswith("/"):
            raise ValueError(f"Path must be relative, got absolute path: {v}")
        parts = PurePosixPath(norm).parts
        if ".." in parts:
            raise ValueError(f"Directory traversal detected in path: {v}")
        return norm

    @model_validator(mode="after")
    def validate_content_presence(self) -> FileAction:
        if self.operation in (FileOperation.CREATE, FileOperation.MODIFY):
            if self.content is None:
                raise ValueError(
                    f"Content is required for operation '{self.operation.value}' on {self.path}"
                )
        return self


class ChangesetBundle(BaseModel):
    """Atomic multi-file edit bundle proposed by a worker agent."""

    task_id: str = Field(..., description="ID of the task this bundle addresses")
    rationale: str = Field(
        ..., description="Explanation of why these changes fulfill the task"
    )
    actions: List[FileAction] = Field(
        ..., min_length=1, description="List of file operations to apply atomically"
    )
    lineage_tokens: dict[str, str] = Field(
        default_factory=dict,
        description="Dependency fingerprints echoed by the worker to confirm plan freshness",
    )


class CounterexampleWitness(BaseModel):
    """Structured counterexample witness from an oracle (test or mutation runner) for A-CEGIS repair."""

    kind: str = Field(
        ...,
        description="Category: ASSERTION_FAILURE, MUTANT_SURVIVOR, BOUNDARY_VIOLATION, STALE_PLAN",
    )
    target_file: str = Field(..., description="File where failure or mutation occurred")
    line_number: Optional[int] = Field(None, description="Line number if known")
    expected: Optional[str] = Field(None, description="Expected expression or behavior")
    actual: Optional[str] = Field(None, description="Actual observed expression or behavior")
    mutant_diff: Optional[str] = Field(None, description="Unified diff of surviving mutant if applicable")
    message: Optional[str] = Field(None, description="Summary explanation of the witness")


class DiagnosticReport(BaseModel):
    """Structured diagnostic failure report passed back to the worker for stateless retry."""

    exit_code: int = Field(..., description="Process exit code from verification command")
    failure_type: str = Field(
        ...,
        description="Category: PATH_VIOLATION, SYNTAX_ERROR, TEST_FAILURE, LINTER_FAILURE, TIMEOUT, HARNESS_ERROR, STALE_PLAN_VIOLATION, HARNESS_TAMPERING_DETECTED, OSCILLATION_DETECTED",
    )
    message: str = Field(..., description="High-level human/agent-readable summary of failure")
    sanitized_traceback: Optional[str] = Field(
        None, description="Extracted relevant compiler/test traceback without noisy paths"
    )
    failing_tests: List[str] = Field(
        default_factory=list, description="IDs/names of failing test cases"
    )
    linter_errors: List[str] = Field(
        default_factory=list, description="Extracted linter error diagnostics"
    )
    counterexample_witnesses: List[CounterexampleWitness] = Field(
        default_factory=list,
        description="Structured counterexample instances for A-CEGIS repair",
    )


class AttemptFeedback(BaseModel):
    """Stateless context payload injected into a worker on attempt N+1."""

    attempt: int = Field(..., description="Current attempt index (1-based)")
    max_attempts: int = Field(..., description="Maximum retry budget")
    prior_attempt_failure: Optional[DiagnosticReport] = Field(
        None, description="Diagnostic report from the immediately preceding failure"
    )
    oscillation_warning: Optional[str] = Field(
        None,
        description="Warning if worker's edits reverted or oscillated against prior attempt without progress",
    )


class TaskSpec(BaseModel):
    """Strictly typed specification for an individual agent task."""

    task_id: str = Field(..., description="Unique task identifier, e.g. 'TASK-001'")
    epic_id: Optional[str] = Field(None, description="Parent epic or batch ID")
    adr_invariants: List[str] = Field(
        default_factory=list,
        description="IDs of binding ADR constraints, e.g. ['ADR-001', 'INV-04']",
    )
    dependency_fingerprints: dict[str, str] = Field(
        default_factory=dict,
        description="Cryptographic SHA-256 fingerprints of cited dependencies (ADRs, claims, specs) at plan time for PlanFence lineage validation",
    )

    # Sandbox Boundaries
    allowed_reads: List[str] = Field(
        default_factory=list,
        description="Glob patterns or file paths the worker is permitted to read",
    )
    allowed_writes: List[str] = Field(
        default_factory=list,
        description="Glob patterns or file paths the worker is permitted to mutate",
    )

    # Content & Behavioral Contract
    description: str = Field(..., description="Task goal and functional requirements")
    inputs: dict[str, Any] = Field(
        default_factory=dict,
        description="Signatures, schemas, or contract fixtures provided to the task",
    )
    acceptance_criteria: List[str] = Field(
        default_factory=list, description="Concrete behavioral conditions for completion"
    )
    claims_discharged: List[str] = Field(
        default_factory=list,
        description="Attest claim IDs bound to or discharged by this task",
    )

    # Verification Gate
    verification_cmd: str = Field(
        ...,
        description="Deterministic shell command to verify the task (e.g. 'pytest tests/test_auth.py -k test_admin')",
    )
    timeout_seconds: int = Field(
        default=120, description="Maximum execution duration for verification_cmd"
    )
    max_retries: int = Field(default=3, description="Maximum retry budget for the worker")
    current_attempt: int = Field(default=0, description="Number of attempts executed so far")
    status: TaskStatus = Field(default=TaskStatus.PENDING, description="Current task state")
    last_failure: Optional[DiagnosticReport] = Field(
        None, description="Last diagnostic failure if currently failing"
    )


class TaskManifest(BaseModel):
    """System of record for an epic/batch of tasks."""

    schema_version: int = Field(default=1, description="Schema version")
    epic_id: str = Field(..., description="Unique epic identifier, e.g. 'EPIC-01'")
    title: str = Field(..., description="Human-readable title of the epic")
    description: str = Field(default="", description="High-level description of epic scope")
    tasks: List[TaskSpec] = Field(
        default_factory=list, description="Ordered or dependency-linked task specs"
    )
    status: TaskStatus = Field(default=TaskStatus.PENDING, description="Overall epic status")

    def get_task(self, task_id: str) -> Optional[TaskSpec]:
        for t in self.tasks:
            if t.task_id == task_id:
                return t
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Path & Boundary Security Helpers
# ─────────────────────────────────────────────────────────────────────────────


def is_path_matching(target_path: str, patterns: List[str]) -> bool:
    """Check whether target_path matches any of the glob or exact patterns.

    Matching is done using POSIX-style paths.
    Patterns like 'src/**/*.py' or 'tests/*' or exact paths 'src/auth.py' are supported.
    """
    norm = target_path.strip().replace("\\", "/").lstrip("./")
    for pattern in patterns:
        norm_pat = pattern.strip().replace("\\", "/").lstrip("./")
        if norm == norm_pat:
            return True
        # fnmatch with wildcard support
        if fnmatch.fnmatch(norm, norm_pat):
            return True
        if "/**/" in norm_pat:
            collapsed = norm_pat.replace("/**/", "/")
            if fnmatch.fnmatch(norm, collapsed):
                return True
        # Support directory wildcard 'src/**' matching 'src/a/b/c.py'
        if norm_pat.endswith("/**"):
            prefix = norm_pat[:-3]
            if norm.startswith(prefix + "/") or norm == prefix:
                return True
        # Directory prefix matching: e.g. 'src/' matches 'src/foo.py'
        if norm_pat.endswith("/") and norm.startswith(norm_pat):
            return True
    return False


def resolve_safe_path(base_dir: Path, relative_path: str) -> Path:
    """Resolve a relative path against base_dir ensuring it does not escape base_dir.

    Raises:
        ValueError: if the resolved path escapes base_dir.
    """
    norm = relative_path.strip().replace("\\", "/").lstrip("/")
    resolved_base = base_dir.resolve()
    target = (resolved_base / norm).resolve()

    try:
        target.relative_to(resolved_base)
    except ValueError:
        raise ValueError(
            f"Path traversal detected: '{relative_path}' resolves to '{target}' which is outside base '{resolved_base}'"
        )

    return target


# ─────────────────────────────────────────────────────────────────────────────
# PlanFence Lineage & Dependency Digest Helpers
# ─────────────────────────────────────────────────────────────────────────────


def compute_content_digest(content: str | bytes) -> str:
    """Compute SHA-256 hex digest of string or bytes."""
    if isinstance(content, str):
        data = content.encode("utf-8")
    else:
        data = content
    return hashlib.sha256(data).hexdigest()


def compute_file_digest(file_path: Path) -> str:
    """Compute SHA-256 hex digest of a file's contents."""
    return hashlib.sha256(file_path.read_bytes()).hexdigest()


def resolve_dependency_digest(repo_root: Path, dep_key: str) -> Optional[str]:
    """Resolve a dependency key to its current SHA-256 digest in repo_root.

    Supported dep_key formats:
    - 'adr:0001' or 'adr:ADR-0001': looks in docs/adr/ or templates/docs/adr/
    - 'claim:SEC-01': looks up claim entry in claims.json
    - 'file:path/to/file.py' or 'path/to/file.py': relative file path in repo_root
    """
    clean_key = dep_key.strip()
    if clean_key.startswith("adr:"):
        adr_id = clean_key[4:].strip().lower()
        # Look in docs/adr and templates/docs/adr
        for sub in ("docs/adr", "templates/docs/adr"):
            adr_dir = repo_root / sub
            if adr_dir.exists():
                for f in adr_dir.glob("*.md"):
                    if adr_id in f.name.lower():
                        return compute_file_digest(f)
        return None
    elif clean_key.startswith("claim:"):
        claim_id = clean_key[6:].strip()
        claims_file = repo_root / "claims.json"
        if claims_file.exists():
            try:
                data = json.loads(claims_file.read_text(encoding="utf-8"))
                claims_list = data.get("claims", [])
                for c in claims_list:
                    if c.get("id") == claim_id:
                        canon = json.dumps(c, sort_keys=True)
                        return compute_content_digest(canon)
            except Exception:
                pass
            return compute_file_digest(claims_file)
        return None
    elif clean_key.startswith("file:"):
        rel_path = clean_key[5:].strip()
        target = repo_root / rel_path
        if target.exists() and target.is_file():
            return compute_file_digest(target)
        return None
    else:
        # Treat as relative file path
        target = repo_root / clean_key
        if target.exists() and target.is_file():
            return compute_file_digest(target)
        return None
