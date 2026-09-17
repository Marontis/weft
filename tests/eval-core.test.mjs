import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.mjs';
import { newGlobalEnv, define } from '../src/env.mjs';
import { evalForm } from '../src/evaluator.mjs';
import { WeftError } from '../src/errors.mjs';

function runEval(src, env = newGlobalEnv()) {
  const nodes = parse(src);
  let res = null;
  for (const node of nodes) {
    res = evalForm(node, env);
  }
  return res;
}

// @attest WFT-EVAL mutates=src/evaluator.mjs
test('WFT-EVAL: evaluator comprehensive suite: literals, symbols, quote, if, def, let, fn, do, and, or, application, arity, truthiness, error positions', () => {
  const env = newGlobalEnv();

  // 1. Literals & basic symbols
  assert.equal(runEval('42', env), 42);
  assert.equal(runEval('"hello"', env), 'hello');
  assert.equal(runEval('true', env), true);
  assert.equal(runEval('false', env), false);
  assert.equal(runEval('nil', env), null);

  // Symbol lookup error contract (unbound symbol)
  const unboundNodes = parse('nonexistent');
  assert.throws(() => {
    evalForm(unboundNodes[0], env);
  }, (err) => err instanceof WeftError && err.message === 'unbound symbol: nonexistent' && err.line === 1 && err.col === 1);

  // 2. Quote (§5): symbol -> name string, list -> array of quoted items, literals
  const quotedSym = runEval("'x", env);
  assert.equal(quotedSym, 'x');

  const quotedList = runEval("'(a b c)", env);
  assert.deepEqual(quotedList, ['a', 'b', 'c']);

  const quotedData = runEval("'(1 sym \"str\")", env);
  assert.deepEqual(quotedData, [1, 'sym', 'str']);

  const quotedNested = runEval("''a", env);
  assert.deepEqual(quotedNested, ['quote', 'a']);

  // 3. Special forms: if, def, let, fn, do, and, or
  // def
  assert.equal(runEval('(def a 10)', env), 10);
  assert.equal(runEval('a', env), 10);

  // if (truthiness: false and nil are falsy, everything else truthy including 0 and "")
  assert.equal(runEval('(if true 1 2)', env), 1);
  assert.equal(runEval('(if false 1 2)', env), 2);
  assert.equal(runEval('(if nil 1 2)', env), 2);
  assert.equal(runEval('(if 0 1 2)', env), 1, '0 is truthy in Weft');
  assert.equal(runEval('(if "" 1 2)', env), 1, '"" is truthy in Weft');
  assert.equal(runEval('(if false 1)', env), null, 'missing else branch evaluates to nil');
  
  // untaken branch never evaluated
  define(env, 'mutated', 0);
  runEval('(if true 1 (def mutated 999))', env);
  assert.equal(runEval('mutated', env), 0, 'untaken else branch was not evaluated');

  // do
  assert.equal(runEval('(do)', env), null);
  assert.equal(runEval('(do 1 2 3)', env), 3);

  // let (sequential bindings, lexical closure)
  const letEnv = newGlobalEnv();
  define(letEnv, '+', { kind: 'builtin', name: '+', fn: (args) => args[0] + args[1] });
  assert.equal(runEval('(let ((x 1) (y (+ x 1))) y)', letEnv), 2);

  // fn & application (lexical closure, arity error)
  const addFnEnv = newGlobalEnv();
  define(addFnEnv, '+', { kind: 'builtin', name: '+', fn: (args) => args[0] + args[1] });
  const addFn = runEval('(fn (a b) (+ a b))', addFnEnv);
  assert.equal(addFn.kind, 'closure');

  const addCallNodes = parse('(addFn 10 20)');
  const addEnv = newGlobalEnv();
  define(addEnv, 'addFn', addFn);
  define(addEnv, '+', { kind: 'builtin', name: '+', fn: (args) => args[0] + args[1] });
  assert.equal(evalForm(addCallNodes[0], addEnv), 30);

  // Arity mismatch error at call node (line:col of the head item / call node)
  const arityNodes = parse('(addFn 10)');
  assert.throws(() => {
    evalForm(arityNodes[0], addEnv);
  }, (err) => err instanceof WeftError && err.message === 'arity: expected 2, got 1' && err.line === 1 && err.col === 2);

  // Non-function application error at head position
  const nonFnNodes = parse('(42 1 2)');
  assert.throws(() => {
    evalForm(nonFnNodes[0], addEnv);
  }, (err) => err instanceof WeftError && err.message === 'not a function' && err.line === 1 && err.col === 2);

  // and / or short-circuiting and deciding value
  assert.equal(runEval('(and)', env), true);
  assert.equal(runEval('(and 1 2 3)', env), 3);
  assert.equal(runEval('(and 1 false 3)', env), false);
  assert.equal(runEval('(and 1 nil 3)', env), null);

  assert.equal(runEval('(or)', env), false);
  assert.equal(runEval('(or false nil 0 42)', env), 0, '0 is truthy, so or returns 0');
  assert.equal(runEval('(or false nil)', env), null);
});
