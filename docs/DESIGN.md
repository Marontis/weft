# Weft language specification (v1)

This is the single source of truth. Every task implements EXACTLY this spec.
Where code and spec disagree, the spec wins. All modules are dependency-free
ES modules (`.mjs`), no npm imports, runnable under Node 18's `node --test`.

## 1. Surface syntax

S-expressions.

- **Comments**: `;` to end of line. Produce no tokens.
- **Numbers**: 64-bit floats. Literals: `42`, `-7`, `3.14`, `-0.5`
  (a leading `-` followed by a digit is part of the number).
- **Strings**: double-quoted, escapes: `\"` `\\` `\n` `\t` only.
- **Booleans / nil**: the symbols `true`, `false`, `nil` are literals.
- **Symbols**: any run of characters excluding whitespace, `(`, `)`, `"`,
  `'`, `;`. Examples: `+`, `str-join`, `my-var?`, `set-x!`.
- **Quote sugar**: `'expr` reads as `(quote expr)`.

## 2. Tokens (src/lexer.mjs)

`tokenize(src) -> Token[]`

Token = `{ type, value, line, col }` where type ∈
`'num' | 'str' | 'sym' | 'lparen' | 'rparen' | 'quote'`.
`line`/`col` are **1-based** and point at the token's FIRST character
(for a string, the opening `"`). `value`: the number for `num`, the decoded
string for `str`, the symbol text for `sym`, and the literal character for
the paren/quote types.

Errors (all thrown as `WeftError`, see §4):
- unterminated string → position of the opening `"`,
  message starts `unterminated string`
- unknown escape (e.g. `\q`) → position of the backslash,
  message starts `unknown escape`

## 3. AST (src/parser.mjs)

`parse(src) -> Node[]` (a program is any number of top-level forms).

Node shapes (exact keys):
- `{ t: 'num', v, line, col }`
- `{ t: 'str', v, line, col }`
- `{ t: 'sym', name, line, col }`
- `{ t: 'list', items, line, col }` — position of the opening `(`

`'x` parses to `{ t:'list', items:[{t:'sym',name:'quote',...}, X], line, col }`
at the quote character's position.

Errors:
- unclosed `(` → WeftError at that paren's position, message starts
  `unclosed (`
- stray `)` → WeftError at its position, message starts `unexpected )`

## 4. Errors (src/errors.mjs)

```js
export class WeftError extends Error {
  constructor(message, line, col) { ... } // .line, .col numbers (or null)
}
```
Every user-facing fault (lex, parse, runtime) throws `WeftError` with the
best-known position. Engine bugs may throw anything; user faults never
surface as raw JS errors.

## 5. Values (runtime)

JS number, JS string, JS boolean, `null` (weft `nil`), JS Array (weft list),
functions: `{ kind:'closure', params, body, env }` or
`{ kind:'builtin', name, fn }` (fn: `(args, env, node) => value`).

**Quote produces plain data**: `(quote x)` where x is a symbol node yields
the STRING `"x"`; quoting a list yields an Array of quoted items; quoting
num/str/bool/nil literals yields their value. (There is no runtime symbol
type in v1.)

**Truthiness**: `false` and `nil` are falsy; EVERYTHING else is truthy
(including `0` and `""`).

## 6. Environments (src/env.mjs)

`{ vars: Map, parent }`. `lookup(env, name, node)` walks the chain; unbound →
`WeftError` `unbound symbol: <name>` at the symbol node's position.
`define(env, name, value)` sets in THAT env. `newGlobalEnv()` returns a fresh
env with all builtins registered and `__out: []` on the global env object
(the print buffer).

## 7. Special forms (src/evaluator.mjs)

`evalForm(node, env)`; a list whose head is one of these symbols is special:

- `(quote x)` — §5.
- `(if c a b?)` — evaluate `c`; truthy → `a`, else `b` (missing `b` → nil).
  The untaken branch is NEVER evaluated.
- `(def name expr)` — evaluate, bind in CURRENT env, return the value.
- `(let ((n1 e1) (n2 e2) ...) body...)` — new child env; bindings evaluate
  sequentially (later bindings see earlier ones); body is an implicit `do`.
- `(fn (p1 p2 ...) body...)` — closure capturing the defining env; body is an
  implicit `do`. Arity mismatch at call time → WeftError
  `arity: expected N, got M` at the call node.
- `(do e1 e2 ...)` — evaluate in order, return last; `(do)` → nil.
- `(and a b ...)` / `(or a b ...)` — short-circuit; return the deciding
  value (`(and)` → true, `(or)` → false).

Everything else: evaluate head → must be a function value (else WeftError
`not a function` at the head's position), evaluate args left-to-right, apply.

## 8. Builtins

**Core (src/builtins-core.mjs)**: `+ - * /` variadic
(`(-) ` is an arity error; `(- x)` negates; `(/ x)` is `1/x`; division by
zero → WeftError `division by zero`), `= < > <= >=` (ordering ops are
number-only, ≥2 args, chained: `(< 1 2 3)` is true; `=` is deep structural
over num/str/bool/nil/lists), `not`.

**Lists (src/builtins-lists.mjs)**: `list head tail cons len nth concat
reverse` — `head`/`tail` of `()` → WeftError `empty list`; `nth xs i`
0-based, out of range → WeftError `index out of range`; all non-mutating.
Higher-order: `map f xs`, `filter f xs`, `reduce f init xs` (folds left,
init REQUIRED).

**Strings (src/builtins-strings.mjs)**: `str-len s`, `str-slice s start end`
(0-based, end exclusive, clamped to bounds), `str-split s sep`,
`str-join xs sep`, `str-upper s`, `str-lower s`, `str-contains? s sub`.
Non-string primary argument → WeftError `expected string`.

**Math (src/builtins-math.mjs)**: `mod floor ceil abs min max`
(`mod` follows JS `%` sign semantics; `min`/`max` ≥1 arg).

**Render (src/render.mjs)** — `render(value) -> string`:
integral finite numbers without a decimal point (`42` not `42.0`); other
numbers via JS `String`; strings AS-IS (no quotes); `true`/`false`; nil →
`nil`; lists → `(` + items rendered, space-separated + `)`; functions →
`<fn>`. Builtins `str` (concat rendered args, `(str)` → `""`) and
`print` (append `render(...args joined by space) + "\n"` to the global
env's `__out`, return nil) live in builtins-core but delegate to render.

## 9. Public API (src/index.mjs)

```js
export { tokenize } from './lexer.mjs';
export { parse } from './parser.mjs';
export { WeftError } from './errors.mjs';
export { newGlobalEnv } from './env.mjs';
export function evaluate(src, env?)   // parse; eval each form; return last (fresh global env when omitted)
export function run(src)              // { value, output } — output = joined __out
export { format } from './format.mjs' // added in the formatter epic
```

## 10. Formatter (src/format.mjs)

`format(src) -> string`. Parse, then print canonically:
- atoms print as: nums via render rules, strings re-quoted with the four
  escapes re-escaped, symbols verbatim;
- a list prints on ONE line `(a b c)` if that rendering is ≤ 60 chars;
  otherwise the head stays on the open-paren line and every following item
  is on its own line indented 2 spaces from the `(`, with `)` directly after
  the last item;
- top-level forms are separated by exactly one blank line; file ends with
  one `\n`. Comments are NOT preserved (documented v1 limitation).
Contract: `format(format(s)) === format(s)`, and `parse(format(s))` equals
`parse(s)` ignoring line/col.

## 11. Tail calls (evaluator, TCO epic)

Calls in TAIL position run in constant stack: the last form of a
`do`/`let`/`fn` body, both branches of `if`, the final operand of
`and`/`or`. Self- and mutual recursion to 100000 iterations must complete.
NON-tail eval depth is capped at 10000 nested applies → WeftError
`stack depth exceeded`.

## 12. Conventions (binding tests to claims)

Tests: `tests/*.test.mjs`, `node:test` + `assert/strict`. Bind a claim with
`// @attest WFT-XX mutates=src/<file>.mjs` DIRECTLY above the load-bearing
test. Never weaken or delete an existing assertion. The whole accumulated
suite (`node --test tests/*.test.mjs`) must stay green in every task.
