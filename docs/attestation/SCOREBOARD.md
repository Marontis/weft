### Mutation scoreboard

Recorded 2026-09-17T02:41:10+00:00 by `attest check --record`. Reporting-only: survivors are published here, not merge-blocking; `suite` is the required gate.

| Claim | Status | Mutants | Survived | Score | Accepted equivalents |
|---|---|---:|---:|---:|---:|
| WFT-CORE | vacuous | 266 | 11 | 95.9% | 0 |
| WFT-ENV | vacuous | 28 | 4 | 85.7% | 0 |
| WFT-EVAL | vacuous | 995 | 2 | 99.8% | 0 |
| WFT-FORMAT | vacuous | 80 | 12 | 85.0% | 0 |
| WFT-GOLDEN | unsupported | — | 0 | — | 0 |
| WFT-INDEX | vacuous | 6 | 1 | 83.3% | 0 |
| WFT-LEXER | vacuous | 376 | 10 | 97.3% | 0 |
| WFT-LISTS | vacuous | 235 | 25 | 89.4% | 0 |
| WFT-MATH | vacuous | 108 | 12 | 88.9% | 0 |
| WFT-PARSER | vacuous | 88 | 6 | 93.2% | 0 |
| WFT-RENDER | vacuous | 41 | 10 | 75.6% | 0 |
| WFT-STRINGS | vacuous | 112 | 15 | 86.6% | 0 |

<details><summary>WFT-CORE: 11 surviving mutant(s)</summary>

- `src/builtins-core.mjs:5:16 ConditionalExpression (Survived)`
- `src/builtins-core.mjs:5:24 ConditionalExpression (Survived)`
- `src/builtins-core.mjs:6:15 ConditionalExpression (Survived)`
- `src/builtins-core.mjs:6:23 ConditionalExpression (Survived)`
- `src/builtins-core.mjs:6:15 LogicalOperator (Survived)`
- `src/builtins-core.mjs:5:16 LogicalOperator (Survived)`
- `src/builtins-core.mjs:74:21 EqualityOperator (Survived)`
- `src/builtins-core.mjs:179:7 ConditionalExpression (Survived)`
- `src/builtins-core.mjs:179:7 LogicalOperator (Survived)`
- `src/builtins-core.mjs:202:9 ConditionalExpression (Survived)`
- `src/builtins-core.mjs:202:20 BlockStatement (Survived)`

</details>

<details><summary>WFT-ENV: 4 surviving mutant(s)</summary>

- `src/env.mjs:15:24 ConditionalExpression (Survived)`
- `src/env.mjs:16:23 ConditionalExpression (Survived)`
- `src/env.mjs:21:7 ConditionalExpression (Survived)`
- `src/env.mjs:21:18 BlockStatement (Survived)`

</details>

<details><summary>WFT-EVAL: 2 surviving mutant(s)</summary>

- `src/evaluator.mjs:225:21 ObjectLiteral (Survived)`
- `src/evaluator.mjs:228:20 ConditionalExpression (Survived)`

</details>

<details><summary>WFT-FORMAT: 12 surviving mutant(s)</summary>

- `src/format.mjs:27:7 ConditionalExpression (Survived)`
- `src/format.mjs:28:9 ConditionalExpression (Survived)`
- `src/format.mjs:28:41 StringLiteral (Survived)`
- `src/format.mjs:30:9 ConditionalExpression (Survived)`
- `src/format.mjs:35:37 StringLiteral (Survived)`
- `src/format.mjs:30:9 EqualityOperator (Survived)`
- `src/format.mjs:36:29 StringLiteral (Survived)`
- `src/format.mjs:36:44 StringLiteral (Survived)`
- `src/format.mjs:38:25 StringLiteral (Survived)`
- `src/format.mjs:38:42 StringLiteral (Survived)`
- `src/format.mjs:40:10 StringLiteral (Survived)`
- `src/format.mjs:45:7 ConditionalExpression (Survived)`

</details>

<details><summary>WFT-GOLDEN: detail</summary>

_no mutation engine for examples/fizzbuzz.weft: Python (mutmut), Go (gremlins), and TS/JS (stryker) are supported._

</details>

<details><summary>WFT-INDEX: 1 surviving mutant(s)</summary>

- `src/index.mjs:23:51 StringLiteral (Survived)`

</details>

<details><summary>WFT-LEXER: 10 surviving mutant(s)</summary>

- `src/lexer.mjs:139:9 ConditionalExpression (Survived)`
- `src/lexer.mjs:139:9 LogicalOperator (Survived)`
- `src/lexer.mjs:139:9 ConditionalExpression (Survived)`
- `src/lexer.mjs:139:23 ConditionalExpression (Survived)`
- `src/lexer.mjs:139:23 EqualityOperator (Survived)`
- `src/lexer.mjs:139:23 ArithmeticOperator (Survived)`
- `src/lexer.mjs:141:29 ConditionalExpression (Survived)`
- `src/lexer.mjs:192:9 ConditionalExpression (Survived)`
- `src/lexer.mjs:192:9 EqualityOperator (Survived)`
- `src/lexer.mjs:200:25 StringLiteral (Survived)`

</details>

<details><summary>WFT-LISTS: 25 surviving mutant(s)</summary>

- `src/builtins-lists.mjs:6:15 ConditionalExpression (Survived)`
- `src/builtins-lists.mjs:5:24 ConditionalExpression (Survived)`
- `src/builtins-lists.mjs:6:15 LogicalOperator (Survived)`
- `src/builtins-lists.mjs:5:16 ConditionalExpression (Survived)`
- `src/builtins-lists.mjs:6:23 ConditionalExpression (Survived)`
- `src/builtins-lists.mjs:5:16 LogicalOperator (Survived)`
- `src/builtins-lists.mjs:18:68 ConditionalExpression (Survived)`
- `src/builtins-lists.mjs:18:83 StringLiteral (Survived)`
- `src/builtins-lists.mjs:30:7 LogicalOperator (Survived)`
- `src/builtins-lists.mjs:30:7 ConditionalExpression (Survived)`
- `src/builtins-lists.mjs:30:18 ConditionalExpression (Survived)`
- `src/builtins-lists.mjs:30:74 EqualityOperator (Survived)`
- `src/builtins-lists.mjs:30:104 BlockStatement (Survived)`
- `src/builtins-lists.mjs:30:91 StringLiteral (Survived)`
- `src/builtins-lists.mjs:30:74 ConditionalExpression (Survived)`
- `src/builtins-lists.mjs:31:25 StringLiteral (Survived)`
- `src/builtins-lists.mjs:38:21 EqualityOperator (Survived)`
- `src/builtins-lists.mjs:46:14 ConditionalExpression (Survived)`
- `src/builtins-lists.mjs:48:14 ConditionalExpression (Survived)`
- `src/builtins-lists.mjs:48:14 EqualityOperator (Survived)`
- `src/builtins-lists.mjs:48:14 ConditionalExpression (Survived)`
- `src/builtins-lists.mjs:48:31 StringLiteral (Survived)`
- `src/builtins-lists.mjs:48:43 BlockStatement (Survived)`
- `src/builtins-lists.mjs:201:20 BlockStatement (Survived)`
- `src/builtins-lists.mjs:201:9 ConditionalExpression (Survived)`

</details>

<details><summary>WFT-MATH: 12 surviving mutant(s)</summary>

- `src/builtins-math.mjs:4:16 LogicalOperator (Survived)`
- `src/builtins-math.mjs:4:24 ConditionalExpression (Survived)`
- `src/builtins-math.mjs:4:16 ConditionalExpression (Survived)`
- `src/builtins-math.mjs:5:23 ConditionalExpression (Survived)`
- `src/builtins-math.mjs:5:15 ConditionalExpression (Survived)`
- `src/builtins-math.mjs:5:15 LogicalOperator (Survived)`
- `src/builtins-math.mjs:69:19 EqualityOperator (Survived)`
- `src/builtins-math.mjs:70:9 EqualityOperator (Survived)`
- `src/builtins-math.mjs:86:19 EqualityOperator (Survived)`
- `src/builtins-math.mjs:87:9 EqualityOperator (Survived)`
- `src/builtins-math.mjs:105:9 ConditionalExpression (Survived)`
- `src/builtins-math.mjs:105:20 BlockStatement (Survived)`

</details>

<details><summary>WFT-PARSER: 6 surviving mutant(s)</summary>

- `src/parser.mjs:59:13 ConditionalExpression (Survived)`
- `src/parser.mjs:59:20 BlockStatement (Survived)`
- `src/parser.mjs:66:9 ConditionalExpression (Survived)`
- `src/parser.mjs:73:5 UpdateOperator (Survived)`
- `src/parser.mjs:69:7 UpdateOperator (Survived)`
- `src/parser.mjs:79:9 ConditionalExpression (Survived)`

</details>

<details><summary>WFT-RENDER: 10 surviving mutant(s)</summary>

- `src/render.mjs:2:24 StringLiteral (Survived)`
- `src/render.mjs:5:24 StringLiteral (Survived)`
- `src/render.mjs:5:34 BlockStatement (Survived)`
- `src/render.mjs:2:7 ConditionalExpression (Survived)`
- `src/render.mjs:2:34 BlockStatement (Survived)`
- `src/render.mjs:5:7 ConditionalExpression (Survived)`
- `src/render.mjs:11:24 StringLiteral (Survived)`
- `src/render.mjs:11:35 BlockStatement (Survived)`
- `src/render.mjs:11:7 ConditionalExpression (Survived)`
- `src/render.mjs:17:36 ConditionalExpression (Survived)`

</details>

<details><summary>WFT-STRINGS: 15 surviving mutant(s)</summary>

- `src/builtins-strings.mjs:4:16 LogicalOperator (Survived)`
- `src/builtins-strings.mjs:4:24 ConditionalExpression (Survived)`
- `src/builtins-strings.mjs:5:15 ConditionalExpression (Survived)`
- `src/builtins-strings.mjs:4:16 ConditionalExpression (Survived)`
- `src/builtins-strings.mjs:5:23 ConditionalExpression (Survived)`
- `src/builtins-strings.mjs:5:15 LogicalOperator (Survived)`
- `src/builtins-strings.mjs:24:7 ConditionalExpression (Survived)`
- `src/builtins-strings.mjs:53:7 EqualityOperator (Survived)`
- `src/builtins-strings.mjs:54:7 EqualityOperator (Survived)`
- `src/builtins-strings.mjs:54:7 ConditionalExpression (Survived)`
- `src/builtins-strings.mjs:55:7 EqualityOperator (Survived)`
- `src/builtins-strings.mjs:56:7 EqualityOperator (Survived)`
- `src/builtins-strings.mjs:56:7 ConditionalExpression (Survived)`
- `src/builtins-strings.mjs:125:9 ConditionalExpression (Survived)`
- `src/builtins-strings.mjs:125:20 BlockStatement (Survived)`

</details>
