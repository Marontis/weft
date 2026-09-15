"""Ephemeral verification state (.attest/state.json — never committed).

Holds the derived half (annotation facts) and the observed half (mutation
verdicts). Recomputed on every run; the resume context on a failing issue is
copied from here by the agent.
"""

from __future__ import annotations

import json
from pathlib import Path


def new_state() -> dict:
    return {
        "schemaVersion": 1,
        "generatedAt": None,
        "derived": {},
        "mutation": {},
        "summary": {
            "total": 0,
            "pending": 0,
            "active": 0,
            "verified": 0,
            "vacuous": 0,
            "broken": 0,
        },
    }


def load_state(root: Path, path: str) -> dict:
    p = root / path
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except ValueError:
            pass
    return new_state()


def save_state(root: Path, path: str, state: dict) -> None:
    p = root / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
