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
test('WFT-EVAL: eval-branch lazy and side-effect probing, exact deciding values, arity checks, and truthiness boundaries', () => {
  const env = newGlobalEnv();
  define(env, '+', { kind: 'builtin', name: '+', fn: (args) => args[0] + args[1] });

  // 1. If laziness: def in untaken true branch when cond is false must not run
  define(env, 'side_effect_if_taken', 0);
  runEval('(if false (def side_effect_if_taken 100) 200)', env);
  assert.equal(runEval('side_effect_if_taken', env), 0, 'untaken true branch side effect must not execute');

  // def in untaken false branch when cond is true must not run
  define(env, 'side_effect_else_taken', 0);
  runEval('(if true 100 (def side_effect_else_taken 200))', env);
  assert.equal(runEval('side_effect_else_taken', env), 0, 'untaken else branch side effect must not execute');

  // 2. and / or laziness and exact deciding values
  // and short-circuiting: second operand with side effect must not run if first is falsy
  define(env, 'and_side_effect', 0);
  const andRes = runEval('(and false (def and_side_effect 555) 777)', env);
  assert.equal(andRes, false, 'and returns first falsy value (false)');
  assert.equal(runEval('and_side_effect', env), 0, 'and short-circuiting prevents evaluation of subsequent operands');

  define(env, 'and_side_effect_nil', 0);
  const andNilRes = runEval('(and nil (def and_side_effect_nil 555))', env);
  assert.equal(andNilRes, null, 'and returns first falsy value (nil)');
  assert.equal(runEval('and_side_effect_nil', env), 0, 'and short-circuiting with nil');

  // and returning last truthy value when all are truthy
  assert.equal(runEval('(and 1 2 42)', env), 42);

  // or short-circuiting: second operand with side effect must not run if first is truthy
  define(env, 'or_side_effect', 0);
  const orRes = runEval('(or true (def or_side_effect 888) 999)', env);
  assert.equal(orRes, true, 'or returns first truthy value (true)');
  assert.equal(runEval('or_side_effect', env), 0, 'or short-circuiting prevents subsequent evaluation');

  // or returning deciding value (truthy 0 or string or number)
  assert.equal(runEval('(or false 0 42)', env), 0, '0 is truthy in Weft and decides or');
  assert.equal(runEval('(or false "" "hello")', env), '', '"" is truthy in Weft and decides or');
  assert.equal(runEval('(or false nil 123)', env), 123);

  // 3. Truthiness rule (§5): false and nil are falsy, everything else is truthy (0, "", true, numbers, lists)
  assert.equal(runEval('(if 0 "yes" "no")', env), 'yes');
  assert.equal(runEval('(if "" "yes" "no")', env), 'yes');
  assert.equal(runEval('(if \'(1) "yes" "no")', env), 'yes');
  assert.equal(runEval('(if false "yes" "no")', env), 'no');
  assert.equal(runEval('(if nil "yes" "no")', env), 'no');

  // 4. Arity and error positions for if, and, or
  const ifNodes = parse('(if 1)');
  assert.throws(() => {
    evalForm(ifNodes[0], env);
  }, (err) => err instanceof WeftError && err.message === 'arity: expected 2 or 3, got 1' && err.line === 1 && err.col === 2);

  const ifNodesTooMany = parse('(if 1 2 3 4)');
  assert.throws(() => {
    evalForm(ifNodesTooMany[0], env);
  }, (err) => err instanceof WeftError && err.message === 'arity: expected 2 or 3, got 4' && err.line === 1 && err.col === 2);
});
