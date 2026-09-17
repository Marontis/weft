import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, newGlobalEnv, WeftError } from '../src/index.mjs';

// @attest WFT-MATH mutates=src/builtins-math.mjs
test('stdlib-math: mod, floor, ceil, abs, min, max through evaluate with exact values, error positions, and boundaries', () => {
  // -------------------------------------------------------------
  // 1. mod (JS % sign semantics on negatives and positives)
  // -------------------------------------------------------------
  assert.equal(evaluate('(mod 5 3)'), 2);
  assert.equal(evaluate('(mod -5 3)'), -2);
  assert.equal(evaluate('(mod 5 -3)'), 2);
  assert.equal(evaluate('(mod -5 -3)'), -2);
  assert.equal(evaluate('(mod 0 5)'), 0);
  assert.equal(evaluate('(mod 5 5)'), 0);
  assert.equal(evaluate('(mod -0 5)'), 0);
  assert.equal(evaluate('(mod 5.5 2)'), 1.5);
  assert.equal(evaluate('(mod -5.5 2)'), -1.5);

  // mod arity errors
  assert.throws(() => {
    evaluate('(mod)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(mod 5)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 1');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(mod 5 3 1)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 3');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // mod division by zero
  assert.throws(() => {
    evaluate('(mod 5 0)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'division by zero');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(mod -5 0)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'division by zero');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // mod type errors
  assert.throws(() => {
    evaluate('(mod "5" 3)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(mod 5 "3")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(mod nil 3)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // -------------------------------------------------------------
  // 2. floor
  // -------------------------------------------------------------
  assert.equal(evaluate('(floor 3.7)'), 3);
  assert.equal(evaluate('(floor 3.2)'), 3);
  assert.equal(evaluate('(floor -3.2)'), -4);
  assert.equal(evaluate('(floor -3.7)'), -4);
  assert.equal(evaluate('(floor 5)'), 5);
  assert.equal(evaluate('(floor -5)'), -5);
  assert.equal(evaluate('(floor 0)'), 0);
  assert.equal(evaluate('(floor -0)'), 0);

  // floor arity errors
  assert.throws(() => {
    evaluate('(floor)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(floor 1 2)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // floor type errors
  assert.throws(() => {
    evaluate('(floor "3.5")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(floor false)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // -------------------------------------------------------------
  // 3. ceil
  // -------------------------------------------------------------
  assert.equal(evaluate('(ceil 3.2)'), 4);
  assert.equal(evaluate('(ceil 3.7)'), 4);
  assert.equal(evaluate('(ceil -3.2)'), -3);
  assert.equal(evaluate('(ceil -3.7)'), -3);
  assert.equal(evaluate('(ceil 5)'), 5);
  assert.equal(evaluate('(ceil -5)'), -5);
  assert.equal(evaluate('(ceil 0)'), 0);
  assert.equal(evaluate('(ceil -0)'), 0);

  // ceil arity errors
  assert.throws(() => {
    evaluate('(ceil)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(ceil 1 2)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // ceil type errors
  assert.throws(() => {
    evaluate('(ceil "3.5")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(ceil nil)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // -------------------------------------------------------------
  // 4. abs
  // -------------------------------------------------------------
  assert.equal(evaluate('(abs 5)'), 5);
  assert.equal(evaluate('(abs -5)'), 5);
  assert.equal(evaluate('(abs 3.14)'), 3.14);
  assert.equal(evaluate('(abs -3.14)'), 3.14);
  assert.equal(evaluate('(abs 0)'), 0);
  assert.equal(evaluate('(abs -0)'), 0);

  // abs arity errors
  assert.throws(() => {
    evaluate('(abs)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(abs 1 2)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // abs type errors
  assert.throws(() => {
    evaluate('(abs "-5")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(abs true)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // -------------------------------------------------------------
  // 5. min (1 and several args)
  // -------------------------------------------------------------
  assert.equal(evaluate('(min 42)'), 42);
  assert.equal(evaluate('(min -42)'), -42);
  assert.equal(evaluate('(min 5 2 8 1 9)'), 1);
  assert.equal(evaluate('(min -5 -2 -8 -1 -9)'), -9);
  assert.equal(evaluate('(min 3.14 2.71 1.41)'), 1.41);
  assert.equal(evaluate('(min 0)'), 0);

  // min arity errors (0 args)
  assert.throws(() => {
    evaluate('(min)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected at least 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // min type errors
  assert.throws(() => {
    evaluate('(min 5 "2")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(min nil)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // -------------------------------------------------------------
  // 6. max (1 and several args)
  // -------------------------------------------------------------
  assert.equal(evaluate('(max 42)'), 42);
  assert.equal(evaluate('(max -42)'), -42);
  assert.equal(evaluate('(max 5 2 8 1 9)'), 9);
  assert.equal(evaluate('(max -5 -2 -8 -1 -9)'), -1);
  assert.equal(evaluate('(max 3.14 2.71 1.41)'), 3.14);
  assert.equal(evaluate('(max 0)'), 0);

  // max arity errors (0 args)
  assert.throws(() => {
    evaluate('(max)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected at least 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // max type errors
  assert.throws(() => {
    evaluate('(max 5 "10")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(max false)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // -------------------------------------------------------------
  // 7. Error positions with line/col and multi-line offsets
  // -------------------------------------------------------------
  assert.throws(() => {
    evaluate('\n\n    (floor "abc")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 3);
    assert.equal(err.col, 6);
    return true;
  });

  assert.throws(() => {
    evaluate('\n\n      (min)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected at least 1, got 0');
    assert.equal(err.line, 3);
    assert.equal(err.col, 8);
    return true;
  });
});
