import test from 'node:test';
import assert from 'node:assert/strict';
import { lookup, define, newGlobalEnv } from '../src/env.mjs';
import { WeftError } from '../src/errors.mjs';

// @attest WFT-ENV mutates=src/env.mjs
test('env operations: global env, define, lookup, shadowing, chained lookup, unbound error with position', () => {
  const g = newGlobalEnv();
  assert.deepEqual(g.__out, [], 'newGlobalEnv initializes __out buffer');
  assert.equal(g.parent, null, 'global env has no parent');

  // Define in global
  define(g, 'x', 42);
  assert.equal(lookup(g, 'x', { line: 10, col: 5 }), 42);

  // Child env created via general object structure or custom child helper
  const child = { parent: g, vars: new Map() };
  define(child, 'y', 100);
  assert.equal(lookup(child, 'y', { line: 1, col: 1 }), 100);
  // Chained lookup
  assert.equal(lookup(child, 'x', { line: 2, col: 3 }), 42);

  // Shadowing
  define(child, 'x', 999);
  assert.equal(lookup(child, 'x', { line: 3, col: 1 }), 999);
  assert.equal(lookup(g, 'x', { line: 4, col: 1 }), 42, 'global x remains unaffected by child shadowing');

  // Define is current-scope-only
  define(child, 'z', 50);
  assert.equal(child.vars.get('z'), 50);
  assert.equal(g.vars.has('z'), false, 'define is current scope only, does not leak to parent');

  // Unbound symbol error message and position
  const symNode = { t: 'sym', name: 'missing', line: 15, col: 42 };
  assert.throws(() => {
    lookup(child, 'missing', symNode);
  }, (err) => {
    return err instanceof WeftError &&
      err.message === 'unbound symbol: missing' &&
      err.line === 15 &&
      err.col === 42;
  });

  // Unbound symbol without node or with partial node info
  assert.throws(() => {
    lookup(child, 'missing');
  }, (err) => {
    return err instanceof WeftError &&
      err.message === 'unbound symbol: missing' &&
      err.line === null &&
      err.col === null;
  });

  // Additional boundary conditions and mutation-adequacy tests
  define(g, 'nilval', null);
  assert.equal(lookup(g, 'nilval'), null);

  define(g, 'falsy', false);
  assert.equal(lookup(g, 'falsy'), false);

  // Deeply chained environments (3 levels)
  const grandchild = { parent: child, vars: new Map() };
  define(grandchild, 'deep', 777);
  assert.equal(lookup(grandchild, 'deep'), 777);
  assert.equal(lookup(grandchild, 'y'), 100); // from child
  assert.equal(lookup(grandchild, 'x'), 999); // shadowed in child
  assert.equal(lookup(grandchild, 'x', { line: 4, col: 4 }), 999);

  assert.throws(() => {
    lookup(grandchild, 'nonexistent', { line: 20, col: 10 });
  }, (err) => err instanceof WeftError && err.message === 'unbound symbol: nonexistent' && err.line === 20 && err.col === 10);
});
