"""Mutation adapters: turn a fault-injection run into a per-claim verdict.

The heavy lifting is delegated to mature engines -- mutmut for Python,
gremlins for Go -- because writing a fault injector is not the interesting
part. What this module owns is the mapping from an engine's output to a
verdict about *one claim*, and the honesty about how strong that verdict is.

The two engines do not offer the same strength, and the difference is not
cosmetic:

    mutmut     can be scoped to a single test, so the verdict is
               "this test killed the mutants in the guarded file"      scope=test
    gremlins   has no test-selection flag at all -- it runs the package
               suite against each mutant -- so the verdict is
               "some test in this package killed them"                 scope=package

A package-scoped pass is genuinely weaker: the annotated test may contribute
nothing while a neighbour does the killing. It is still far stronger than a
prose claim that someone once checked by hand, and it is the ceiling the Go
tooling allows today. Verdicts carry `scope` so a report can say which kind of
assurance it is holding rather than implying they are equal.
"""

from __future__ import annotations

import copy
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath


class EngineUnavailable(Exception):
    """The mutation engine is not installed or cannot run here."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _run(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess:
    # Redirect to temp FILES, not PIPEs. capture_output=True pipes stdout/stderr,
    # and subprocess.run's communicate() then waits for EOF — which never comes
    # while a grandchild still holds the inherited pipe fd open. Stryker's command
    # runner spawns many `node --test` workers that inherit these fds; a
    # timeout-killed worker can leave the write end open, deadlocking the whole
    # call at zero CPU (this was the mutation "stall"). A file has no such EOF
    # gate: run() returns when the direct child exits, regardless of grandchildren.
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8", errors="replace") as out, \
         tempfile.TemporaryFile(mode="w+", encoding="utf-8", errors="replace") as err:
        proc = subprocess.run(cmd, cwd=str(cwd), stdout=out, stderr=err, text=True)
        out.seek(0)
        err.seek(0)
        proc.stdout = out.read()
        proc.stderr = err.read()
    return proc


# --------------------------------------------------------------------------
# Python / mutmut
# --------------------------------------------------------------------------

_SRC_LAYOUT_HINT = (
    "mutmut's src/ convention requires importing guarded modules as top-level "
    "packages (e.g. `from auth import ...`, with src/ on sys.path) rather than "
    "`from src.auth import ...`. Fix the test import."
)


def baseline_pass(root: Path, node_id: str) -> tuple[str, str]:
    """The annotated test must actually RUN and pass unmutated.

    Three outcomes ("passed" / "skipped" / "failed"), not two. pytest exits 0
    for a selection whose only test was SKIPPED (skipif and friends), so exit
    code alone waves a skipped test through baseline -- and a skipped test
    covers nothing, which downstream means mutmut assigns every mutant "no
    tests" without running one. That is the raw material of a false
    `verified`. "passed" therefore requires a passed test in the summary,
    not merely a zero exit.
    """
    r = _run(
        [sys.executable, "-m", "pytest", node_id, "--no-header", "-p", "no:cacheprovider"],
        root,
    )
    output = r.stdout + r.stderr
    if r.returncode != 0:
        return "failed", output[-2000:]
    if re.search(r"\b\d+ passed\b", output) is None:
        return "skipped", output[-2000:]
    return "passed", output[-2000:]


def baseline_pass_node(root: Path, test_file: str, test_name: str) -> tuple[str, str]:
    """node:test flavor of baseline_pass: the bound test must RUN and pass.

    `node --test` emits TAP on a pipe (node 18's only reporter and node 20+'s
    non-TTY default), so the same parse covers every supported runtime. The
    same three outcomes as the pytest path, for the same reason: a file whose
    bound test was skipped still exits 0, and a bound name that never appears
    in the TAP stream means the annotation points at a test that did not run
    -- either way nothing was discharged.
    """
    r = _run(["node", "--test", test_file], root)
    output = r.stdout + r.stderr
    if r.returncode != 0:
        return "failed", output[-2000:]
    pat = re.compile(
        r"^(not\s+)?ok\s+\d+\s+-\s+" + re.escape(test_name) + r"\s*(#.*)?$"
    )
    for line in output.splitlines():
        m = pat.match(line.strip())
        if not m:
            continue
        if m.group(1):
            return "failed", output[-2000:]
        if m.group(2) and "skip" in m.group(2).lower():
            return "skipped", output[-2000:]
        return "passed", output[-2000:]
    return "skipped", (
        f"bound test {test_name!r} not observed in the TAP output of "
        f"`node --test {test_file}`; a test that did not run discharges nothing"
    )


def run_mutmut(root: Path, target: str, node_id: str) -> dict:
    # source_paths names the SUBTREE mutmut copies into its mutants/ sandbox;
    # only_mutate narrows mutation to the guarded file. The distinction is
    # load-bearing: this used to pass the guarded file as source_paths, and
    # mutmut copies ONLY source_paths -- so a file inside a package landed in
    # mutants/ without its __init__.py or siblings. That half-package is a
    # namespace-package portion, and the import system prefers any REGULAR
    # package later on sys.path -- a `pip install -e .` of the project, most
    # of all. The tests then imported the real, unmutated package; mutmut's
    # stats saw no coverage; and no mutant was ever executed. attorn-compute-
    # broker ran that way from its first record: every "verified" was the
    # exit-code bug scoring never-run mutants, and the honest adapter then
    # refused every claim as vacuous -- also wrong, since the tests DO
    # exercise their targets. Copying the whole top-level tree keeps the
    # mutants package regular and first on sys.path, so the mutated module
    # wins the import even against an installed copy.
    top = PurePosixPath(target).parts[0]
    cfg = (
        "[mutmut]\n"
        f"source_paths = {top}\n"
        f"only_mutate = {target}\n"
        f"pytest_add_cli_args_test_selection = {node_id}\n"
    )
    cfg_path = root / "setup.cfg"
    had = cfg_path.exists()
    orig = cfg_path.read_text(encoding="utf-8") if had else None
    cfg_path.write_text(cfg, encoding="utf-8")

    # Deleted BEFORE the run, not only after: mutmut reuses any verdict it
    # finds in mutants/*.meta ("let the result stand"), and mutmut 2 kept a
    # .mutmut-cache. Either surviving from an earlier run means this claim
    # inherits verdicts from a tree nobody is looking at.
    mutants_dir = root / "mutants"
    cache = root / ".mutmut-cache"
    if mutants_dir.exists():
        shutil.rmtree(mutants_dir)
    if cache.exists():
        cache.unlink()

    try:
        r = _run([str(Path(sys.executable).with_name("mutmut")), "run"], root)
        output = r.stdout + r.stderr
        meta_path = root / "mutants" / (target + ".meta")
        exit_codes: dict[str, int] = {}
        if meta_path.exists():
            exit_codes = json.loads(meta_path.read_text(encoding="utf-8")).get(
                "exit_code_by_key", {}
            )
        return {
            "exit_codes": exit_codes,
            "no_test_case": "could not find any test case" in output,
            "src_layout_violation": "Module name starts with `src.`" in output,
            "returncode": r.returncode,
            "stderr_tail": output[-2000:],
        }
    finally:
        if had and orig is not None:
            cfg_path.write_text(orig, encoding="utf-8")
        else:
            cfg_path.unlink(missing_ok=True)
        if mutants_dir.exists():
            shutil.rmtree(mutants_dir)
        if cache.exists():
            cache.unlink()


# mutmut 3 does not record pytest exit codes: `exit_code_by_key` is mutmut's
# own vocabulary (status_by_exit_code in mutmut/__main__.py), and some of its
# values are assigned WITHOUT running any test process. Code 33 is the one
# that mattered: mutmut's coverage stats found no test touching the mutant,
# so it stamped 33 and moved on -- which is EVERY mutant when the annotated
# test is skipped or exercises nothing. The first version of this adapter
# read the codes as booleans (0 survived, anything else killed), so a skipped
# test yielded thousands of instant "kills": attorn-compute-broker recorded
# 3,430 mutants across 15 claims as verified in 29 wall-clock seconds, with
# survivors null everywhere (2026-09-04). Same discipline as the gremlins and
# Stryker adapters: every code classified, unknown refuses.
_MUTMUT_KILLED = {1, 3, 37}  # test failed / pytest internal error / caught by type check
_MUTMUT_SURVIVED = {0}  # the tests passed with the mutant applied
_MUTMUT_NOT_COVERED = {5, 33}  # no test reaches the mutant: the loudest survivor
_MUTMUT_ARTEFACT = {34, 24, 36, 152, 255, -24}  # skipped by pragma / timeouts


def _qual_parts(key: str) -> list[str]:
    """The [Class, method] or [function] path of one mutant key.

    mutmut keys are `{module}.{mangled}__mutmut_{N}` where the mangled name
    is `x_{function}` for a free function and `xǁ{Class}ǁ{method}` for a
    method (mutmut/mutation/trampoline_templates.py). The module prefix is
    dotted; the mangled name never is, so the last dot splits them.
    """
    mangled = key.partition("__mutmut_")[0].rpartition(".")[2]
    if mangled.startswith("xǁ"):
        return mangled.split("ǁ")[1:]
    if mangled.startswith("x_"):
        return [mangled[2:]]
    return [mangled]


def _verify_python(
    root: Path, target: str, derived: dict, qualname: str | None = None
) -> dict:
    node_id = f"{derived['file']}::{derived['test']}"
    baseline_started = time.monotonic()
    baseline, detail = baseline_pass(root, node_id)
    # Carried into the scored verdict so a reader can weigh the claim's
    # wall time against what ONE honest execution of its test costs. Not a
    # refusal threshold: mutmut forks each mutant's run from a warm,
    # already-collected interpreter, so a legitimate kill can cost
    # milliseconds where the cold baseline costs seconds -- any floor tight
    # enough to catch a fraud would also refuse real runs. The record
    # carries the evidence; the judgment stays with the reader.
    baseline_seconds = round(time.monotonic() - baseline_started, 3)
    if baseline == "skipped":
        # Refused BEFORE the engine runs: a skipped test covers no line, so
        # the mutation run would stamp every mutant "no tests" and prove
        # nothing either way. Not `broken` (the test may be healthy on the
        # platform it skips for) and never `verified`.
        return {
            "status": "skipped",
            "scope": "test",
            "lastRun": _now(),
            "detail": (
                f"annotated test {node_id} was SKIPPED, not run; a skipped "
                "test verifies nothing -- un-skip it here, or move the claim "
                "to a basis this environment can discharge"
            ),
        }
    if baseline != "passed":
        return {"status": "broken", "scope": "test", "detail": detail}
    result = run_mutmut(root, target, node_id)

    if result["src_layout_violation"]:
        return {"status": "error", "scope": "test", "lastRun": _now(), "detail": _SRC_LAYOUT_HINT}
    if result["no_test_case"]:
        return {
            "status": "vacuous",
            "scope": "test",
            "lastRun": _now(),
            "survivors": ["test does not exercise the guarded target"],
        }
    exit_codes = result["exit_codes"]
    if not exit_codes:
        status = "error" if result["returncode"] != 0 else "no_mutants"
        return {
            "status": status,
            "scope": "test",
            "lastRun": _now(),
            "detail": result["stderr_tail"] if status == "error" else None,
        }
    if qualname:
        # A function-scoped target: score only the mutants of the named
        # function (or every method of the named class). File-scope
        # zero-survivor is unattainable in principle -- the first honestly
        # scored adoption had a claim whose test covered its ENTIRE guarded
        # file and still left 98 survivors, mostly equivalent mutants of
        # code the claim never asserted anything about (attorn BRK-01). The
        # named lever is the unit the claim indicts, so within it a
        # not-covered mutant still rightly counts as a survivor.
        want = qualname.split(".")
        exit_codes = {
            k: v for k, v in exit_codes.items() if _qual_parts(k)[: len(want)] == want
        }
        if not exit_codes:
            return {
                "status": "no_mutants",
                "scope": "test",
                "lastRun": _now(),
                "detail": (
                    f"mutmut produced no mutants for {qualname} in {target}; "
                    "the annotation names a lever the file does not define -- "
                    "check the spelling against the source"
                ),
            }
    killed, survivors, unknown = [], [], []
    for key, code in exit_codes.items():
        if code in _MUTMUT_KILLED:
            killed.append(key)
        elif code in _MUTMUT_SURVIVED:
            survivors.append(key)
        elif code in _MUTMUT_NOT_COVERED:
            survivors.append(f"{key} (not covered by the annotated test)")
        elif code in _MUTMUT_ARTEFACT:
            continue
        else:
            # 2 (interrupted), None (not checked), segfaults, and anything
            # mutmut has not taught us: the run did not complete, so there
            # is no verdict to score -- refuse rather than guess.
            unknown.append(code)
    if unknown:
        # All-None is its own diagnosis, not a generic refusal: every mutant
        # "not checked" means the run died before mutation testing began --
        # or the tests imported an installed copy of the guarded package
        # instead of the mutants tree, so mutmut never saw a reason to run
        # anything (the failure mode a per-file source_paths used to cause
        # silently; see run_mutmut).
        if all(code is None for code in exit_codes.values()):
            return {
                "status": "error",
                "scope": "test",
                "lastRun": _now(),
                "detail": (
                    f"no mutant of {target} was ever executed (every result is "
                    "'not checked'): the mutation run died before testing began, "
                    "or an installed copy of the guarded package shadowed the "
                    "mutants tree for the test process; refusing to score"
                ),
            }
        return {
            "status": "error",
            "scope": "test",
            "lastRun": _now(),
            "detail": (
                f"mutmut reported unrecognised/incomplete exit code(s) "
                f"{sorted({str(c) for c in unknown})} for {target}; refusing to score"
            ),
        }
    if not killed and not survivors:
        return {
            "status": "no_mutants",
            "scope": "test",
            "lastRun": _now(),
            "detail": f"every mutant in {target} was an engine artefact",
        }
    return {
        "status": "vacuous" if survivors else "verified",
        "scope": "test",
        "lastRun": _now(),
        "mutants": len(killed) + len(survivors),
        "killed": len(killed),
        "survivors": survivors or None,
        "baselineSeconds": baseline_seconds,
    }


# --------------------------------------------------------------------------
# Go / gremlins
# --------------------------------------------------------------------------

# Every status each engine can emit is classified, and the classification is
# exhaustive on purpose.
#
# The first version of both adapters listed only the statuses it cared about
# and let the rest fall through to "not a survivor", i.e. a kill. That is
# unknown -> allow, in a tool whose entire job is to refuse false assurance.
# Two were reachable and both reported `verified` on a claim nobody had
# verified: gremlins RUNNER_ERROR (the test runner itself failed) and Stryker
# Pending (a mutant that never ran, which is what an interrupted run leaves
# behind). An unrecognised status is now an `error` verdict naming it -- not a
# survivor, because "your test is vacuous" would be a false accusation, and not
# a kill, because that is the failure this file exists to prevent.
#
# gremlins' own efficacy is KILLED / (KILLED + LIVED). TIMED_OUT and NOT_VIABLE
# are excluded as engine artefacts rather than test failures, and we follow
# that. NOT_COVERED is counted as a survivor where gremlins does not: a mutant
# no test reaches is the strongest possible evidence that the guarded line is
# unverified, which is exactly what a claim asserts it is not.
# Both spellings of the multi-word statuses, deliberately: gremlins' JSON
# report writes them WITH SPACES ("NOT COVERED"), which the first real
# adopting run proved by refusing to score 100% of its Go claims — the
# underscore forms had been written from belief, and the committed fixture
# happened to contain no multi-word status to falsify them (attorn R.18b,
# 2026-09-01; the refusal was the exhaustive-classification discipline
# working exactly as designed — better a loud error than a misread kill).
# The union is safe BECAUSE classification is exhaustive-else-error: an
# unmatched spelling can only ever refuse, never mis-score.
_KILLED = {"KILLED"}
_SURVIVING = {"LIVED", "NOT COVERED", "NOT_COVERED"}
_ARTEFACT = {"TIMED OUT", "TIMED_OUT", "NOT VIABLE", "NOT_VIABLE", "SKIPPED"}


def _classify(mutations: list, killed: set, surviving: set, artefact: set):
    """Split mutants three ways, or name the status that fits nowhere.

    Returns (counted, survivors, unknown). A non-empty `unknown` means the
    caller must refuse rather than score: the engine emitted something this
    adapter has never been taught, and guessing is how a verification tool
    starts lying.
    """
    counted, survivors, unknown = [], [], []
    for m in mutations:
        st = m.get("status")
        if st in surviving:
            survivors.append(m)
            counted.append(m)
        elif st in killed:
            counted.append(m)
        elif st in artefact:
            continue
        else:
            unknown.append(st)
    return counted, survivors, unknown


def _verify_go(
    root: Path,
    target: str,
    derived: dict,
    cache: dict | None = None,
    package: bool = False,
    go_module_root: str = ".",
) -> dict:
    if shutil.which("gremlins") is None:
        raise EngineUnavailable(
            "gremlins is not on PATH. `go install "
            "github.com/go-gremlins/gremlins/cmd/gremlins@latest`, and on "
            "Windows run the gate under WSL (docs/windows-wsl.md)."
        )
    # Monorepo support: `mutates` targets are governed-root-relative (like
    # every other path in the system), but gremlins must run INSIDE the Go
    # module. `goModuleRoot` names where that is; a target outside it is a
    # config error worth naming, not a silent empty run.
    module_dir = (root / go_module_root).resolve()
    tgt = PurePosixPath(target)
    if go_module_root not in (".", ""):
        try:
            tgt = tgt.relative_to(go_module_root)
        except ValueError:
            return {
                "status": "missing_target",
                "scope": "package",
                "lastRun": _now(),
                "detail": f"{target} is outside goModuleRoot {go_module_root!r}",
            }
    # Scope the run to the package holding the guarded file (or the guarded
    # package itself). For file targets this is what makes the basename match
    # below unambiguous: gremlins reports `file_name` as a bare basename, and
    # Go forbids two files of the same name in one package directory, so
    # within a package-scoped run the basename identifies exactly one file.
    # Scoping to ./... would not have that property.
    pkg = tgt if package else tgt.parent
    pkg_arg = "./" + pkg.as_posix() if pkg.as_posix() not in (".", "") else "./..."

    # One gremlins run per package per check run: claims cluster in
    # packages, and the data is byte-identical for every claim sharing one.
    data = None if cache is None else cache.get(pkg_arg)
    if data is None:
        fd, out_path = tempfile.mkstemp(suffix=".json", prefix="gremlins-")
        os.close(fd)
        try:
            r = _run(
                ["gremlins", "unleash", "--dry-run=false", "-o", out_path, pkg_arg],
                module_dir,
            )
            try:
                data = json.loads(Path(out_path).read_text(encoding="utf-8"))
            except (OSError, ValueError):
                # A failed run is NOT cached: the next claim in this package
                # deserves its own attempt rather than an inherited failure.
                return {
                    "status": "error",
                    "scope": "package",
                    "lastRun": _now(),
                    "detail": (r.stdout + r.stderr)[-2000:],
                }
        finally:
            Path(out_path).unlink(missing_ok=True)
        if cache is not None:
            cache[pkg_arg] = data

    if package:
        return gremlins_package_verdict(data, target)
    return gremlins_verdict(data, target)


def gremlins_verdict(data: dict, target: str) -> dict:
    """Map one gremlins report onto a verdict for the claim guarding `target`.

    Pure, and separate from the subprocess call, so the part that decides can
    be tested against recorded engine output instead of only end to end. The
    fixture it is tested against is a real run, not a hand-written sample --
    a hand-written one would encode what the format is believed to be.
    """
    basename = PurePosixPath(target).name
    entry = next(
        (f for f in data.get("files", []) if f.get("file_name") == basename), None
    )
    if entry is None:
        # The package was mutated but the guarded file produced no mutants:
        # either it holds no mutable statements, or `mutates` names a file that
        # is not in the package that was run. Both are worth refusing -- a claim
        # whose guarded file was never mutated has not been verified.
        return {
            "status": "no_mutants",
            "scope": "package",
            "lastRun": _now(),
            "detail": f"gremlins produced no mutants for {target}",
        }

    mutations = entry.get("mutations", [])
    counted, surviving, unknown = _classify(mutations, _KILLED, _SURVIVING, _ARTEFACT)
    if unknown:
        return {
            "status": "error",
            "scope": "package",
            "lastRun": _now(),
            "detail": f"gremlins reported unrecognised mutant status(es) {sorted(set(unknown))} for {target}; refusing to score",
        }
    survivors = [
        f"{basename}:{m['line']}:{m['column']} {m['type']} ({m['status']})"
        for m in surviving
    ]
    if not counted:
        return {
            "status": "no_mutants",
            "scope": "package",
            "lastRun": _now(),
            "detail": f"every mutant in {target} was an engine artefact",
        }
    return {
        "status": "vacuous" if survivors else "verified",
        "scope": "package",
        "lastRun": _now(),
        "mutants": len(counted),
        "survivors": survivors or None,
    }


def gremlins_package_verdict(data: dict, pkg: str) -> dict:
    """Verdict when the guarded surface is the whole package.

    Same classification discipline as the per-file verdict — every status
    accounted for, unknown refuses — over the union of every file's
    mutants, with survivors carrying their file name since the basename no
    longer identifies the target.
    """
    mutations = []
    by_file: list[tuple[str, dict]] = []
    for f in data.get("files", []):
        for m in f.get("mutations", []):
            by_file.append((f.get("file_name", "?"), m))
            mutations.append(m)
    if not by_file:
        return {
            "status": "no_mutants",
            "scope": "package",
            "lastRun": _now(),
            "detail": f"gremlins produced no mutants for package {pkg}",
        }
    counted, surviving, unknown = _classify(mutations, _KILLED, _SURVIVING, _ARTEFACT)
    if unknown:
        return {
            "status": "error",
            "scope": "package",
            "lastRun": _now(),
            "detail": f"gremlins reported unrecognised mutant status(es) {sorted(set(unknown))} for package {pkg}; refusing to score",
        }
    surviving_ids = {id(m) for m in surviving}
    survivors = [
        f"{name}:{m['line']}:{m['column']} {m['type']} ({m['status']})"
        for name, m in by_file
        if id(m) in surviving_ids
    ]
    if not counted:
        return {
            "status": "no_mutants",
            "scope": "package",
            "lastRun": _now(),
            "detail": f"every mutant in package {pkg} was an engine artefact",
        }
    if survivors:
        # NOT "vacuous". A package-scoped run cannot attribute survivors to
        # the claim's own tests — the same asymmetry the module doc admits
        # for the pass direction holds for the failure direction: `vacuous`
        # is an indictment ("the tests guarding this claim kill nothing"),
        # and this run cannot know that. The first real adoption run proved
        # the stakes: 59 of 73 claims scored VACUOUS because their packages
        # held ANY surviving mutant, mostly in unrelated files (attorn
        # R.18b). Survivors at package scope are an attention list, and the
        # per-claim verdict is earned by narrowing mutates= to the guarded
        # FILE — which the report tells the reader.
        return {
            "status": "survivors",
            "scope": "package",
            "lastRun": _now(),
            "mutants": len(counted),
            "survivors": survivors,
            "detail": (
                f"{len(survivors)} package survivor(s), unattributed — narrow "
                "mutates= to the guarded file for a per-claim verdict"
            ),
        }
    return {
        "status": "verified",
        "scope": "package",
        "lastRun": _now(),
        "mutants": len(counted),
        "survivors": None,
    }


# --------------------------------------------------------------------------
# TypeScript / Stryker
# --------------------------------------------------------------------------

# The eight values of MutantStatus in the mutation-testing-elements report
# schema, all classified. Timeout is a kill here and an artefact in gremlins
# above: each adapter follows its own engine's convention, and the difference
# is deliberate rather than an oversight -- Stryker counts a timed-out mutant
# toward its mutation score, gremlins does not.
#
# Pending is the one that mattered: it means the mutant never ran, so an
# interrupted Stryker run used to report `verified`.
_STRYKER_KILLED = {"Killed", "Timeout"}
_STRYKER_SURVIVING = {"Survived", "NoCoverage"}
_STRYKER_ARTEFACT = {"CompileError", "RuntimeError", "Ignored"}

def default_concurrency() -> int:
    """Stryker workers to run in parallel. The target repo's stryker.conf sets a
    conservative default (often 2); mutation is embarrassingly parallel, so a
    machine with cores to spare should use them. Capped so a many-core box does
    not oversubscribe against the per-worker Node processes. Override with
    ATTEST_STRYKER_CONCURRENCY."""
    env = os.environ.get("ATTEST_STRYKER_CONCURRENCY")
    if env:
        try:
            return max(1, int(env))
        except ValueError:
            pass
    return max(1, min(os.cpu_count() or 2, 12))


def _verify_ts(root: Path, target: str, derived: dict,
               concurrency: int | None = None,
               test_command: str | None = None) -> dict:
    if shutil.which("npx") is None:
        raise EngineUnavailable(
            "npx is not on PATH. Node and Stryker must be installed to mutate TypeScript."
        )

    report_path = root / "reports" / "mutation" / "mutation.json"
    if report_path.exists():
        report_path.unlink()

    conc = int(concurrency or default_concurrency())
    # The config file is Stryker's POSITIONAL argument: `stryker run [configFile]`.
    # `-c` is NOT a config flag — it is short for `--concurrency <n>` (parseInt).
    # An earlier `-c <conf>` therefore set concurrency to parseInt(path) = NaN
    # ("Creating NaN test runner process(es)", zero workers, hang) and never
    # loaded the scoped config at all: Stryker fell back to the repo's own
    # stryker.conf.json, so every mutant ran the FULL suite with no per-mutant
    # timeout. A trailing --concurrency masked the NaN, which is why argument
    # order looked load-bearing. commandRunner.command is config-only, so the
    # scoped test invocation goes through a temp config; a config file REPLACES
    # the repo's stryker.conf, it does not merge, hence the inherit below.
    cmd = ["npx", "stryker", "run"]
    tmp_conf: Path | None = None
    if test_command:
        base: dict = {}
        base_path = root / "stryker.conf.json"
        if base_path.exists():
            try:
                base = json.loads(base_path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                base = {}
        base.setdefault("testRunner", "command")
        base.setdefault("coverageAnalysis", "off")
        # Drop any inherited concurrency: the --concurrency CLI flag is the single
        # source of truth, and a stale base value (e.g. 2) would only muddy it.
        base.pop("concurrency", None)
        # A per-mutant timeout is load-bearing, not a tuning knob: a mutant that
        # turns a bounded loop infinite makes the command runner's `node --test`
        # hang, and with no timeout the WHOLE run blocks on it forever (observed:
        # a 45-minute stall at zero CPU). An explicit bound marks that mutant
        # killed-by-timeout and the run proceeds. Honoured only if the repo's
        # own config hasn't already set one.
        base.setdefault("timeoutMS", 8000)
        base["commandRunner"] = {**base.get("commandRunner", {}), "command": test_command}
        base["reporters"] = ["json"]
        tmp_conf = root / f".attest-stryker-{os.getpid()}.conf.json"
        tmp_conf.write_text(json.dumps(base), encoding="utf-8")
        cmd.append(str(tmp_conf))
    # CLI flags override the config file regardless of position.
    cmd += ["--mutate", target, "--reporters", "json", "--concurrency", str(conc)]
    # Incremental (opt-in): stryker caches per-mutant verdicts keyed on source +
    # test hashes and, on re-run, only re-tests mutants whose covering tests
    # changed. That is exactly the CEGIS shape — source fixed, tests grow each
    # round — so a strengthen round after the first re-tests only the survivors
    # under the new tests instead of the whole file. Opt-in via env because the
    # AUTHORITATIVE gate (CI) must do a full cold run for its ruling; only the
    # fast in-fleet strengthening loop sets it.
    if os.environ.get("ATTEST_STRYKER_INCREMENTAL", "").lower() in ("1", "true", "yes"):
        cmd += ["--incremental"]

    try:
        r = _run(cmd, root)
    finally:
        if tmp_conf is not None and tmp_conf.exists():
            tmp_conf.unlink()

    if not report_path.exists():
        return {
            "status": "error",
            "scope": "file",
            "lastRun": _now(),
            "detail": (r.stdout + r.stderr)[-2000:],
        }
    
    try:
        data = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {
            "status": "error",
            "scope": "file",
            "lastRun": _now(),
            "detail": "Could not parse Stryker JSON report",
        }

    return stryker_verdict(data, target)


def stryker_verdict(data: dict, target: str) -> dict:
    normalized_target = PurePosixPath(target).as_posix()
    
    entry = None
    for k, v in data.get("files", {}).items():
        if PurePosixPath(k).as_posix() == normalized_target:
            entry = v
            break
            
    if entry is None:
        return {
            "status": "no_mutants",
            "scope": "file",
            "lastRun": _now(),
            "detail": f"Stryker produced no mutants for {target}",
        }

    mutations = entry.get("mutants", [])
    counted, surviving, unknown = _classify(
        mutations, _STRYKER_KILLED, _STRYKER_SURVIVING, _STRYKER_ARTEFACT
    )
    if unknown:
        return {
            "status": "error",
            "scope": "file",
            "lastRun": _now(),
            "detail": f"Stryker reported unrecognised mutant status(es) {sorted(set(unknown))} for {target}; refusing to score",
        }
    survivors = [
        f"{target}:{m['location']['start']['line']}:{m['location']['start']['column']} {m['mutatorName']} ({m['status']})"
        for m in surviving
    ]
    if not counted:
        return {
            "status": "no_mutants",
            "scope": "file",
            "lastRun": _now(),
            "detail": f"every mutant in {target} was an engine artefact",
        }
    return {
        "status": "vacuous" if survivors else "verified",
        "scope": "file",
        "lastRun": _now(),
        "mutants": len(counted),
        "survivors": survivors or None,
    }


# --------------------------------------------------------------------------
# Dispatch
# --------------------------------------------------------------------------

# .mjs/.cjs dispatch to the same Stryker adapter as .js: explicit module-
# flavor extensions are node's own ESM convention, and the scanner already
# reads claim markers from *.test.mjs files — leaving them out of dispatch
# stranded bound claims at 'unsupported' (observed live, agent-syndicate
# batch gate, 2026-09-07).
_ENGINES = {
    ".py": _verify_python,
    ".go": _verify_go,
    ".ts": _verify_ts, ".tsx": _verify_ts,
    ".js": _verify_ts, ".jsx": _verify_ts,
    ".mjs": _verify_ts, ".cjs": _verify_ts,
}


def engine_for(target: str):
    """The adapter for a guarded file, chosen by its extension.

    Dispatch is on the *guarded* file rather than on a project-wide `language`
    setting because a polyglot repo is the normal case: a gateway is Go, its
    console is TypeScript, and one claim may be discharged in each.
    """
    return _ENGINES.get(PurePosixPath(target).suffix)


def verify_claim(
    root: Path,
    claim: dict,
    derived: dict,
    cache: dict | None = None,
    go_module_root: str = ".",
    concurrency: int | None = None,
    test_command: str | None = None,
) -> dict:
    """Verdict for one claim. `mutates` comes from the annotation, not the spec.

    One home for one fact. It used to live in both places and only the spec's
    copy was read, so an annotation could name a different file and be silently
    ignored -- a binding that looks checked and is not.

    `cache` (one per check run) memoises gremlins output per package: an
    adopting project's claims cluster (attorn: 73 claims over ~25 Go
    packages), and rerunning a minutes-long package mutation per claim
    multiplies the cost by the cluster size for byte-identical data.

    A missing `mutates` is `unstamped`, not `broken`: nobody has declared
    the guarded surface yet, which is a named gap to burn down. Grading it
    a failure would make incremental stamping impossible -- the first check
    of a part-stamped tree would report everything broken and exit 1.
    """
    # A behavioral claim is discharged BY its bound test but not mutation-
    # scored: some true properties are not indictable by single-process
    # mutation at any scope. The first adoption surfaced two whole classes --
    # concurrency serialization (emergent across threads, proven by threaded
    # integration tests) and microVM isolation ("no NIC" is an ABSENT config
    # line; there is nothing to mutate). Forcing those through the mutation
    # gate leaves only dishonest states: `verified` is unattainable and
    # `pending` understates a property whose test is real and green. The
    # test must still actually PASS and actually RUN -- a red test breaks
    # the claim and a skipped one discharges nothing -- and the spec must
    # say WHY mutation does not apply (reconcile enforces a rationale), so
    # the basis cannot become the cheap exit from an unwelcome verdict.
    if claim.get("basis") == "behavioral":
        if derived.get("test") is None:
            return {
                "status": "broken",
                "detail": f"annotation at {derived['file']}:{derived['line']} binds to no test",
            }
        if derived.get("mutates"):
            return {
                "status": "error",
                "detail": (
                    f"behavioral claim {claim.get('id')} carries mutates= on its "
                    "annotation; a target that is never mutated reads as guarded "
                    "and is not -- drop the stamp or change the basis"
                ),
            }
        if derived["file"].endswith(".py"):
            node_id = f"{derived['file']}::{derived['test']}"
            baseline, detail = baseline_pass(root, node_id)
        elif re.search(r"\.(test|spec)\.(js|mjs|cjs)$", derived["file"]):
            node_id = f"{derived['file']} :: {derived['test']}"
            baseline, detail = baseline_pass_node(root, derived["file"], derived["test"])
        else:
            return {
                "status": "unsupported",
                "detail": (
                    "the behavioral baseline runs via pytest or node --test; "
                    "only Python- and JS-bound tests are judged today"
                ),
            }
        if baseline == "skipped":
            return {
                "status": "skipped",
                "scope": "test",
                "lastRun": _now(),
                "detail": (
                    f"annotated test {node_id} was SKIPPED, not run; a skipped "
                    "test discharges nothing -- on this platform the claim is "
                    "unproven"
                ),
            }
        if baseline != "passed":
            return {"status": "broken", "scope": "test", "detail": detail}
        return {
            "status": "behavioral",
            "scope": "test",
            "lastRun": _now(),
            "detail": f"mutation not applicable: {claim.get('rationale', 'no rationale recorded')}",
        }
    target = derived.get("mutates")
    if not target:
        return {
            "status": "unstamped",
            "detail": "annotation carries no mutates= target; stamp one to judge this claim",
        }
    # `mutates="path/to/file.py::QualName"` scopes the verdict to one
    # function (or `::Class` to every method of a class, `::Class.method`
    # to one). The sharper scope exists because file-scope zero-survivor is
    # unattainable in principle: a whole file always carries mutants the
    # claim asserts nothing about. Python-only -- mutmut's mutant keys are
    # function-qualified; gremlins and Stryker offer nothing equivalent.
    target, _, qualname = target.partition("::")
    if not (root / target).exists():
        return {"status": "missing_target", "detail": target}
    if derived.get("test") is None:
        return {
            "status": "broken",
            "detail": f"annotation at {derived['file']}:{derived['line']} binds to no test",
        }
    if qualname and engine_for(target) is not _verify_python:
        return {
            "status": "error",
            "detail": (
                f"function-scoped mutates targets are Python-only; "
                f"{target} cannot be narrowed to ::{qualname}"
            ),
        }
    # A directory target is a Go package -- gremlins' real granularity. It
    # cannot select a test or a file: it mutates a package and runs its
    # tests. So "this package is the guarded surface" is the honest claim
    # an annotation can make mechanically (the test's own package); a file
    # target inside the package stays available as the sharper claim.
    if (root / target).is_dir():
        result = _verify_go(
            root, target, derived, cache=cache, package=True,
            go_module_root=go_module_root,
        )
        return apply_accepted_survivors(result, claim)
    engine = engine_for(target)
    if engine is None:
        return {
            "status": "unsupported",
            "detail": (
                f"no mutation engine for {target}: Python (mutmut), Go "
                "(gremlins), and TS/JS (stryker) are supported."
            ),
        }
    if engine is _verify_go:
        result = _verify_go(
            root, target, derived, cache=cache, go_module_root=go_module_root,
        )
    elif engine is _verify_python:
        result = _verify_python(root, target, derived, qualname=qualname or None)
    elif engine is _verify_ts:
        # One Stryker sweep per (target, scoped command) per run, not per
        # annotation: a claim bound by N markers over the same file re-ran N
        # byte-identical sweeps (observed live: 17 bindings turned a ~8-minute
        # trust.mjs sweep into a 134-minute CI gate). Same contract as the Go
        # package cache above: a failed sweep is NOT cached, and hits are
        # deep-copied so per-claim accepted-survivor application never
        # bleeds between claims sharing a target.
        ts_key = ("ts", target, test_command, concurrency)
        cached = None if cache is None else cache.get(ts_key)
        if cached is None:
            result = _verify_ts(
                root, target, derived,
                concurrency=concurrency, test_command=test_command,
            )
            if cache is not None and result.get("status") != "error":
                cache[ts_key] = copy.deepcopy(result)
        else:
            result = copy.deepcopy(cached)
    else:
        result = engine(root, target, derived)
    return apply_accepted_survivors(result, claim)


def _accepted_matches(survivor: str, entry: str) -> bool:
    """Boundary-safe prefix match: an entry names a location ("path:22:3")
    or a location+mutator ("path:22:3 ConditionalExpression"). Plain
    startswith would let "path:22:3" swallow "path:22:33 ...", silently
    widening a waiver — the boundary character must end the token."""
    if not survivor.startswith(entry):
        return False
    return len(survivor) == len(entry) or survivor[len(entry)] in " ("


def apply_accepted_survivors(result: dict, claim: dict) -> dict:
    """The OPERATOR's equivalence register, applied to a mutation verdict.

    File-scope zero-survivor is unattainable in principle for Stryker
    targets (a whole file always carries mutants the claim asserts nothing
    about, and some mutants are true equivalents). `acceptedSurvivors` on a
    claim lets the operator name specific mutant locations as accepted —
    judged equivalent, ideally validated by a measurement round where every
    other mutant died. The list lives in claims.json, which adopting
    harnesses protect from agent writes: a worker cannot waive its own
    survivors; only the operator can, from evidence.

    Honesty rules: this only ever SUBTRACTS from a `vacuous` verdict, and
    nothing disappears — accepted survivors are reported under
    `acceptedSurvivors`, entries that matched nothing are flagged
    `staleAccepted` (the mutant died; the waiver has outlived its reason),
    and the verdict flips to `verified` only when no unaccepted survivor
    remains.
    """
    accepted = claim.get("acceptedSurvivors") or []
    if not accepted:
        return result
    if result.get("status") == "verified":
        return {**result, "staleAccepted": list(accepted)}
    if result.get("status") != "vacuous":
        return result
    survivors = result.get("survivors") or []
    matched = [s for s in survivors if any(_accepted_matches(s, a) for a in accepted)]
    remaining = [s for s in survivors if s not in matched]
    stale = [a for a in accepted
             if not any(_accepted_matches(s, a) for s in survivors)]
    out = {**result, "acceptedSurvivors": matched or None}
    if stale:
        out["staleAccepted"] = stale
    if remaining:
        out["survivors"] = remaining
        return out
    out["status"] = "verified"
    out["survivors"] = None
    out["detail"] = (
        f"{len(matched)} survivor(s) accepted via the operator equivalence "
        "register; every other mutant died"
    )
    return out
