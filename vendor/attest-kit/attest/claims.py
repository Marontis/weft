"""claims.json — the committed, declarative claim spec (the ledger).

The architect/claims role registers claims here (pending or active). The
builder discharges active claims with annotated tests. The spec is
declarative and slow-changing; it is not a report.
"""

from __future__ import annotations

import json
from pathlib import Path

EMPTY_SPEC = {"schemaVersion": 1, "claims": []}


def load_spec(root: Path, path: str) -> dict:
    p = root / path
    if not p.exists():
        return dict(EMPTY_SPEC)
    return json.loads(p.read_text(encoding="utf-8"))


def save_spec(root: Path, path: str, spec: dict) -> None:
    (root / path).write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
