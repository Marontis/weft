"""Command runner and diagnostic output extractor for the agent verification harness.

Executes verification commands (pytest, linters, etc.) in a sandboxed directory,
enforces timeouts, captures exit codes, and sanitizes failure logs into structured
DiagnosticReport objects.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from typing import List, Optional, Tuple
from pydantic import BaseModel, Field

from attest.harness.spec import CounterexampleWitness, DiagnosticReport


class ExecutionResult(BaseModel):
    """Raw process execution result."""

    exit_code: int
    stdout: str
    stderr: str
    timed_out: bool = False
    duration_seconds: float = 0.0


def extract_failing_tests(output: str) -> List[str]:
    """Extract failing test identifiers from pytest or standard test output."""
    failing: List[str] = []
    # Pytest format: "FAILED tests/test_foo.py::test_bar - AssertionError..."
    # or "FAIL: test_bar (test_foo.TestCase)"
    for line in output.splitlines():
        line_clean = line.strip()
        if line_clean.startswith("FAILED "):
            parts = line_clean.split(None, 2)
            if len(parts) >= 2:
                failing.append(parts[1])
        elif line_clean.startswith("FAIL: "):
            parts = line_clean.split(None, 2)
            if len(parts) >= 2:
                failing.append(parts[1])
    return failing


def extract_linter_errors(output: str) -> List[str]:
    """Extract line-level linter errors (ruff, flake8, mypy, eslint)."""
    errors: List[str] = []
    # Match pattern: path/to/file.py:line:col: E123 or error: message
    linter_re = re.compile(r"^(.+?:\d+:\d+:?\s+.+)$", re.MULTILINE)
    for match in linter_re.finditer(output):
        errors.append(match.group(1).strip())
    return errors[:20]  # cap at 20 errors to prevent context bloat


def sanitize_traceback(raw_text: str, max_lines: int = 25) -> str:
    """Isolate and sanitize the most relevant failure traceback or error summary."""
    lines = raw_text.splitlines()
    if not lines:
        return ""

    # Look for traceback indicator
    tb_start = -1
    for i, line in enumerate(lines):
        if "Traceback (most recent call last):" in line or line.startswith("FAILED "):
            tb_start = i
            break

    if tb_start != -1:
        extracted = lines[tb_start : tb_start + max_lines]
    else:
        # If no explicit traceback header, take the tail of the output
        extracted = lines[-max_lines:]

    # Remove full path prefix clutter e.g. C:\Users\...\site-packages
    clean_lines = []
    for l in extracted:
        # Strip excessively long paths while keeping filename and line number
        l_sub = re.sub(r'File ".*[\\/]([^\\/]+\.py)", line (\d+)', r'File "\1", line \2', l)
        clean_lines.append(l_sub)

    return "\n".join(clean_lines)


def classify_failure(exit_code: int, stdout: str, stderr: str, timed_out: bool) -> Tuple[str, str]:
    """Classify failure type and construct a concise message."""
    if timed_out:
        return "TIMEOUT", "Command execution timed out."

    combined = f"{stdout}\n{stderr}"
    if "SyntaxError" in combined or "IndentationError" in combined:
        return "SYNTAX_ERROR", "Code contains a syntax or indentation error."
    if "AssertionError" in combined or "FAILED " in combined:
        return "TEST_FAILURE", "One or more test assertions failed."
    if "error:" in combined.lower() and ("mypy" in combined.lower() or "type" in combined.lower()):
        return "TYPE_ERROR", "Type verification error detected."
    if re.search(r":\d+:\d+:", combined):
        return "LINTER_FAILURE", "Linter or style check reported errors."

    return "VERIFICATION_FAILURE", f"Verification command failed with exit code {exit_code}."


def execute_command(
    cmd: str, cwd: Path, timeout_seconds: int = 120, env: Optional[dict] = None
) -> ExecutionResult:
    """Execute a verification command in the given working directory with a timeout."""
    import time

    start_time = time.time()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            env=env,
        )
        duration = time.time() - start_time
        return ExecutionResult(
            exit_code=proc.returncode,
            stdout=proc.stdout or "",
            stderr=proc.stderr or "",
            timed_out=False,
            duration_seconds=duration,
        )
    except subprocess.TimeoutExpired as e:
        duration = time.time() - start_time
        stdout = e.stdout.decode("utf-8", errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
        stderr = e.stderr.decode("utf-8", errors="replace") if isinstance(e.stderr, bytes) else (e.stderr or "")
        return ExecutionResult(
            exit_code=124,
            stdout=stdout,
            stderr=stderr,
            timed_out=True,
            duration_seconds=duration,
        )
    except Exception as e:
        duration = time.time() - start_time
        return ExecutionResult(
            exit_code=1,
            stdout="",
            stderr=str(e),
            timed_out=False,
            duration_seconds=duration,
        )


def extract_counterexample_witnesses(output: str) -> List[CounterexampleWitness]:
    """Extract structured counterexample instances (assertion failures, mutant survivals) for A-CEGIS repair."""
    witnesses: List[CounterexampleWitness] = []
    lines = output.splitlines()
    curr_file = "unknown"
    curr_line: Optional[int] = None

    for line in lines:
        line_s = line.strip()

        # Track file and line from pytest traceback headers
        file_match = re.search(r'([a-zA-Z0-9_\-./\\]+\.py):(\d+):', line_s)
        if file_match:
            curr_file = file_match.group(1).replace("\\", "/")
            curr_line = int(file_match.group(2))
        else:
            file_match2 = re.search(r'File "([^"]+\.py)", line (\d+)', line_s)
            if file_match2:
                curr_file = file_match2.group(1).replace("\\", "/")
                curr_line = int(file_match2.group(2))

        # Pytest assertion patterns:
        # E       assert X == Y
        # E       AssertionError: assert X == Y
        assert_match = re.match(r"^E\s+(?:AssertionError:\s+)?assert\s+(.+?)\s+==\s+(.+)$", line_s)
        if assert_match:
            actual_val = assert_match.group(1).strip()
            expected_val = assert_match.group(2).strip()
            witnesses.append(
                CounterexampleWitness(
                    kind="ASSERTION_FAILURE",
                    target_file=curr_file,
                    line_number=curr_line,
                    actual=actual_val,
                    expected=expected_val,
                    message=f"Assertion failed: expected {expected_val}, but observed {actual_val}",
                )
            )
            continue

        # General AssertionError without ==
        if line_s.startswith("E       AssertionError:"):
            msg = line_s[len("E       AssertionError:"):].strip()
            witnesses.append(
                CounterexampleWitness(
                    kind="ASSERTION_FAILURE",
                    target_file=curr_file,
                    line_number=curr_line,
                    message=msg or "AssertionError raised",
                )
            )
            continue

        # Mutation testing survivor pattern:
        # e.g. "Survivor: src/auth.py:42" or "mutant survived in src/auth.py:42"
        mutant_match = re.search(r'(?:survivor:?|mutant survived in)\s+([a-zA-Z0-9_\-./\\]+\.py):(\d+)', line_s, re.IGNORECASE)
        if mutant_match:
            m_file = mutant_match.group(1).replace("\\", "/")
            m_line = int(mutant_match.group(2))
            witnesses.append(
                CounterexampleWitness(
                    kind="MUTANT_SURVIVOR",
                    target_file=m_file,
                    line_number=m_line,
                    message=f"Mutant survived in {m_file}:{m_line}. Test suite is vacuous for this mutation.",
                )
            )

    return witnesses[:5]


def build_diagnostic_report(res: ExecutionResult) -> DiagnosticReport:
    """Build a structured DiagnosticReport from an ExecutionResult."""
    combined = f"{res.stdout}\n{res.stderr}".strip()
    fail_type, msg = classify_failure(res.exit_code, res.stdout, res.stderr, res.timed_out)
    tb = sanitize_traceback(combined)
    failing_tests = extract_failing_tests(combined)
    linter_errs = extract_linter_errors(combined)
    witnesses = extract_counterexample_witnesses(combined)

    return DiagnosticReport(
        exit_code=res.exit_code,
        failure_type=fail_type,
        message=msg,
        sanitized_traceback=tb,
        failing_tests=failing_tests,
        linter_errors=linter_errs,
        counterexample_witnesses=witnesses,
    )
