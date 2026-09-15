"""FastMCP Server for the agent verification harness.

Exposes a sandboxed, tool-constrained interface to worker agents:
- get_task_context: returns sliced task spec, ADR invariants, and prior attempt failure diagnostics
- read_scoped_file: allows reading files strictly matching task.allowed_reads
- propose_changeset: receives multi-file changeset bundles, runs the mutator gate, and returns gate outcomes
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from attest.harness.gate import VerificationGate
from attest.harness.instincts import query_relevant_instincts
from attest.harness.shadow import ShadowWorkspace
from attest.harness.spec import (
    AttemptFeedback,
    ChangesetBundle,
    FileAction,
    TaskManifest,
    TaskSpec,
    is_path_matching,
    resolve_safe_path,
)


def load_task_manifest(repo_root: Path, manifest_path: Optional[Path] = None) -> TaskManifest:
    """Load the task manifest from tasks/manifest.json or custom path."""
    path = manifest_path or (repo_root / "tasks" / "manifest.json")
    if not path.exists():
        # Fallback to default empty manifest
        return TaskManifest(epic_id="DEFAULT", title="Default Epic", tasks=[])
    data = json.loads(path.read_text(encoding="utf-8"))
    return TaskManifest.model_validate(data)


ADR_MAX_CHARS = 2000  # Hard ceiling per ADR invariant
CONTEXT_MAX_CHARS = 12000  # Total task context payload ceiling


def extract_adr_invariants(repo_root: Path, adr_identifiers: List[str]) -> Dict[str, str]:
    """Extract relevant decision and constraint sections from ADR markdown files."""
    adr_dir = repo_root / "docs" / "adr"
    invariants: Dict[str, str] = {}
    if not adr_dir.exists():
        return invariants

    for ident in adr_identifiers:
        # Match identifier like "ADR-0001", "0001", etc.
        num_match = re.search(r"\d+", ident)
        num_str = num_match.group(0) if num_match else ident
        matched_files = list(adr_dir.glob(f"*{num_str}*.md"))
        if not matched_files:
            continue

        adr_file = matched_files[0]
        try:
            content = adr_file.read_text(encoding="utf-8")
            # Extract Title, Decision, and 'Bad, and accepted'
            extracted_parts = []
            title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
            if title_match:
                extracted_parts.append(f"Title: {title_match.group(1).strip()}")

            decision_match = re.search(
                r"##\s+Decision\s*\n(.*?)(?=\n##|\Z)", content, re.DOTALL
            )
            if decision_match:
                extracted_parts.append(
                    f"Decision:\n{decision_match.group(1).strip()}"
                )

            bad_match = re.search(
                r"###\s+Bad, and accepted\s*\n(.*?)(?=\n###|\n##|\Z)",
                content,
                re.DOTALL,
            )
            if bad_match:
                extracted_parts.append(
                    f"Bad, and accepted (Constraints & Deferred Costs):\n{bad_match.group(1).strip()}"
                )

            text = "\n\n".join(extracted_parts) if extracted_parts else content
            if len(text) > ADR_MAX_CHARS:
                text = text[:ADR_MAX_CHARS] + "\n... [truncated to context budget]"
            invariants[ident] = text
        except Exception:
            continue

    return invariants


def create_harness_mcp_server(
    repo_root: Path,
    manifest_path: Optional[Path] = None,
    server_name: str = "attest-harness",
) -> "FastMCP":
    """Construct and configure the FastMCP server instance for the given repository."""
    # Imported here, not at module top: fastmcp is the [harness] extra, and
    # everything else in this module (load_task_manifest above all) must stay
    # importable in a core-only install -- `attest harness run-task` and
    # `batch-gate` need the manifest, not the server.
    try:
        from fastmcp import FastMCP
    except ImportError as e:
        raise ImportError(
            "fastmcp is not installed; `attest harness serve` needs the "
            "harness extra: pip install attest-engine[harness]"
        ) from e
    repo_root = repo_root.resolve()
    mcp = FastMCP(server_name)
    gate = VerificationGate(repo_root)

    @mcp.tool()
    def get_task_context(task_id: str) -> str:
        """Fetch the minimal context slice for a task: spec, ADR constraints, and attempt feedback.

        Args:
            task_id: The identifier of the task (e.g. 'TASK-001')
        """
        manifest = load_task_manifest(repo_root, manifest_path)
        task = manifest.get_task(task_id)
        if not task:
            return json.dumps({"error": f"Task '{task_id}' not found in manifest."})

        adr_slice = extract_adr_invariants(repo_root, task.adr_invariants)
        feedback = AttemptFeedback(
            attempt=task.current_attempt + 1,
            max_attempts=task.max_retries,
            prior_attempt_failure=task.last_failure,
        )

        scope = list(task.allowed_writes) + list(task.claims_discharged)
        relevant_instincts = query_relevant_instincts(repo_root, scope, max_results=3)

        payload = {
            "task": task.model_dump(),
            "adr_invariants": adr_slice,
            "attempt_feedback": feedback.model_dump(),
            "instincts": [i.model_dump() for i in relevant_instincts],
        }

        raw_json = json.dumps(payload, indent=2)
        if len(raw_json) > CONTEXT_MAX_CHARS:
            # Progressively trim: trim ADR invariants first
            if "adr_invariants" in payload:
                for k in payload["adr_invariants"]:
                    if len(payload["adr_invariants"][k]) > 500:
                        payload["adr_invariants"][k] = (
                            payload["adr_invariants"][k][:500] + "\n...[budget trimmed]"
                        )
            raw_json = json.dumps(payload, indent=2)
            # If still over budget, trim traceback in attempt feedback
            if len(raw_json) > CONTEXT_MAX_CHARS and payload.get("attempt_feedback"):
                fb = payload["attempt_feedback"]
                if fb.get("prior_attempt_failure") and fb["prior_attempt_failure"].get("sanitized_traceback"):
                    tb = fb["prior_attempt_failure"]["sanitized_traceback"]
                    if len(tb) > 500:
                        fb["prior_attempt_failure"]["sanitized_traceback"] = (
                            tb[:500] + "\n...[traceback trimmed]"
                        )
                raw_json = json.dumps(payload, indent=2)

        return raw_json

    @mcp.tool()
    def read_scoped_file(task_id: str, file_path: str) -> str:
        """Read a repository file, provided it is within the task's allowed_reads whitelist.

        Args:
            task_id: ID of the active task
            file_path: Repo-relative file path to read
        """
        manifest = load_task_manifest(repo_root, manifest_path)
        task = manifest.get_task(task_id)
        if not task:
            return f"Error: Task '{task_id}' not found in manifest."

        # Boundary check
        if not is_path_matching(file_path, task.allowed_reads):
            return (
                f"Permission Denied: File '{file_path}' is not within task allowed_reads: "
                f"{task.allowed_reads}"
            )

        try:
            safe_target = resolve_safe_path(repo_root, file_path)
            if not safe_target.exists():
                return f"Error: File '{file_path}' does not exist."
            return safe_target.read_text(encoding="utf-8")
        except Exception as e:
            return f"Error reading file '{file_path}': {e}"

    @mcp.tool()
    def propose_changeset(task_id: str, rationale: str, actions: List[Dict[str, Any]]) -> str:
        """Submit a multi-file ChangesetBundle for verification and atomic promotion.

        Args:
            task_id: ID of the task
            rationale: Explanation of the changes
            actions: List of file action dicts, each with 'path', 'operation' ('create'|'modify'|'delete'), and optional 'content'
        """
        manifest = load_task_manifest(repo_root, manifest_path)
        task = manifest.get_task(task_id)
        if not task:
            return json.dumps({"status": "FAIL", "error": f"Task '{task_id}' not found."})

        # Validate bundle structure
        try:
            file_actions = [FileAction.model_validate(a) for a in actions]
            bundle = ChangesetBundle(
                task_id=task_id, rationale=rationale, actions=file_actions
            )
        except Exception as e:
            return json.dumps(
                {
                    "status": "FAIL",
                    "failure_type": "SCHEMA_ERROR",
                    "error": f"Invalid changeset bundle structure: {e}",
                }
            )

        # Execute gate
        passed, diag = gate.evaluate_task_proposal(task, bundle)

        # Persist task update in manifest if path exists
        m_path = manifest_path or (repo_root / "tasks" / "manifest.json")
        if m_path.exists():
            try:
                m_path.write_text(
                    json.dumps(manifest.model_dump(), indent=2), encoding="utf-8"
                )
            except Exception:
                pass

        if passed:
            return json.dumps(
                {
                    "status": "PASS",
                    "message": f"Task '{task_id}' passed verification and was committed.",
                },
                indent=2,
            )
        else:
            return json.dumps(
                {
                    "status": "FAIL",
                    "failure_type": diag.failure_type if diag else "UNKNOWN",
                    "diagnostic_report": diag.model_dump() if diag else None,
                },
                indent=2,
            )

    return mcp
