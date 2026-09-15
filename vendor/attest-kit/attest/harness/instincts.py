"""Attestation Learning Ledger: Invariant Instincts.

Captures failure catches and counterexamples into persistent, queryable learnings
stored in `.attest/instincts.json`.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel, Field

from attest.harness.spec import is_path_matching


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Instinct(BaseModel):
    """A persistent heuristic learned from a verification failure or counterexample."""

    id: str = Field(..., description="Unique slug for the instinct")
    trigger: str = Field(..., description="Condition or context where instinct applies")
    action: str = Field(..., description="Actionable guideline or anti-pattern to avoid")
    confidence: float = Field(default=0.5, ge=0.0, le=1.0, description="Confidence score")
    evidence: str = Field(..., description="Source observation or failing test reference")
    task_id: Optional[str] = Field(None, description="Originating task identifier")
    scope_patterns: List[str] = Field(
        default_factory=list, description="Target file paths or globs this instinct applies to"
    )
    created_at: str = Field(default_factory=_now, description="ISO timestamp")
    hit_count: int = Field(default=1, ge=1, description="Number of times observed")


def instincts_path(repo_root: Path) -> Path:
    return repo_root / ".attest" / "instincts.json"


def load_instincts(repo_root: Path) -> List[Instinct]:
    """Load all instincts from .attest/instincts.json."""
    p = instincts_path(repo_root)
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return [Instinct.model_validate(item) for item in data]
        return []
    except Exception:
        return []


def save_instincts(repo_root: Path, instincts: List[Instinct]) -> None:
    """Save instincts list to .attest/instincts.json."""
    p = instincts_path(repo_root)
    p.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps([inst.model_dump() for inst in instincts], indent=2)
    p.write_text(raw, encoding="utf-8")


def record_instinct(repo_root: Path, instinct: Instinct) -> Instinct:
    """Record an instinct in .attest/instincts.json, deduplicating and boosting on repeats."""
    existing = load_instincts(repo_root)

    # Check for match by ID or (trigger + action)
    matched = None
    for item in existing:
        if item.id == instinct.id or (item.trigger == instinct.trigger and item.action == instinct.action):
            matched = item
            break

    if matched:
        matched.hit_count += 1
        matched.confidence = min(1.0, round(matched.confidence + 0.1, 2))
        matched.evidence = instinct.evidence
        if instinct.task_id:
            matched.task_id = instinct.task_id
        combined_scopes = set(matched.scope_patterns + instinct.scope_patterns)
        matched.scope_patterns = sorted(list(combined_scopes))
        result = matched
    else:
        existing.append(instinct)
        result = instinct

    save_instincts(repo_root, existing)
    return result


def query_relevant_instincts(
    repo_root: Path,
    scope_patterns: List[str],
    max_results: int = 3,
) -> List[Instinct]:
    """Query top N relevant instincts matching scope patterns, ranked by (confidence * hit_count)."""
    all_instincts = load_instincts(repo_root)
    if not all_instincts:
        return []

    scored: List[tuple[float, Instinct]] = []
    for inst in all_instincts:
        score = inst.confidence * inst.hit_count
        if not scope_patterns:
            scored.append((score, inst))
            continue

        # Check for path overlap
        matches = False
        for s in scope_patterns:
            if is_path_matching(s, inst.scope_patterns):
                matches = True
                break
        if not matches:
            for ip in inst.scope_patterns:
                if is_path_matching(ip, scope_patterns):
                    matches = True
                    break

        if matches:
            scored.append((score, inst))

    # Sort descending by score
    scored.sort(key=lambda x: x[0], reverse=True)
    return [inst for _, inst in scored[:max_results]]
