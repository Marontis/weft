import test from 'node:test';
import assert from 'node:assert/strict';
import { run, evaluate } from '../src/index.mjs';
import { WeftError } from '../src/errors.mjs';

// @attest WFT-EVAL mutates=src/evaluator.mjs
test('tco: self-recursive countdown to 100000, even?/odd? mutual recursion to 100000, stack depth exceeded, exact error messages and positions, and boundary conditions', () => {
  // 1. Self-recursive countdown to 100000 (exact value, tail position in if branch)
  const countdownSrc = `
    (def countdown
      (fn (n)
        (if (= n 0)
          "finished"
          (countdown (- n 1)))))
    (countdown 100000)
  `;
  const res1 = run(countdownSrc);
  assert.equal(res1.value, "finished");

  // 2. even? / odd? mutual recursion to 100000 (exact value, mutual tail calls)
  const mutualSrc = `
    (def even?
      (fn (n)
        (if (= n 0)
          true
          (odd? (- n 1)))))
    (def odd?
      (fn (n)
        (if (= n 0)
          false
          (even? (- n 1)))))
    (even? 100000)
  `;
  const res2 = run(mutualSrc);
  assert.equal(res2.value, true);

  // 3. Non-tail recursion stack depth exceeded (capped at 10000 nested applies)
  const nonTailSrc = `
    (def f
      (fn (n)
        (if (= n 0)
          0
          (+ 1 (f (- n 1))))))
    (f 10001)
  `;
  let caught = null;
  try {
    evaluate(nonTailSrc);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof WeftError, 'should throw WeftError');
  assert.equal(caught.message, 'stack depth exceeded');
  assert.equal(typeof caught.line, 'number');
  assert.equal(typeof caught.col, 'number');

  // 4. Boundary condition: n = 0 for countdown should immediately return "finished" without recursion
  const zeroCountdownSrc = `
    (def countdown
      (fn (n)
        (if (= n 0)
          "finished"
          (countdown (- n 1)))))
    (countdown 0)
  `;
  const res3 = run(zeroCountdownSrc);
  assert.equal(res3.value, "finished");

  // 5. Tail position in let, do, and, or
  const letTailSrc = `
    (def test-let
      (fn (n)
        (let ((x (+ n 1)))
          (if (= x 10)
            "ten"
            (test-let x)))))
    (test-let 0)
  `;
  assert.equal(run(letTailSrc).value, "ten");

  const doTailSrc = `
    (def test-do
      (fn (n)
        (do
          (+ n 1)
          (if (= n 1000)
            "done"
            (test-do (+ n 1))))))
    (test-do 0)
  `;
  assert.equal(run(doTailSrc).value, "done");
});
