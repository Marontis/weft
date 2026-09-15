# weft

**A small programming language, written by an autonomous agent fleet — in public, with receipts.**

This repository is a full-scale, warts-and-all test of the Attorn framework:
every line of product code (lexer, parser, evaluator, stdlib, formatter,
playground) is proposed by `gemini-flash-lite-latest` — one of the cheapest
models available — and lands only through a verification pipeline the model
cannot touch:

1. **A deterministic driver** owns sequencing, retries, verdicts and
   publishing. The model works in bounded episodes: read context, iterate in
   a scratch sandbox, propose one changeset, end turn.
2. **A pre-compute council** (cheap LLM reviewers + deterministic rules)
   screens every task and every changeset before compute is spent.
3. **The compute-broker** verifies each changeset in an isolated shadow
   worktree inside a no-network sandbox, then promotes atomically — or
   rejects with counterexample witnesses the next attempt must answer.
   Tests, claims, CI and the gate's own levers are mechanically unwritable
   by workers.
4. **Attest-Kit** rules on substance: every behavioral claim in
   [claims.json](claims.json) must be bound to a test, and the async
   **mutation gate** (CI on this repo) proves those tests are load-bearing —
   rulings land as commits to [attest-record.json](attest-record.json).
5. **The Attorn gateway** brokers every credential: no agent ever holds the
   GitHub token or the broker key. Pushes to this repo happen through
   server-side credential injection, fully audited.

## The honest part

The flight recorder is committed too: [plans/](plans/) (what was asked),
`fleet-evidence/` (what happened — council predictions vs outcomes, retries,
failures, cost per task), and every gate ruling. Failures are part of the
experiment and stay visible.

## The language

Weft v1 is a small s-expression language — closures, laziness where the spec
says so, a real stdlib, position-carrying errors, tail-call optimization and
an idempotent formatter. The complete specification the fleet builds against
is [docs/DESIGN.md](docs/DESIGN.md). Try it in `index.html` (static, no
build) once the playground epic lands.

## Status

Run 01 in progress. Scaffold (spec, plans, governance, CI gate) is
operator-authored; product code is fleet-authored.
