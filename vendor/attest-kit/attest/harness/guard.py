"""PreToolUse Shell Guard for preventing destructive commands and harness bypasses.

Can be run as a Claude Code hook:
    python -m attest.harness.guard
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

from attest.config import repo_root

DESTRUCTIVE_PATTERNS = [
    (r"\brm\s+-(?:r[a-zA-Z]*f|f[a-zA-Z]*r)\s+.*(?:/|~|\.|\*)", "Destructive recursive delete (rm -rf)"),
    (r"\bgit\s+reset\s+--hard\b", "Destructive git reset (--hard)"),
    (r"\bgit\s+push\s+.*(?:\s--force|-f\b)", "Forced git push"),
    (r"\bgit\s+checkout\s+--\s+\.", "Destructive git checkout of all files"),
    (r"\bgit\s+clean\s+-[a-zA-Z]*f", "Destructive git clean (-f)"),
    (r"\bchmod\s+-R\s+777\b", "Insecure global permission change (chmod -R 777)"),
]

PROTECTED_PATHS = [".attest", ".git", "attest/harness", "attest\\harness"]

WRITE_OPERATIONS = [
    r"(?:>|>>)\s*(?P<target>[^\s;&|]+)",
    r"\b(?:mv|cp|rm|tee|truncate)\b(?:\s+-[a-zA-Z]+)*\s+.*?(?P<target>(?:\.attest|\.git|attest[/\\]harness)[^\s;&|]*)",
]


def is_attest_governed(cwd: Path | None = None) -> bool:
    try:
        repo_root(cwd)
        return True
    except FileNotFoundError:
        return False


def evaluate_command(command: str, cwd: Path | None = None) -> tuple[bool, str]:
    """Evaluates whether a command is permitted.

    Returns:
        (True, "") if allowed.
        (False, reason) if blocked.
    """
    stripped = command.strip()
    if not stripped:
        return True, ""

    # 1. Check destructive command blocklist
    for pattern, desc in DESTRUCTIVE_PATTERNS:
        if re.search(pattern, stripped, re.IGNORECASE):
            return False, f"BLOCKED: {desc} is prohibited. Use governed verification tools."

    # 2. Check protected path write operations
    for op_pattern in WRITE_OPERATIONS:
        match = re.search(op_pattern, stripped, re.IGNORECASE)
        if match:
            target = match.group("target") if "target" in match.groupdict() else ""
            for p in PROTECTED_PATHS:
                if p in target or p in stripped:
                    return (
                        False,
                        f"BLOCKED: Direct write or modification to protected path '{p}' is prohibited.",
                    )

    # 3. Check attest bypass in governed projects
    if is_attest_governed(cwd):
        if re.search(r"\bgit\s+(?:commit|add)\b", stripped):
            return (
                False,
                "BLOCKED: Direct git commit/add detected in attest-governed project. "
                "Use `propose_changeset` MCP tool or `attest harness run-task`.",
            )

    return True, ""


def main() -> int:
    parser = argparse.ArgumentParser(description="PreToolUse Shell Guard for attest-kit")
    parser.add_argument("--command", "-c", type=str, default=None, help="Command to evaluate")
    args, unknown = parser.parse_known_args()

    command = args.command
    if not command and unknown:
        command = " ".join(unknown)

    if not command:
        raw_env = os.environ.get("CLAUDE_TOOL_INPUT", "")
        if raw_env:
            try:
                data = json.loads(raw_env)
                if isinstance(data, dict):
                    command = data.get("command", "")
            except Exception:
                command = ""

    if not command:
        return 0

    allowed, reason = evaluate_command(command)
    if not allowed:
        sys.stderr.write(f"{reason}\n")
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
