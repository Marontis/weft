import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../src/render.mjs';

// @attest WFT-RENDER mutates=src/render.mjs
test('render: 42 vs 42.5, negatives/fractions, strings verbatim, nil, booleans, nested lists, functions <fn>', () => {
  // 1. Numbers: 42 vs 42.5, negative integers, negative fractions
  assert.equal(render(42), '42');
  assert.equal(render(42.0), '42');
  assert.equal(render(42.5), '42.5');
  assert.equal(render(-7), '-7');
  assert.equal(render(-0.5), '-0.5');
  assert.equal(render(0), '0');
  assert.equal(render(-0), '0');
  assert.equal(render(1e3), '1000');
  assert.equal(render(NaN), 'NaN');
  assert.equal(render(Infinity), 'Infinity');

  // 2. Strings verbatim (no quotes)
  assert.equal(render('hello'), 'hello');
  assert.equal(render('hello world'), 'hello world');
  assert.equal(render(''), '');
  assert.equal(render('\"quoted\"'), '\"quoted\"');
  assert.equal(render('\n'), '\n');

  // 3. Nil
  assert.equal(render(null), 'nil');

  // 4. Booleans
  assert.equal(render(true), 'true');
  assert.equal(render(false), 'false');

  // 5. Nested lists
  assert.equal(render([]), '()');
  assert.equal(render([1, 2, 3]), '(1 2 3)');
  assert.equal(render(['a', [true, null, 3.14], 'b']), '(a (true nil 3.14) b)');
  assert.equal(render([[]]), '(())');

  // 6. Functions <fn>
  assert.equal(render({ kind: 'builtin', name: '+', fn: () => {} }), '<fn>');
  assert.equal(render({ kind: 'closure', params: [], body: [], env: {} }), '<fn>');
  
  // 7. Fallback / unexpected values
  assert.equal(render(undefined), 'undefined');
});
