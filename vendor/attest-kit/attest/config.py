"""attestkit.json config and governed-project root discovery."""

from __future__ import annotations

import json
from pathlib import Path

DEFAULT = {
    "project": "",
    "prefix": "SEC",
    "claimsPath": "claims.json",
    "scanRoot": ".",
    "statePath": ".attest/state.json",
    "recordPath": "attest-record.json",
    "goModuleRoot": ".",
    "reportPath": "docs/attestation/coverage.md",
    "claimsDocPath": "docs/CLAIMS.md",
    "taskBoardPath": "docs/task-board.md",
    "intentDocPath": "docs/INTENT.md",
    "reviewRulesDir": ".review-rules",
    "stack": "python",
    "defaultVerificationCmd": "pytest tests/ -x --tb=short",
}


def repo_root(start: Path | None = None) -> Path:
    d = (start or Path.cwd()).resolve()
    for cand in [d, *d.parents]:
        if (cand / "attestkit.json").exists():
            return cand
    raise FileNotFoundError(
        "attestkit.json not found (run from inside a governed project, or pass --root)"
    )


def load_config(root: Path) -> dict:
    try:
        return {
            **DEFAULT,
            **json.loads((root / "attestkit.json").read_text(encoding="utf-8")),
        }
    except (OSError, ValueError):
        return dict(DEFAULT)
