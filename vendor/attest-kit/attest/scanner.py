"""Scanner for claim annotations on tests, across Python, Go and TypeScript.

The annotation is the code-side binding between a claim and its load-bearing
test. Scan output is the *derived* half of the verification state.

Why the binding lives on the test rather than in a registry file: a registry
holds the test's *name as a string*, so renaming the test silently breaks the
binding and only an existence check catches it -- and that check has to walk
the whole tree to run. An annotation moves with the code it annotates, so the
class of drift disappears rather than being detected. Measured on the project
this engine was extracted from: 240 hand-written test names in one file, 36%
of its bytes, all of them redundant with a mark on the test.

Three syntaxes, one meaning:

    Python      @attest.claim(id="SEC-01", mutates="src/auth.py")
                def test_only_admin_or_owner(): ...

    Go          // @attest SEC-01 mutates=internal/auth/auth.go
                func TestOnlyAdminOrOwner(t *testing.T) { ... }

    TypeScript  // @attest SEC-01 mutates=src/lib/authz.ts
                test("only admins or owners may access", () => { ... })

Python test files (pytest convention: `test_*.py` / `*_test.py`) also accept
the comment form, so a binding needs no `import attest` at test runtime and
agents learn ONE marker shape across languages:

    Python      # @attest SEC-01 mutates=src/auth.py
                def test_only_admin_or_owner(): ...

The comment form is read only from test-named files (the same rule as TS/JS:
a stray marker in application code must not register a claim); the decorator
form still scans in any .py file.

`test` is the identifier a runner selects by: the function name in Python and
Go, the name *string* in TypeScript, because that is what `node --test` and
vitest match on. A test may carry several annotations; a claim may be
discharged by several tests.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

SKIP_DIRS = {
    "__pycache__",
    "node_modules",
    ".git",
    ".venv",
    "venv",
    ".attest",
    "attest",
    "mutants",
    "vendor",
    "dist",
    "build",
}

# Go and TypeScript have no decorator to hang metadata on, so the annotation is
# a comment line. `id` is positional because it is always present and always
# first; everything else is key=value so the syntax can grow without breaking
# existing annotations.
_ANNOTATION = re.compile(
    r"^\s*(?://|#)\s*@attest\s+(?P<id>[A-Za-z0-9][\w.\-]*)(?P<rest>.*)$"
)
# A bare marker with no id: matched separately so it can be REFUSED by name
# rather than passing as an ordinary comment (fail-open on malformed input).
_BARE = re.compile(r"^\s*(?://|#)\s*@attest\s*$")
_KV = re.compile(r"(\w+)=(\"[^\"]*\"|'[^']*'|\S+)")

_GO_FUNC = re.compile(r"^\s*func\s+(Test\w+)\s*\(")
# pytest collects `def test_*` (sync or async). Decorator lines between a
# comment marker and the def keep the run alive like comments do — pytest
# tests routinely carry @pytest.mark.* — but any other statement still ends
# it, so a marker never attaches to a test twenty lines below.
_PY_TEST = re.compile(r"^\s*(?:async\s+)?def\s+(test_\w+)\s*\(")
_PY_DECORATOR = re.compile(r"^\s*@\w")
# node:test / vitest / jest all spell it test("name", ...) or it("name", ...).
# Each quote style closes with its own quote: a lazy ["'] class treats an
# apostrophe *inside* a double-quoted name as the terminator, which silently
# truncates names like "the actor's organization". Escaped characters must
# also span: '...error:\'name_taken\'...' used to stop the capture at the
# first \' — the truncated name then matched nothing in the TAP stream and
# a passing behavioral test was ruled SKIPPED (observed live, Agora AGR-14).
_TS_TEST = re.compile(
    r"""^\s*(?:await\s+)?(?:t\.)?(?:test|it)\s*\(\s*"""
    r"""(?:"((?:\\.|[^"\\])+)"|'((?:\\.|[^'\\])+)'|`((?:\\.|[^`\\])+)`)"""
)

# The capture is raw source text; the runtime (and node's TAP output) sees
# the UNESCAPED string. Quote and backslash escapes are unescaped so the
# bound name compares equal to what `node --test` reports; other escape
# sequences (\n, \t, \u...) are left as written — a title relying on them
# would break TAP line-matching regardless, and none has been seen in the
# wild.
_TS_NAME_ESCAPE = re.compile(r"\\(['\"`\\])")


def _parse_kv(rest: str) -> dict:
    out = {}
    for k, v in _KV.findall(rest or ""):
        out[k] = v.strip("\"'")
    return out


def _is_attest_claim(node: ast.expr) -> bool:
    if isinstance(node, ast.Call):
        f = node.func
        return (
            isinstance(f, ast.Attribute)
            and f.attr == "claim"
            and isinstance(f.value, ast.Name)
            and f.value.id == "attest"
        )
    return False


def _kw(call: ast.Call, name: str) -> str | None:
    for kw in call.keywords:
        if (
            kw.arg == name
            and isinstance(kw.value, ast.Constant)
            and isinstance(kw.value.value, str)
        ):
            return kw.value.value
    return None


def _scan_python(text: str, rel: str) -> list[dict]:
    tree = ast.parse(text)
    out = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for dec in node.decorator_list:
                if _is_attest_claim(dec) and isinstance(dec, ast.Call):
                    out.append(
                        {
                            "id": _kw(dec, "id"),
                            "description": _kw(dec, "description"),
                            "mutates": _kw(dec, "mutates"),
                            "basis": _kw(dec, "basis") or "test",
                            "test": node.name,
                            "file": rel,
                            "line": node.lineno,
                        }
                    )
    return out


def _scan_commented(
    text: str, rel: str, declarator: re.Pattern, python: bool = False
) -> list[dict]:
    """Shared Go/TypeScript/Python walk: annotations attach to the next test below.

    Blank lines and further comments may sit between the annotation and the
    test -- a doc comment explaining *why* the test is load-bearing belongs
    there, and demanding adjacency would push that reasoning away from the
    code. Any other statement ends the run: an annotation that never reaches a
    test is reported with test=None rather than silently attaching to whatever
    appears twenty lines later.

    `python` adds two rules with the same dead-code rationale as /* */ blocks:
    lines inside a triple-quoted string neither annotate nor declare (a marker
    quoted in a docstring is prose, not a binding), and decorator lines keep a
    pending run alive, since pytest tests routinely carry @pytest.mark.* between
    any comment and the def.
    """
    out = []
    pending: list[dict] = []
    in_block = False
    in_string = False
    for lineno, line in enumerate(text.splitlines(), start=1):
        early = line.strip()
        if python:
            fences = line.count('"""') + line.count("'''")
            if in_string:
                if fences % 2 == 1:
                    in_string = False
                continue
            if fences % 2 == 1:
                in_string = True
                continue
        # Block comments are dead code, and dead code must not bind: a test
        # disabled by wrapping it in /* */ kept serving as evidence, because
        # this walk was purely line-based — the disabled test rendered as
        # "discharged by" in a report while never running (found by attorn
        # R.18's adoption review). Nothing inside a block may annotate or
        # declare; annotations pending ABOVE the block survive it, since a
        # comment — block or line — keeps the run alive.
        if in_block:
            if "*/" in early:
                in_block = False
            continue
        if early.startswith("/*") and "*/" not in early:
            in_block = True
            continue
        m = _ANNOTATION.match(line)
        if m:
            kv = _parse_kv(m.group("rest"))
            entry = {
                "id": m.group("id"),
                "description": kv.get("description"),
                "mutates": kv.get("mutates"),
                "basis": kv.get("basis", "test"),
                "test": None,
                "file": rel,
                "line": lineno,
            }
            # Anything after the id that key=value did not consume is a
            # malformed annotation, and malformed refuses rather than
            # half-applies: `@attest SEC-01 SEC-02` used to bind SEC-01 and
            # silently drop SEC-02 — a binding its author believes exists
            # and the scan never saw (attorn R.18's review). One id per
            # line is the syntax.
            leftover = _KV.sub("", m.group("rest") or "").strip()
            if leftover:
                entry["malformed"] = leftover
            pending.append(entry)
            continue
        if _BARE.match(line):
            # A bare `@attest` with no id: refused by reconcile's existing
            # no-id error instead of passing as an ordinary comment.
            pending.append({"id": "", "test": None, "file": rel, "line": lineno})
            continue
        if not pending:
            continue
        d = declarator.match(line)
        if d:
            name = next(g for g in d.groups() if g is not None)
            # No-op for Go func names (no backslashes); for TS/JS titles this
            # turns the source spelling into the runtime name TAP will print.
            name = _TS_NAME_ESCAPE.sub(r"\1", name)
            for c in pending:
                c["test"] = name
            out.extend(pending)
            pending = []
            continue
        stripped = line.strip()
        if stripped == "" or stripped.startswith(("//", "#", "/*", "*")):
            continue
        if python and _PY_DECORATOR.match(line):
            continue
        # Something that is not a test declaration: the annotations above it
        # bind to nothing. Emit them so reconcile can say so by name.
        out.extend(pending)
        pending = []
    out.extend(pending)
    return out


def scan_file(path: Path, root: Path) -> list[dict]:
    """Extract claim annotations from one file.

    `root` is required rather than optional so a claim dict can never hold an
    absolute path, not even briefly. It used to record `path` and rely on the
    caller to overwrite it with the relative form one line later -- which
    worked, but left `scan_file` returning machine-specific paths
    (`C:/Users/you/...` on Windows) to anyone who called it directly. Report
    data is compared as a golden file, so a machine-specific path in it is a
    defect waiting for a second caller.
    """
    rel = path.relative_to(root).as_posix()
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".py":
        found = _scan_python(text, rel)
        # Comment markers only in test-named files (pytest convention), the
        # same wall TS/JS has: a stray marker in application code must not
        # register a claim. The decorator form above scans in any .py file.
        if path.name.startswith("test_") or path.name.endswith("_test.py"):
            found += _scan_commented(text, rel, _PY_TEST, python=True)
        return found
    if path.name.endswith("_test.go"):
        return _scan_commented(text, rel, _GO_FUNC)
    return _scan_commented(text, rel, _TS_TEST)


def _is_scannable(rel: Path) -> bool:
    name = rel.name
    if name.endswith(".py") or name.endswith("_test.go"):
        return True
    # Only test files for TS/JS: the annotation binds a *test*, and scanning
    # every source file would be slower and would let a stray comment in
    # application code register a claim.
    return bool(re.search(r"\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$", name))


def scan(root: Path, scan_root: str = ".") -> list[dict]:
    """Walk `root/scan_root` for claim annotations.

    `scan_root` exists for multi-project repos (one governed project per
    subfolder): pointing it at the active project keeps an archived sibling
    project's markers from registering against the active claims file. Claim
    paths stay relative to `root`, so scoping the walk never changes how a
    claim is addressed.
    """
    root = root.resolve()
    base = (root / scan_root).resolve()
    if base != root and not base.is_relative_to(root):
        raise ValueError(f"scanRoot {scan_root!r} escapes the repo root")
    if not base.is_dir():
        raise ValueError(f"scanRoot {scan_root!r} is not a directory under the repo root")
    found = []
    for path in base.rglob("*"):
        if not path.is_file():
            continue
        try:
            rel = path.relative_to(root)
        except ValueError:
            continue
        if any(p in SKIP_DIRS or p.startswith(".") for p in rel.parts):
            continue
        if not _is_scannable(rel):
            continue
        found.extend(scan_file(path, root))
    return found
