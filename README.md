# weft

**A small programming language, written by an autonomous agent fleet — in public, with receipts. Status: complete, archived.**

This repository is a full-scale, warts-and-all test of the [Attorn framework](https://github.com/Marontis): every line of product code (lexer, parser, evaluator, stdlib, formatter, playground) was proposed by `gemini-flash-lite-latest` — one of the cheapest models available — and landed only through a verification pipeline the model could not touch:

1. **A deterministic driver** owns sequencing, retries, verdicts and publishing. The model works in bounded episodes: read context, iterate in a scratch sandbox, propose one changeset, end turn.
2. **A pre-compute council** (cheap LLM reviewers + deterministic rules) screens every task and every changeset before compute is spent.
3. **The compute-broker** verifies each changeset in an isolated shadow worktree inside a no-network sandbox, then promotes atomically — or rejects with counterexample witnesses the next attempt must answer. Tests, claims, CI and the gate's own levers are mechanically unwritable by workers.
4. **Attest-Kit** rules on substance: every behavioral claim in [claims.json](claims.json) is bound to a test, and the mutation gate (CI on this repo, vendored — no private-repo access required) proves those tests are load-bearing. It publishes a per-claim scoreboard on every PR rather than blocking on it — see [Results](#results).
5. **The Attorn gateway** brokers every credential: no agent ever holds the GitHub token or the broker key. Pushes to this repo happened through server-side credential injection, fully audited.
6. **Merge-on-green PRs.** Nothing reached `main` directly. Every epic landed as a pull request; the required `suite` check had to pass before a squash-merge.

## Results

The full language — lexer, parser, evaluator (closures + real tail-call optimization), a four-module stdlib, formatter, run API, and a static playground — was built across 9 merge-on-green PRs (#3–#12):

| | |
|---|---|
| **Composite mutation score** | **95.4%** (2,335 mutants, 108 survivors, all published) |
| Strongest claim | WFT-EVAL (the evaluator) — 99.8%, 995 mutants, 2 survivors |
| Weakest claim | WFT-RENDER — 75.6% |
| Functional proof | 100,000-deep tail-recursive loop returns cleanly; full suite green in 779ms |
| Input tokens, successful build pass | ~13.4M across epics 2–7 (median ~2M/epic) |
| Model escalations | 4 (cheap model hit its ceiling on builtins-core, stdlib-lists, stdlib-strings, playground; a stronger model finished those tasks — the rest is 100% cheapest-tier) |

Full breakdown, every surviving mutant, and the reporting-only scoreboard mechanics: [docs/attestation/SCOREBOARD.md](docs/attestation/SCOREBOARD.md).

**The build cost more to get right than to run.** Getting the pipeline's economics correct took 8 exploratory runs and roughly 4–5× the tokens of the final successful pass. Those runs — and the three transferable cost laws they taught — are written up honestly in **[docs/RETRO.md](docs/RETRO.md)**. Short version: measurement is nearly free, LLM *repair* loops are the expense, and agent episode length is a hidden, roughly-quadratic cost multiplier. Read that before assuming any number here generalizes.

## The honest part

The flight recorder is committed too: [plans/](plans/) (what was asked), the fleet evidence trail (council predictions vs. outcomes, retries, failures, cost per task — referenced in the retro), and every mutation-gate ruling in [attest-record.json](attest-record.json). Failures were part of the experiment and stayed visible; nothing was cleaned up after the fact.

## The language

Weft is a small s-expression language — closures, lexical scoping, a real stdlib, position-carrying errors, tail-call optimization, and an idempotent formatter. The complete specification the fleet built against is [docs/DESIGN.md](docs/DESIGN.md). Try it in [`index.html`](index.html) — static, no build, no dependencies.

## Status: archived

This project served its purpose — proving the Attorn pipeline end-to-end on a from-scratch build — and is not under active development. It's kept public and unmodified as a reference artifact. The next benchmark in this series targets a harder, externally-graded target (a conformance suite the fleet cannot edit) rather than extending weft itself; see [docs/RETRO.md](docs/RETRO.md) for why.

## License

[MIT](LICENSE)
