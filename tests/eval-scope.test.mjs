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
test('WFT-EVAL closure capture, shadowing, scope and boundaries', () => {
  const env = newGlobalEnv();
  define(env, '+', { kind: 'builtin', name: '+', fn: (args) => args[0] + args[1] });
  define(env, '-', { kind: 'builtin', name: '-', fn: (args) => args[0] - args[1] });

  // 1. Closures capture the defining env (lexical scope)
  const makeAdder = runEval('(fn (x) (fn (y) (+ x y)))', env);
  const makeAdderNodes = parse('(makeAdder 10)');
  const callEnv = newGlobalEnv();
  define(callEnv, 'makeAdder', makeAdder);
  define(callEnv, '+', { kind: 'builtin', name: '+', fn: (args) => args[0] + args[1] });
  const addTen = evalForm(makeAdderNodes[0], callEnv);
  assert.equal(typeof addTen, 'object');
  assert.equal(addTen.kind, 'closure');

  const addEnv = newGlobalEnv();
  define(addEnv, 'addTen', addTen);
  define(addEnv, '+', { kind: 'builtin', name: '+', fn: (args) => args[0] + args[1] });
  assert.equal(runEval('(addTen 5)', addEnv), 15);

  // 2. Variable shadowing in let and fn
  define(env, 'x', 100);
  const shadowedLet = runEval('(let ((x 10)) (let ((x (+ x 5))) x))', env);
  assert.equal(shadowedLet, 15);
  assert.equal(runEval('x', env), 100, 'global x remains unaffected');

  const shadowedFnSrc = parse('((fn (x) (let ((x 99)) x)) 1)');
  assert.equal(evalForm(shadowedFnSrc[0], env), 99);

  // 3. Boundary & invalid forms in def, let, fn
  const badDef = parse('(def "not-sym" 1)');
  assert.throws(() => evalForm(badDef[0], env), (err) => err instanceof WeftError && err.message.includes('expected symbol'));

  const badLet = parse('(let not-a-list 1)');
  assert.throws(() => evalForm(badLet[0], env), (err) => err instanceof WeftError && err.message.includes('expected binding list'));

  const badBinding = parse('(let ((x)) x)');
  assert.throws(() => evalForm(badBinding[0], env), (err) => err instanceof WeftError && err.message.includes('invalid binding form'));

  const badFnParams = parse('(fn not-a-list 1)');
  assert.throws(() => evalForm(badFnParams[0], env), (err) => err instanceof WeftError && err.message.includes('expected parameter list'));

  const badFnParamItem = parse('(fn (123) 1)');
  assert.throws(() => evalForm(badFnParamItem[0], env), (err) => err instanceof WeftError && err.message.includes('expected symbol parameter'));

  const badFnArityDef = parse('(fn)');
  assert.throws(() => evalForm(badFnArityDef[0], env), (err) => err instanceof WeftError && err.message.startsWith('arity: expected at least 2'));
});
