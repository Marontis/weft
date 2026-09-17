# Retro: how this language was built

Weft was built end-to-end by an autonomous agent fleet running one of the cheapest
models available (`gemini-flash-lite-latest`), inside a pipeline the model cannot
touch: every change was verified in a sandboxed shadow worktree before publish,
every epic landed through a pull request, and nothing reached `main` without the
required checks going green. A stronger model (`gemini-3.8-flash`) was pulled in
per-task only when the cheap one hit its ceiling — that happened exactly 4 times
across the whole build (builtins-core, stdlib-lists, stdlib-strings, playground).

**Final state:** lexer, parser, evaluator with lexical closures and real tail-call
optimization (a 100,000-deep tail-recursive loop returns cleanly), a four-module
stdlib, formatter, run API and playground — merged through PRs #3–#9, with test
adequacy measured by mutation testing and published on every PR
([scoreboard](attestation/SCOREBOARD.md)): **2,335 mutants, 108 survivors, 95.4%
composite kill rate**. The evaluator scored 99.8% (995 mutants, 2 survivors).
Every surviving mutant is listed; none are hidden behind a threshold.

## What it cost

The successful build pass (epics 2–7) took **~13.4M input tokens** — a median of
about 2M per epic — and an evening of wall-clock time. Getting the pipeline and its
economics right took 8 runs over two days and roughly 4–5× that spend. The failures
taught more than the successes:

1. **Measurement is nearly free; LLM repair is the spend.** A full mutation sweep of
   the language costs ~1 minute of CPU and zero tokens. Trying to *loop a model until
   zero survivors* on one file cost ~25M tokens. So the gate publishes an honest score
   on every PR instead of demanding perfection by default; the repair loop exists but
   is opt-in per claim.
2. **Episode length is the hidden cost multiplier.** An agent episode re-sends its
   accumulated history on every model call, so a flailing episode's cost grows
   roughly quadratically. One 120-call episode burned ~9M tokens failing to write a
   scoping module; with an 80-call cap and escalate-after-one-failure, the same epic
   cost 564K. Fail fast into a fresh attempt; never leave a cheap model on a long leash.
3. **Never put a cache between a feedback loop and its measurement.** An incremental
   mutation-testing cache silently replayed stale verdicts, making a working
   test-strengthening loop look useless for a day. The tell was a "sweep" that
   returned in 2 seconds instead of 60.

## Integrity moments

- The mutation gate blocked an early epic whose tests passed but killed nothing —
  exactly the failure mode it exists to catch. Nothing red or vacuous ever merged.
- The attest engine refused to score the finished tree because two test files were
  bound to claim IDs no plan had declared. The fix went through a PR like everything
  else (#10). A verification tool that refuses to guess is the design, not a bug.
- A run-level token budget halted the most expensive run at its cap instead of
  grinding on. The circuit breakers are part of the product.

## What this does and doesn't prove

Weft shows the full loop working cheaply: plan → cheap-model build → sandboxed
verification → escalate only at the ceiling → PR → deterministic gates → green merge,
with adequacy measured and published, and zero human code review. But weft is a
friendly target: pure functions, no dependencies, no I/O, and a spec written by the
same project. The next benchmark should be a genuinely useful library judged by an
**external conformance suite the fleet cannot edit** — an exam the model didn't write.
