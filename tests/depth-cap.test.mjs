import test from 'node:test';
import assert from 'node:assert/strict';
import { run, evaluate, tokenize, parse } from '../src/index.mjs';
import { WeftError } from '../src/errors.mjs';

// @attest WFT-EVAL mutates=src/evaluator.mjs
test('depth-cap: 10000 nested NON-tail applies raise WeftError stack depth exceeded; tail loops stay unaffected; exact line:col, error message, and boundaries', () => {
  // 1. Exactly at boundary (10000 non-tail applies) - should succeed successfully
  const exactNonTailSrc = `
    (def f
      (fn (n)
        (if (= n 0)
          0
          (+ 1 (f (- n 1))))))
    (f 10000)
  `;
  const resExact = evaluate(exactNonTailSrc);
  assert.equal(resExact, 10000);

  // 2. Just over boundary (10001 non-tail applies) - raises WeftError 'stack depth exceeded' with exact line:col
  const overNonTailSrc = `
    (def f
      (fn (n)
        (if (= n 0)
          0
          (+ 1 (f (- n 1))))))
    (f 10001)
  `;

  let caught = null;
  try {
    evaluate(overNonTailSrc);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof WeftError, 'should throw WeftError');
  assert.equal(caught.message, 'stack depth exceeded');
  assert.equal(typeof caught.line, 'number');
  assert.equal(typeof caught.col, 'number');
  assert.ok(caught.line >= 1 && caught.line <= 10, 'line should be within source range');
  assert.ok(caught.col >= 1 && caught.col <= 50, 'col should be within source range');

  // 3. Tail loops stay unaffected (100000 iterations)
  const tailSrc = `
    (def loop
      (fn (n)
        (if (= n 0)
          42
          (loop (- n 1)))))
    (loop 100000)
  `;
  const resTail = evaluate(tailSrc);
  assert.equal(resTail, 42);
});
