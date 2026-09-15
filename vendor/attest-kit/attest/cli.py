"""attest CLI — the Attestation-Driven Development gate.

Commands:
    init    install the ADD skeleton into a project
    scan    reconcile @attest.claim annotations with claims.json
    check   mutation-verify active claims (mutmut)
    report  print the ephemeral verification state

Exit codes (the agent's done-criterion):
    0  all active claims are load-bearing (or no active claims)
    1  vacuous / broken / missing-target claims found
    2  drift, config, or reconcile errors
    3  environment problem (e.g. mutmut unavailable)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

from attest import claims as specmod
from attest import config as cfgmod
from attest import mutator, reporter, scanner, state

TEMPLATES = Path(__file__).resolve().parent.parent / "templates"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _out(obj: dict, code: int) -> int:
    print(json.dumps(obj, indent=2))
    return code


def _reconcile(spec: dict, found: list[dict]) -> tuple[dict, list[str]]:
    """Reconcile annotations with claims.json.

    `derived` maps claim ID -> list of annotation dicts.  A claim may be
    discharged by multiple tests — collecting all of them rather than keeping
    only the last prevents a silent data-loss bug where only one annotated
    test was verified.
    """
    derived: dict[str, list[dict]] = {}
    errors = []
    spec_ids = {c["id"] for c in spec.get("claims", [])}
    for f in found:
        if not f["id"]:
            errors.append(f"{f['file']}:{f['line']} annotation has no id")
            continue
        if f["id"] not in spec_ids:
            errors.append(
                f"annotation {f['id']} at {f['file']}:{f['line']} is not registered in claims.json"
            )
        if f.get("test") is None:
            errors.append(
                f"annotation {f['id']} at {f['file']}:{f['line']} binds to no test "
                "(nothing that looks like a test declaration follows it)"
            )
        if f.get("malformed"):
            errors.append(
                f"annotation {f['id']} at {f['file']}:{f['line']} carries "
                f"unrecognized text {f['malformed']!r} — one id per annotation "
                "line; key=value for anything else"
            )
        derived.setdefault(f["id"], []).append(f)
    for c in spec.get("claims", []):
        # Only a claim discharged BY a test needs an annotation: basis
        # "test" (mutation-scored) and basis "behavioral" (its test must
        # pass, but mutation is the wrong verification mode -- concurrency
        # properties, absent-by-design configuration). A claim whose basis
        # is construction, live, or operational is discharged by design, by
        # a run against real infrastructure, or by a runbook — demanding an
        # annotation there refuses the whole spec of any project honest
        # enough to name its non-test bases (found by the first polyglot
        # adoption, attorn R.18: 6 of its 76 claims carry such a basis). A
        # supporting annotation on one is still welcome.
        if (
            c.get("status") == "active"
            and c.get("basis", "test") in ("test", "behavioral")
            and c["id"] not in derived
        ):
            errors.append(f"claim {c['id']} is active but has no annotated test")
        # The WHY is part of a behavioral claim: without a recorded
        # rationale the basis is a cheap exit from an unwelcome mutation
        # verdict rather than an honest judgment about the property.
        if (
            c.get("status") == "active"
            and c.get("basis") == "behavioral"
            and not c.get("rationale")
        ):
            errors.append(
                f"claim {c['id']} has basis behavioral but no rationale; record "
                "WHY mutation does not apply or change the basis"
            )
        if "mutates" in c:
            errors.append(
                f"claim {c['id']} declares mutates= in claims.json; it belongs "
                "on the annotation, which is the only copy read"
            )
    return derived, errors


def _summary(spec: dict, st: dict) -> None:
    claims = spec.get("claims", [])
    active = [c for c in claims if c.get("status") == "active"]
    m = st["mutation"]
    st["summary"] = {
        "total": len(claims),
        "pending": sum(1 for c in claims if c.get("status") == "pending"),
        "active": len(active),
        "verified": sum(
            1 for c in active if m.get(c["id"], {}).get("status") == "verified"
        ),
        "vacuous": sum(
            1 for c in active if m.get(c["id"], {}).get("status") == "vacuous"
        ),
        # Discharged by a passing bound test, mutation not applicable: a
        # fourth honest state, counted apart so it can be neither mistaken
        # for mutation-verified nor buried among the failures.
        "behavioral": sum(
            1 for c in active if m.get(c["id"], {}).get("status") == "behavioral"
        ),
        "broken": sum(
            1
            for c in active
            if m.get(c["id"], {}).get("status")
            in ("broken", "missing_target", "no_mutants", "error", "skipped")
        ),
        # Bound to a test, but no mutation engine can judge it here (today:
        # TypeScript). Not a pass and not a failure -- a named gap, counted so
        # it cannot be mistaken for verification.
        "unsupported": sum(
            1 for c in active if m.get(c["id"], {}).get("status") == "unsupported"
        ),
    }


def _discover() -> Path:
    try:
        return cfgmod.repo_root()
    except FileNotFoundError as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        raise SystemExit(2)


def _interpolate(content: str, project: str, prefix: str) -> str:
    """Replace template placeholders with actual project values."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return (
        content
        .replace("{{PROJECT}}", project)
        .replace("{{PREFIX}}", prefix)
        .replace("{{DATE}}", today)
    )


def cmd_init(root: Path, force: bool, agentic: bool = False, stack: str = "python") -> int:
    T = TEMPLATES
    writes, skips = [], []
    project = root.name
    prefix = "SEC"

    def w(rel: str, content: str | None = None, src: Path | None = None) -> None:
        dest = root / rel
        if dest.exists() and not force:
            skips.append(rel)
            return
        if src is not None:
            content = src.read_text(encoding="utf-8")
        if content is not None:
            content = _interpolate(content, project, prefix)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content or "", encoding="utf-8")
        writes.append(rel)

    # Read default verification_cmd from stack template if available
    stack_dir = T / "stacks" / stack
    stack_cmd = None
    if (stack_dir / "verification_cmd.txt").exists():
        stack_cmd = (stack_dir / "verification_cmd.txt").read_text(encoding="utf-8").strip()

    # An existing config wins. `init` is documented as safe to re-run on a
    # project already in flight, and a project that moved its task board is
    # exactly the one that would re-run it -- writing the artifacts back to the
    # default paths would leave two boards, one of them stale.
    cfg_data = {**cfgmod.DEFAULT, "project": root.name, "stack": stack}
    if stack_cmd:
        cfg_data["defaultVerificationCmd"] = stack_cmd

    if (root / "attestkit.json").exists() and not force:
        cfg_data = {**cfg_data, **cfgmod.load_config(root)}
    # Interpolation follows the honoured config for the same reason the
    # paths do: a re-run on a project that chose its own prefix must not
    # stamp the default one into fresh templates.
    project = cfg_data["project"] or root.name
    prefix = cfg_data["prefix"]
    w("attestkit.json", json.dumps(cfg_data, indent=2) + "\n")
    w("claims.json", json.dumps({"schemaVersion": 1, "claims": []}, indent=2) + "\n")
    w("AGENTS.md", src=T / "AGENTS.md")

    # Stack-aware test scaffold stamping
    if stack == "python":
        w("tests/conftest.py", src=T / "stacks/python/conftest.py" if (T / "stacks/python/conftest.py").exists() else T / "tests_conftest.py")
        w("tests/test_attest.py", src=T / "stacks/python/test_attest.py" if (T / "stacks/python/test_attest.py").exists() else T / "harness_python/test_attest.py")
    elif stack == "typescript":
        w("tests/attest.test.ts", src=T / "stacks/typescript/test_attest.ts")
    elif stack == "go":
        w("attest_test.go", src=T / "stacks/go/attest_test.go")
    elif stack == "generic":
        pass

    w(".agents/skills/attest/SKILL.md", src=T / "skills/attest/SKILL.md")
    w(
        ".agents/skills/attest-architect/SKILL.md",
        src=T / "skills/attest-architect/SKILL.md",
    )

    # Governance artifacts (task board, ADRs, review rules, runbooks).
    #
    # Written at the paths the config names, not at hardcoded ones. These three
    # keys used to be written into attestkit.json, defaulted in config.py, and
    # asserted in the tests -- and read by nothing: setting `taskBoardPath` to
    # anything else changed where the file went not at all. Config that looks
    # like a control and is not is worse than no config, because a test pinning
    # its *value* rather than its *effect* reads as coverage.
    docs_root = PurePosixPath(cfg_data["reportPath"]).parent.parent
    adr_dir = str(docs_root / "adr")
    runbook_dir = str(docs_root / "runbooks")
    rules = cfg_data["reviewRulesDir"].rstrip("/")

    w(cfg_data.get("intentDocPath", "docs/INTENT.md"), src=T / "docs/INTENT.md")
    w(cfg_data["claimsDocPath"], src=T / "docs/CLAIMS.md")
    w(cfg_data["taskBoardPath"], src=T / "docs/task-board.md")
    w(f"{adr_dir}/0000-adr-template.md", src=T / "docs/adr/0000-adr-template.md")
    w(
        f"{adr_dir}/0001-adopt-attestation-driven-development.md",
        src=T / "docs/adr/0001-adopt-attestation-driven-development.md",
    )
    w(
        f"{runbook_dir}/0000-runbook-template.md",
        src=T / "docs/runbooks/0000-runbook-template.md",
    )
    w(f"{rules}/INDEX.md", src=T / "review-rules/INDEX.md")
    w(f"{rules}/0000-rule-template.md", src=T / "review-rules/0000-rule-template.md")
    w(f"{rules}/review-log.tsv", src=T / "review-rules/review-log.tsv")

    if agentic:
        w("tasks/manifest.json", src=T / "tasks/manifest.json")
        w("tasks/0000-task-template.json", src=T / "tasks/0000-task-template.json")
        w(".agents/skills/orchestrator/SKILL.md", src=T / "skills/orchestrator/SKILL.md")
        w(".agents/skills/worker-coder/SKILL.md", src=T / "skills/worker-coder/SKILL.md")
        w(".claude/hooks.json", src=T / "hooks/claude_hooks.json")

    gi = root / ".gitignore"
    if not gi.exists():
        gi.touch()
        writes.append(".gitignore")
    text = gi.read_text(encoding="utf-8")
    add = [l for l in (".attest/", ".mutmut-cache", ".pytest_cache/") if l not in text]
    if add:
        sep = "" if not text or text.endswith("\n") else "\n"
        gi.write_text(text + sep + "\n".join(add) + "\n", encoding="utf-8")
        writes.append(".gitignore (+entries)")

    print(json.dumps({"ok": True, "wrote": writes, "skipped": skips}, indent=2))
    return 0


def _next_id(spec: dict, prefix: str) -> str:
    """Auto-increment: highest existing numeric suffix + 1."""
    import re as _re
    max_n = 0
    pattern = _re.compile(rf"^{_re.escape(prefix)}-(\d+)$")
    for c in spec.get("claims", []):
        m = pattern.match(c.get("id", ""))
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"{prefix}-{max_n + 1:02d}"


def cmd_add_claim(
    root: Path,
    claim_id: str | None,
    description: str,
    basis: str,
    status: str,
    blocking: str | None,
    rationale: str | None = None,
) -> int:
    """Register a new claim in claims.json."""
    cfg = cfgmod.load_config(root)
    spec = specmod.load_spec(root, cfg["claimsPath"])
    prefix = cfg.get("prefix", "SEC")

    if claim_id is None:
        claim_id = _next_id(spec, prefix)

    existing_ids = {c["id"] for c in spec.get("claims", [])}
    if claim_id in existing_ids:
        return _out({"ok": False, "error": f"claim {claim_id} already exists"}, 2)

    if basis not in ("test", "behavioral", "construction", "live", "operational"):
        return _out({"ok": False, "error": f"invalid basis '{basis}'; must be test|behavioral|construction|live|operational"}, 2)
    if status not in ("active", "pending"):
        return _out({"ok": False, "error": f"invalid status '{status}'; must be active|pending"}, 2)
    # Refused at registration, not first check: the rationale is the guard
    # that keeps `behavioral` an honest judgment about the property rather
    # than an exit from an unwelcome mutation verdict.
    if basis == "behavioral" and not rationale:
        return _out(
            {"ok": False, "error": "basis behavioral requires --rationale: record WHY mutation does not apply"},
            2,
        )

    claim: dict = {
        "id": claim_id,
        "description": description,
        "basis": basis,
        "status": status,
    }
    if blocking:
        claim["blocking"] = blocking
    if rationale:
        claim["rationale"] = rationale

    spec.setdefault("claims", []).append(claim)
    specmod.save_spec(root, cfg["claimsPath"], spec)
    return _out({"ok": True, "added": claim}, 0)


def _scan_governed(root: Path, cfg: dict) -> tuple[list[dict], list[str]]:
    """scanner.scan scoped to the config's scanRoot. A bad scanRoot comes
    back as an error result rather than a traceback, so CI reads it the same
    way it reads any other gate failure."""
    try:
        return scanner.scan(root, cfg.get("scanRoot", ".")), []
    except ValueError as e:
        return [], [str(e)]


def cmd_scan(root: Path) -> int:
    cfg = cfgmod.load_config(root)
    spec = specmod.load_spec(root, cfg["claimsPath"])
    found, cfg_errors = _scan_governed(root, cfg)
    derived, errors = _reconcile(spec, found)
    errors = cfg_errors + errors
    st = state.load_state(root, cfg["statePath"])
    st["derived"] = derived
    st["generatedAt"] = _now()
    _summary(spec, st)
    state.save_state(root, cfg["statePath"], st)
    if errors:
        return _out({"ok": False, "errors": errors}, 2)
    return _out(
        {"ok": True, "claims": {k: [a["test"] for a in v] for k, v in derived.items()}},
        0,
    )


_WINDOWS_HELP = (
    "mutation checking cannot run natively on Windows: mutmut (Python) needs "
    "os.fork() and the Unix-only `resource` module, and gremlins (Go) does not "
    "support Windows either. Stryker (TypeScript) may work via npx but is not "
    "yet supported natively on Windows in this tool. Run `attest check` inside "
    "WSL or in CI — see docs/windows-wsl.md. `attest scan` and `attest report` "
    "work natively and are unaffected."
)


_JS_TEST_SUFFIXES = (
    ".test.mjs", ".test.js", ".test.cjs", ".test.ts",
    ".spec.mjs", ".spec.js", ".spec.cjs", ".spec.ts",
)


def _scoped_test_command(annotations: list[dict]) -> str | None:
    """The command-runner test invocation scoped to the JS/TS files that bind
    THIS claim. Other test files never import the target, so they cannot kill
    its mutants — scoping is a strict speedup. None when the claim has no JS/TS
    bindings (Go/Python engines select their own tests and ignore this)."""
    files = sorted({a["file"] for a in annotations
                    if a.get("file", "").endswith(_JS_TEST_SUFFIXES)})
    if not files:
        return None
    return "node --test " + " ".join(files)


def cmd_check(root: Path, record: bool = False,
              only_claims: set[str] | None = None) -> int:
    # Fail here with an explanation rather than letting mutmut's own bare exit
    # surface as a per-claim "error" status. Without this the report says every
    # claim failed verification, which reads as "your tests are vacuous" — the
    # opposite of the truth, and the most alarming way to say "wrong OS".
    if sys.platform == "win32":
        return _out({"ok": False, "error": _WINDOWS_HELP}, 3)

    cfg = cfgmod.load_config(root)
    spec = specmod.load_spec(root, cfg["claimsPath"])
    found, cfg_errors = _scan_governed(root, cfg)
    derived, errors = _reconcile(spec, found)
    errors = cfg_errors + errors
    st = state.load_state(root, cfg["statePath"])
    st["derived"] = derived
    if errors:
        st["generatedAt"] = _now()
        state.save_state(root, cfg["statePath"], st)
        return _out({"ok": False, "errors": errors}, 2)

    # --claim narrows the (slow) mutation run to named claims and CARRIES the
    # rest forward from the committed record, so re-checking one module after
    # an edit costs one module's mutants, not the whole tree. The verdict for a
    # carried claim is exactly what was last recorded — unchanged files, so the
    # last measurement still holds; its files being unchanged is the operator's
    # responsibility, the same contract as the record's date-stamped staleness.
    prior = {}
    if only_claims:
        rec = _load_record(root, cfg)
        prior = (rec or {}).get("mutation", {}) if rec else {}

    results = {}
    concurrency = mutator.default_concurrency()
    # One engine-output cache per run: claims cluster in packages, and a
    # minutes-long gremlins run must not repeat per claim for identical data.
    cache: dict = {}
    run_started = time.monotonic()
    for c in spec.get("claims", []):
        if c.get("status") != "active":
            continue
        annotations = derived.get(c["id"])
        if annotations is None:
            continue
        if only_claims is not None and c["id"] not in only_claims:
            # Carry the last recorded verdict forward unchanged.
            if c["id"] in prior:
                results[c["id"]] = prior[c["id"]]
            continue
        test_command = _scoped_test_command(annotations)
        # Verify every annotated binding for this claim. A claim discharged
        # by multiple tests requires all of them to pass mutation testing.
        claim_verdicts = []
        claim_started = time.monotonic()
        for d in annotations:
            try:
                claim_verdicts.append(
                    mutator.verify_claim(
                        root, c, d, cache,
                        go_module_root=cfg.get("goModuleRoot", "."),
                        concurrency=concurrency,
                        test_command=test_command,
                    )
                )
            except (mutator.EngineUnavailable, FileNotFoundError) as e:
                return _out({"ok": False, "error": f"mutation engine unavailable: {e}"}, 3)
        # The claim verdict is the worst of its bindings: if any is vacuous
        # or broken, the claim is not fully discharged. `unstamped` sits
        # between the judged pass and the true failures: it is a named gap,
        # and one unstamped binding leaves the CLAIM unjudged even when a
        # sibling binding verified.
        _STATUS_RANK = {
            "verified": 0, "behavioral": 0, "unsupported": 1, "unstamped": 2,
            "survivors": 3, "no_mutants": 4, "error": 5, "missing_target": 6,
            "broken": 7, "skipped": 8, "vacuous": 9,
        }
        worst = max(claim_verdicts, key=lambda v: _STATUS_RANK.get(v["status"], 99))
        # Wall-clock per claim, measured here around the real engine calls
        # rather than reported by them. A verdict that took no time is the
        # tell for a run that executed nothing (a mutation-tested claim
        # costs at least one pytest process per live mutant), and carrying
        # the duration makes that legible in the committed record.
        worst["durationSeconds"] = round(time.monotonic() - claim_started, 3)
        results[c["id"]] = worst

    st["mutation"] = results
    st["generatedAt"] = _now()
    _summary(spec, st)
    state.save_state(root, cfg["statePath"], st)
    wrote = None
    if record:
        # The COMMITTED half: verdicts with their run date. The report
        # renders from this file, never from the ephemeral state, so a
        # repo's committed report is deterministic in CI (which cannot
        # re-run the mutations) and its staleness is visible by date
        # rather than implied fresh.
        doc = {
            "schemaVersion": 1,
            "recordedAt": _now(),
            "durationSeconds": round(time.monotonic() - run_started, 3),
            "summary": st["summary"],
            "mutation": results,
        }
        (root / cfg["recordPath"]).write_text(
            json.dumps(doc, indent=2) + "\n", encoding="utf-8"
        )
        wrote = cfg["recordPath"]
    failures = {
        k: v
        for k, v in results.items()
        if v["status"]
        in ("vacuous", "broken", "missing_target", "no_mutants", "error", "skipped")
    }
    extra = {"record": wrote} if wrote else {}
    if failures:
        return _out({"ok": False, "summary": st["summary"], "failures": failures, **extra}, 1)
    return _out({"ok": True, "summary": st["summary"], **extra}, 0)


def _load_record(root: Path, cfg: dict) -> dict | None:
    """The committed verdict record, or None when no run has been recorded.

    An EXISTING record that cannot be parsed refuses loudly: a corrupt
    committed record rendered around would silently demote every verdict
    to "not run" — evidence disappearing without a diff saying so.
    """
    p = root / cfg["recordPath"]
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except ValueError as e:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": f"{cfg['recordPath']} is unreadable ({e}); fix or delete the committed record — it must not be rendered around",
                }
            )
        )
        raise SystemExit(2)


def cmd_report(root: Path, update: bool) -> int:
    cfg = cfgmod.load_config(root)
    st = state.load_state(root, cfg["statePath"])
    record = _load_record(root, cfg)
    if not update:
        return _out({"ok": True, "recorded": bool(record), **st}, 0)

    spec = specmod.load_spec(root, cfg["claimsPath"])
    # A fresh scan, never yesterday's state: the derived half must describe
    # THIS tree or the golden is evidence of a tree nobody has.
    found, cfg_errors = _scan_governed(root, cfg)
    derived, errors = _reconcile(spec, found)
    if cfg_errors or errors:
        return _out({"ok": False, "errors": cfg_errors + errors}, 2)
    st["derived"] = derived
    want = reporter.render(spec, st, record)
    dest = root / cfg["reportPath"]
    # Golden, not advisory. Without --update this compares and refuses, so CI
    # fails on a stale report the same way it fails on a vacuous test: the
    # report is evidence, and evidence that does not match the run is worse
    # than none, because it still reads as evidence.
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(want, encoding="utf-8")
    return _out({"ok": True, "wrote": cfg["reportPath"]}, 0)


def cmd_verify_report(root: Path) -> int:
    # Deterministic in CI by construction: the derived half comes from a
    # fresh scan of the tree, the verdict half from the COMMITTED record —
    # never from ephemeral state a different machine happened to hold.
    cfg = cfgmod.load_config(root)
    spec = specmod.load_spec(root, cfg["claimsPath"])
    st = state.load_state(root, cfg["statePath"])
    record = _load_record(root, cfg)
    found, cfg_errors = _scan_governed(root, cfg)
    derived, errors = _reconcile(spec, found)
    if cfg_errors or errors:
        return _out({"ok": False, "errors": cfg_errors + errors}, 2)
    st["derived"] = derived
    dest = root / cfg["reportPath"]
    want = reporter.render(spec, st, record)
    have = dest.read_text(encoding="utf-8") if dest.exists() else ""
    # splitlines() rather than a string compare: the repo is edited on
    # Windows and CI runs on Linux, and a golden check that fails on a
    # carriage return is a permanent red for one of them and a mystery for
    # both. Comparing lines normalises the ending without an escape in it.
    if have.splitlines() != want.splitlines():
        return _out(
            {
                "ok": False,
                "error": f"{cfg['reportPath']} is stale; run `attest report --update`",
            },
            2,
        )
    return _out({"ok": True, "report": cfg["reportPath"]}, 0)


def cmd_harness_serve(
    root: Path,
    manifest: str | None = None,
    transport: str = "stdio",
    port: int = 8000,
) -> int:
    from attest.harness.mcp_server import create_harness_mcp_server

    m_path = Path(manifest).resolve() if manifest else None
    try:
        server = create_harness_mcp_server(root, manifest_path=m_path)
    except ImportError as e:
        # Exit 3 like any other missing-engine problem: the environment is
        # incomplete, the config is not wrong.
        return _out({"ok": False, "error": str(e)}, 3)
    if transport == "stdio":
        server.run(transport="stdio")
    elif transport == "sse":
        server.run(transport="sse", port=port)
    return 0


def cmd_harness_run_task(
    root: Path,
    task_id: str,
    bundle_path: str,
    manifest: str | None = None,
) -> int:
    from attest.harness.gate import VerificationGate
    from attest.harness.mcp_server import load_task_manifest
    from attest.harness.spec import ChangesetBundle

    m_path = Path(manifest).resolve() if manifest else None
    manifest_obj = load_task_manifest(root, manifest_path=m_path)
    task = manifest_obj.get_task(task_id)
    if not task:
        return _out({"ok": False, "error": f"Task '{task_id}' not found."}, 1)

    raw_bundle = json.loads(Path(bundle_path).read_text(encoding="utf-8"))
    bundle = ChangesetBundle.model_validate(raw_bundle)

    gate = VerificationGate(root)
    passed, diag = gate.evaluate_task_proposal(task, bundle)

    # Save manifest state
    if m_path and m_path.exists():
        m_path.write_text(json.dumps(manifest_obj.model_dump(), indent=2), encoding="utf-8")

    if passed:
        return _out({"ok": True, "task_id": task_id, "status": "COMPLETED"}, 0)
    else:
        return _out(
            {
                "ok": False,
                "task_id": task_id,
                "status": task.status.value,
                "diagnostic": diag.model_dump() if diag else None,
            },
            1,
        )


def cmd_harness_batch_gate(
    root: Path,
    manifest: str | None = None,
    skip_mutation: bool = False,
) -> int:
    from attest.harness.gate import VerificationGate
    from attest.harness.mcp_server import load_task_manifest

    m_path = Path(manifest).resolve() if manifest else None
    manifest_obj = load_task_manifest(root, manifest_path=m_path)

    gate = VerificationGate(root)
    passed, errors = gate.evaluate_batch_attestation(manifest_obj, skip_mutation=skip_mutation)
    if passed:
        return _out({"ok": True, "epic_id": manifest_obj.epic_id, "status": "COMPLETED"}, 0)
    else:
        return _out({"ok": False, "epic_id": manifest_obj.epic_id, "errors": errors}, 1)


def cmd_plan(root: Path, view: bool, manifest: str | None, output: str | None) -> int:
    from attest.harness.mcp_server import load_task_manifest
    from attest.plan import generate_plan_html

    m_path = Path(manifest).resolve() if manifest else None
    manifest_obj = load_task_manifest(root, manifest_path=m_path)

    if view:
        out_path = Path(output).resolve() if output else root / ".attest" / "plan.html"
        generate_plan_html(manifest_obj, out_path)
        return _out({"ok": True, "wrote": str(out_path)}, 0)
    else:
        summary = {
            "epic_id": manifest_obj.epic_id,
            "title": manifest_obj.title,
            "total_tasks": len(manifest_obj.tasks),
            "by_status": {},
        }
        for t in manifest_obj.tasks:
            summary["by_status"][t.status.value] = summary["by_status"].get(t.status.value, 0) + 1
        return _out({"ok": True, **summary}, 0)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="attest", description="Attestation-Driven Development gate"
    )
    ap.add_argument(
        "--root", default=None, help="governed project root (default: walk up from cwd)"
    )
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_init = sub.add_parser("init")
    p_init.add_argument("--force", action="store_true")
    p_init.add_argument(
        "--agentic",
        action="store_true",
        help="scaffold agentic harness artifacts (manifest, task templates, orchestrator and worker skills)",
    )
    p_init.add_argument(
        "--stack",
        default="python",
        choices=["python", "typescript", "go", "generic"],
        help="language stack profile (default: python)",
    )

    p_add = sub.add_parser("add-claim", help="register a new claim in claims.json")
    p_add.add_argument("--id", default=None, help="claim ID (auto-increments from prefix if omitted)")
    p_add.add_argument("--description", "-d", required=True, help="what the claim asserts")
    p_add.add_argument("--basis", default="test", help="test|behavioral|construction|live|operational")
    p_add.add_argument(
        "--rationale",
        default=None,
        help="why mutation does not apply (required for basis behavioral)",
    )
    p_add.add_argument("--status", default="active", help="active|pending")
    p_add.add_argument("--blocking", default=None, help="what blocks this claim (for pending claims)")

    sub.add_parser("scan")
    p_check = sub.add_parser("check")
    p_check.add_argument(
        "--record",
        action="store_true",
        help="write the committed verdict record (recordPath) the report renders from",
    )
    p_check.add_argument(
        "--claim",
        action="append",
        dest="claims",
        metavar="ID",
        help="re-mutate only these claim(s) and carry the rest forward from the "
             "record; repeatable. Turns a one-module edit into a one-module run.",
    )
    p_report = sub.add_parser("report")
    p_report.add_argument(
        "--update", action="store_true", help="regenerate the golden report"
    )
    sub.add_parser("verify-report")

    p_plan = sub.add_parser("plan", help="inspect and visualize the task manifest")
    p_plan.add_argument("--view", action="store_true", help="generate HTML DAG visualization")
    p_plan.add_argument("--manifest", default=None, help="path to task manifest")
    p_plan.add_argument("--output", default=None, help="output HTML path (default: .attest/plan.html)")

    p_harness = sub.add_parser("harness", help="manage the agentic verification & mutation harness")
    harness_sub = p_harness.add_subparsers(dest="harness_cmd", required=True)

    p_serve = harness_sub.add_parser("serve", help="serve the FastMCP mutator server")
    p_serve.add_argument("--manifest", default=None, help="path to task manifest")
    p_serve.add_argument("--transport", default="stdio", choices=["stdio", "sse"], help="MCP transport protocol")
    p_serve.add_argument("--port", type=int, default=8000, help="Port for SSE transport")

    p_run = harness_sub.add_parser("run-task", help="evaluate a task proposal via the mutator gate")
    p_run.add_argument("task_id", help="task ID to evaluate")
    p_run.add_argument("--bundle", required=True, help="path to JSON file containing ChangesetBundle")
    p_run.add_argument("--manifest", default=None, help="path to task manifest")

    p_batch = harness_sub.add_parser("batch-gate", help="evaluate Tier 2 Batch Attestation Gate")
    p_batch.add_argument("--manifest", default=None, help="path to task manifest")
    p_batch.add_argument("--skip-mutation", action="store_true", help="skip mutation testing during batch gate")

    args = ap.parse_args(argv)

    root = Path(args.root).resolve() if args.root else _discover()
    if args.cmd == "init":
        return cmd_init(root, args.force, agentic=args.agentic, stack=args.stack)
    if args.cmd == "add-claim":
        return cmd_add_claim(root, args.id, args.description, args.basis, args.status, args.blocking, args.rationale)
    if args.cmd == "scan":
        return cmd_scan(root)
    if args.cmd == "check":
        only = set(args.claims) if getattr(args, "claims", None) else None
        return cmd_check(root, record=args.record, only_claims=only)
    if args.cmd == "report":
        return cmd_report(root, args.update)
    if args.cmd == "verify-report":
        return cmd_verify_report(root)
    if args.cmd == "plan":
        return cmd_plan(root, view=args.view, manifest=args.manifest, output=args.output)
    if args.cmd == "harness":
        if args.harness_cmd == "serve":
            return cmd_harness_serve(root, manifest=args.manifest, transport=args.transport, port=args.port)
        if args.harness_cmd == "run-task":
            return cmd_harness_run_task(root, args.task_id, args.bundle, manifest=args.manifest)
        if args.harness_cmd == "batch-gate":
            return cmd_harness_batch_gate(root, manifest=args.manifest, skip_mutation=args.skip_mutation)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
