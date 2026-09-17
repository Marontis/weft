#!/usr/bin/env python3
"""Render the mutation scoreboard for a PR, as GitHub-flavored markdown.

Reads attest-record.json (written by `attest check --record`) and prints a
per-claim table: status, mutant count, survivors, score. Reporting-only —
this script always exits 0; publishing an honest number is its whole job.
"""
import json
from pathlib import Path

MAX_LISTED = 25  # survivors shown per claim before folding to a count


def main() -> int:
    rec_path = Path("attest-record.json")
    if not rec_path.exists():
        print("### Mutation scoreboard\n\n_No attest-record.json was produced — the sweep did not run._")
        return 0
    try:
        record = json.loads(rec_path.read_text(encoding="utf-8"))
    except Exception as e:  # malformed record: say so, never crash the job
        print(f"### Mutation scoreboard\n\n_attest-record.json unreadable: {e}_")
        return 0

    mutation = record.get("mutation") or {}
    if not mutation:
        print("### Mutation scoreboard\n\n_The record carries no mutation verdicts._")
        return 0

    accepted = {}
    try:
        claims_doc = json.loads(Path("claims.json").read_text(encoding="utf-8"))
        for c in claims_doc.get("claims", []):
            accepted[c.get("id")] = len(c.get("acceptedSurvivors") or [])
    except Exception:
        pass

    print("### Mutation scoreboard")
    print()
    print(f"Recorded {record.get('recordedAt', 'at an unrecorded time')} by `attest check --record`. "
          "Reporting-only: survivors are published here, not merge-blocking; `suite` is the required gate.")
    print()
    print("| Claim | Status | Mutants | Survived | Score | Accepted equivalents |")
    print("|---|---|---:|---:|---:|---:|")
    details = []
    for cid in sorted(mutation):
        v = mutation[cid] or {}
        status = v.get("status", "?")
        mutants = v.get("mutants")
        survivors = v.get("survivors") or []
        n_surv = len(survivors)
        if isinstance(mutants, int) and mutants > 0:
            score = f"{100.0 * (mutants - n_surv) / mutants:.1f}%"
        else:
            score = "—"
        mut_s = str(mutants) if isinstance(mutants, int) else "—"
        print(f"| {cid} | {status} | {mut_s} | {n_surv} | {score} | {accepted.get(cid, 0)} |")
        if survivors:
            shown = survivors[:MAX_LISTED]
            body = "\n".join(f"- `{s}`" for s in shown)
            if len(survivors) > len(shown):
                body += f"\n- … and {len(survivors) - len(shown)} more (full list in the attest-record artifact)"
            details.append((cid, n_surv, body))
        detail = v.get("detail")
        if detail:
            details.append((cid, 0, f"_{detail}_"))

    for cid, n, body in details:
        print()
        title = f"{cid}: {n} surviving mutant(s)" if n else f"{cid}: detail"
        print(f"<details><summary>{title}</summary>\n\n{body}\n\n</details>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
