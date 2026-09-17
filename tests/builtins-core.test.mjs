import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, run, newGlobalEnv, WeftError, tokenize, parse } from '../src/index.mjs';

// @attest WFT-CORE mutates=src/builtins-core.mjs
test('builtins-core: + - * / variadic, unary, div-by-zero, deep =, chained < > <= >=, not, str, print', () => {
  // -------------------------------------------------------------
  // 1. Addition (+)
  // -------------------------------------------------------------
  assert.equal(evaluate('(+)'), 0);
  assert.equal(evaluate('(+ 42)'), 42);
  assert.equal(evaluate('(+ 1 2)'), 3);
  assert.equal(evaluate('(+ 1 2 3 4 5)'), 15);
  assert.equal(evaluate('(+ -5 10 -2.5)'), 2.5);
  assert.equal(evaluate('(+ 0 0)'), 0);
  assert.equal(evaluate('(+ -0 0)'), 0);
  assert.equal(evaluate('(+ 5 -5)'), 0);

  // -------------------------------------------------------------
  // 2. Subtraction (-)
  // -------------------------------------------------------------
  // Arity error on 0 args
  assert.throws(() => {
    evaluate('(-)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected at least 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Unary minus negation
  assert.equal(evaluate('(- 5)'), -5);
  assert.equal(evaluate('(- -7)'), 7);
  assert.equal(evaluate('(- 0)'), 0);
  assert.equal(evaluate('(- -0)'), 0);
  assert.equal(evaluate('(- 3.14)'), -3.14);

  // Variadic subtraction
  assert.equal(evaluate('(- 10 3)'), 7);
  assert.equal(evaluate('(- 20 5 3 2)'), 10);
  assert.equal(evaluate('(- 5.5 1.5)'), 4);
  assert.equal(evaluate('(- 5 5)'), 0);

  // -------------------------------------------------------------
  // 3. Multiplication (*)
  // -------------------------------------------------------------
  assert.equal(evaluate('(*)'), 1);
  assert.equal(evaluate('(* 7)'), 7);
  assert.equal(evaluate('(* 2 3)'), 6);
  assert.equal(evaluate('(* 2 3 4 5)'), 120);
  assert.equal(evaluate('(* -2 3.5)'), -7);
  assert.equal(evaluate('(* 0 100)'), 0);
  assert.equal(evaluate('(* -5 0)'), 0);

  // -------------------------------------------------------------
  // 4. Division (/)
  // -------------------------------------------------------------
  // Arity error on 0 args
  assert.throws(() => {
    evaluate('(/)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected at least 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Unary reciprocal: (/ x) -> 1/x
  assert.equal(evaluate('(/ 1)'), 1);
  assert.equal(evaluate('(/ 2)'), 0.5);
  assert.equal(evaluate('(/ 4)'), 0.25);
  assert.equal(evaluate('(/ -2)'), -0.5);

  // Variadic division
  assert.equal(evaluate('(/ 10 2)'), 5);
  assert.equal(evaluate('(/ 100 2 5)'), 10);
  assert.equal(evaluate('(/ 0 5)'), 0);

  // Division by zero in unary (/ 0)
  assert.throws(() => {
    evaluate('(/ 0)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'division by zero');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Division by zero in binary (/ 10 0)
  assert.throws(() => {
    evaluate('(/ 10 0)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'division by zero');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Division by zero in chained (/ 100 2 0)
  assert.throws(() => {
    evaluate('(/ 100 2 0)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'division by zero');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Division by zero with custom line and col positions
  assert.throws(() => {
    evaluate('\n  (/ 10 0)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'division by zero');
    assert.equal(err.line, 2);
    assert.equal(err.col, 4);
    return true;
  });

  // -------------------------------------------------------------
  // 5. Deep Structural Equality (=)
  // -------------------------------------------------------------
  // Arity errors
  assert.throws(() => {
    evaluate('(=)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected at least 2, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(= 1)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected at least 2, got 1');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Numbers
  assert.equal(evaluate('(= 42 42)'), true);
  assert.equal(evaluate('(= 42 43)'), false);
  assert.equal(evaluate('(= 0 -0)'), true);
  assert.equal(evaluate('(= 3.14 3.14)'), true);
  assert.equal(evaluate('(= 3.14 3.15)'), false);
  assert.equal(evaluate('(= 1 1 1)'), true);
  assert.equal(evaluate('(= 1 1 2)'), false);
  assert.equal(evaluate('(= 1 2 1)'), false);

  // Strings
  assert.equal(evaluate('(= "hello" "hello")'), true);
  assert.equal(evaluate('(= "hello" "world")'), false);
  assert.equal(evaluate('(= "" "")'), true);
  assert.equal(evaluate('(= "a" "a" "a")'), true);
  assert.equal(evaluate('(= "a" "a" "b")'), false);

  // Booleans
  assert.equal(evaluate('(= true true)'), true);
  assert.equal(evaluate('(= false false)'), true);
  assert.equal(evaluate('(= true false)'), false);
  assert.equal(evaluate('(= true true true)'), true);
  assert.equal(evaluate('(= true true false)'), false);

  // Nil
  assert.equal(evaluate('(= nil nil)'), true);
  assert.equal(evaluate('(= nil nil nil)'), true);

  // Cross-type comparisons
  assert.equal(evaluate('(= nil false)'), false);
  assert.equal(evaluate('(= false nil)'), false);
  assert.equal(evaluate('(= 0 false)'), false);
  assert.equal(evaluate('(= false 0)'), false);
  assert.equal(evaluate('(= 0 nil)'), false);
  assert.equal(evaluate('(= nil 0)'), false);
  assert.equal(evaluate('(= "" false)'), false);
  assert.equal(evaluate('(= "" nil)'), false);
  assert.equal(evaluate('(= 42 "42")'), false);
  assert.equal(evaluate('(= "42" 42)'), false);
  assert.equal(evaluate('(= \'() nil)'), false);
  assert.equal(evaluate('(= nil \'())'), false);
  assert.equal(evaluate('(= \'() false)'), false);
  assert.equal(evaluate('(= \'() 42)'), false);
  assert.equal(evaluate('(= 42 \'())'), false);

  // Deep structural lists
  assert.equal(evaluate('(= \'() \'())'), true);
  assert.equal(evaluate('(= \'(1 2 3) \'(1 2 3))'), true);
  assert.equal(evaluate('(= \'(1 (2 (3 4))) \'(1 (2 (3 4))))'), true);
  assert.equal(evaluate('(= \'(1 2) \'(1 3))'), false);
  assert.equal(evaluate('(= \'(1 2) \'(1 2 3))'), false);
  assert.equal(evaluate('(= \'(1 2 3) \'(1 2))'), false);
  assert.equal(evaluate('(= \'(1 (2 3)) \'(1 (2 4)))'), false);
  assert.equal(evaluate('(= \'(1 (2 (3))) \'(1 (2 (4))))'), false);
  assert.equal(evaluate('(= \'(1 2 3) \'(1 2 3) \'(1 2 3))'), true);
  assert.equal(evaluate('(= \'(1 2 3) \'(1 2 3) \'(1 2 4))'), false);

  // -------------------------------------------------------------
  // 6. Chained Comparisons (< > <= >=)
  // -------------------------------------------------------------
  for (const op of ['<', '>', '<=', '>=']) {
    // Arity errors
    assert.throws(() => {
      evaluate(`(${op})`);
    }, (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message, 'arity: expected at least 2, got 0');
      assert.equal(err.line, 1);
      assert.equal(err.col, 2);
      return true;
    });

    assert.throws(() => {
      evaluate(`(${op} 1)`);
    }, (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message, 'arity: expected at least 2, got 1');
      assert.equal(err.line, 1);
      assert.equal(err.col, 2);
      return true;
    });

    // Number-only type checks
    assert.throws(() => {
      evaluate(`(${op} 1 "2")`);
    }, (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message, 'expected number');
      assert.equal(err.line, 1);
      assert.equal(err.col, 2);
      return true;
    });

    assert.throws(() => {
      evaluate(`(${op} "1" 2)`);
    }, (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message, 'expected number');
      assert.equal(err.line, 1);
      assert.equal(err.col, 2);
      return true;
    });

    assert.throws(() => {
      evaluate(`(${op} 1 nil)`);
    }, (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message, 'expected number');
      assert.equal(err.line, 1);
      assert.equal(err.col, 2);
      return true;
    });

    assert.throws(() => {
      evaluate(`(${op} true 1)`);
    }, (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message, 'expected number');
      assert.equal(err.line, 1);
      assert.equal(err.col, 2);
      return true;
    });

    assert.throws(() => {
      evaluate(`(${op} \'() 1)`);
    }, (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message, 'expected number');
      assert.equal(err.line, 1);
      assert.equal(err.col, 2);
      return true;
    });

    assert.throws(() => {
      evaluate(`(${op} 1 2 "3")`);
    }, (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message, 'expected number');
      assert.equal(err.line, 1);
      assert.equal(err.col, 2);
      return true;
    });
  }

  // <
  assert.equal(evaluate('(< 1 2)'), true);
  assert.equal(evaluate('(< 2 1)'), false);
  assert.equal(evaluate('(< 2 2)'), false);
  assert.equal(evaluate('(< 1 2 3 4)'), true);
  assert.equal(evaluate('(< 1 2 2 4)'), false);
  assert.equal(evaluate('(< 1 3 2 4)'), false);
  assert.equal(evaluate('(< -5 -2 0 3)'), true);

  // >
  assert.equal(evaluate('(> 2 1)'), true);
  assert.equal(evaluate('(> 1 2)'), false);
  assert.equal(evaluate('(> 2 2)'), false);
  assert.equal(evaluate('(> 4 3 2 1)'), true);
  assert.equal(evaluate('(> 4 3 3 1)'), false);
  assert.equal(evaluate('(> 4 2 3 1)'), false);
  assert.equal(evaluate('(> 3 0 -2 -5)'), true);

  // <=
  assert.equal(evaluate('(<= 1 2)'), true);
  assert.equal(evaluate('(<= 2 2)'), true);
  assert.equal(evaluate('(<= 3 2)'), false);
  assert.equal(evaluate('(<= 1 2 2 3)'), true);
  assert.equal(evaluate('(<= 1 2 1 3)'), false);
  assert.equal(evaluate('(<= -3 -3 0 0 5)'), true);

  // >=
  assert.equal(evaluate('(>= 2 1)'), true);
  assert.equal(evaluate('(>= 2 2)'), true);
  assert.equal(evaluate('(>= 1 2)'), false);
  assert.equal(evaluate('(>= 3 2 2 1)'), true);
  assert.equal(evaluate('(>= 3 1 2 1)'), false);
  assert.equal(evaluate('(>= 5 0 0 -3 -3)'), true);

  // -------------------------------------------------------------
  // 7. Not
  // -------------------------------------------------------------
  // Arity
  assert.throws(() => {
    evaluate('(not)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(not true false)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Truthiness: only false and nil are falsy
  assert.equal(evaluate('(not false)'), true);
  assert.equal(evaluate('(not nil)'), true);
  assert.equal(evaluate('(not true)'), false);
  assert.equal(evaluate('(not 0)'), false, '0 is truthy');
  assert.equal(evaluate('(not "")'), false, '"" is truthy');
  assert.equal(evaluate('(not \'())'), false, '() is truthy');
  assert.equal(evaluate('(not 42)'), false);
  assert.equal(evaluate('(not "hello")'), false);

  // -------------------------------------------------------------
  // 8. Str
  // -------------------------------------------------------------
  assert.equal(evaluate('(str)'), '');
  assert.equal(evaluate('(str "hello")'), 'hello');
  assert.equal(evaluate('(str 42)'), '42');
  assert.equal(evaluate('(str 42.5)'), '42.5');
  assert.equal(evaluate('(str -7)'), '-7');
  assert.equal(evaluate('(str true)'), 'true');
  assert.equal(evaluate('(str false)'), 'false');
  assert.equal(evaluate('(str nil)'), 'nil');
  assert.equal(evaluate('(str \'())'), '()');
  assert.equal(evaluate('(str \'(1 2))'), '(1 2)');
  assert.equal(evaluate('(str "a" 1 "b" nil "c" true)'), 'a1bnilctrue');
  assert.equal(evaluate('(str "sum is: " (+ 10 20))'), 'sum is: 30');

  // -------------------------------------------------------------
  // 9. Print
  // -------------------------------------------------------------
  const env = newGlobalEnv();
  const r0 = evaluate('(print)', env);
  assert.equal(r0, null);
  const r1 = evaluate('(print 42)', env);
  assert.equal(r1, null);
  const r2 = evaluate('(print "hello" "world")', env);
  assert.equal(r2, null);
  const r3 = evaluate('(print \'(1 2) nil true)', env);
  assert.equal(r3, null);
  const r4 = evaluate('(print "a" "b" "c")', env);
  assert.equal(r4, null);

  assert.deepEqual(env.__out, [
    '\n',
    '42\n',
    'hello world\n',
    '(1 2) nil true\n',
    'a b c\n'
  ]);

  // Nested scope delegation to global __out
  const env2 = newGlobalEnv();
  evaluate('(let ((x 10)) (print "let:" x))', env2);
  evaluate('((fn (msg) (print "fn:" msg)) "working")', env2);
  assert.deepEqual(env2.__out, [
    'let: 10\n',
    'fn: working\n'
  ]);

  // -------------------------------------------------------------
  // 10. Public API exports and run() helper
  // -------------------------------------------------------------
  assert.equal(typeof tokenize, 'function');
  assert.equal(typeof parse, 'function');
  assert.equal(typeof WeftError, 'function');
  assert.equal(typeof newGlobalEnv, 'function');
  assert.equal(typeof evaluate, 'function');
  assert.equal(typeof run, 'function');

  const res1 = run('(print "foo") (print 1 2) 99');
  assert.equal(res1.value, 99);
  assert.equal(res1.output, 'foo\n1 2\n');

  const res2 = run('(str "hello" " " "world")');
  assert.equal(res2.value, 'hello world');
  assert.equal(res2.output, '');

  const res3 = run('');
  assert.equal(res3.value, null);
  assert.equal(res3.output, '');

  // evaluate with fresh env
  const val1 = evaluate('(def created_in_eval 123)');
  assert.equal(val1, 123);
  assert.throws(() => {
    evaluate('created_in_eval');
  }, (err) => err instanceof WeftError && err.message === 'unbound symbol: created_in_eval');
});
