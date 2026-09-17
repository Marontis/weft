import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, newGlobalEnv, WeftError } from '../src/index.mjs';

// @attest WFT-LISTS mutates=src/builtins-lists.mjs
test('stdlib-lists: list, head, tail, cons, len, nth, concat, reverse, map, filter, reduce with exact values, error positions, and non-mutation', () => {
  // -------------------------------------------------------------
  // 1. list
  // -------------------------------------------------------------
  assert.deepEqual(evaluate('(list)'), []);
  assert.deepEqual(evaluate('(list 42)'), [42]);
  assert.deepEqual(evaluate('(list 1 2 3)'), [1, 2, 3]);
  assert.deepEqual(evaluate('(list "hello" true false nil)'), ['hello', true, false, null]);
  assert.deepEqual(evaluate('(list (+ 1 2) (* 3 4))'), [3, 12]);
  assert.deepEqual(evaluate('(list (list 1 2) (list 3 4))'), [[1, 2], [3, 4]]);

  // -------------------------------------------------------------
  // 2. head
  // -------------------------------------------------------------
  assert.equal(evaluate('(head \'(42))'), 42);
  assert.equal(evaluate('(head \'(1 2 3))'), 1);
  assert.equal(evaluate('(head \'("first" "second"))'), 'first');
  assert.deepEqual(evaluate('(head \'((1 2) 3 4))'), [1, 2]);
  assert.equal(evaluate('(head (list false true))'), false);
  assert.equal(evaluate('(head (list nil 10))'), null);

  // Arity errors
  assert.throws(() => {
    evaluate('(head)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(head \'(1) \'(2))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type error: expected list
  assert.throws(() => {
    evaluate('(head 42)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(head "string")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(head nil)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Empty list error
  assert.throws(() => {
    evaluate('(head \'())');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'empty list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(head (list))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'empty list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('\n  (head \'())');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'empty list');
    assert.equal(err.line, 2);
    assert.equal(err.col, 4);
    return true;
  });

  // -------------------------------------------------------------
  // 3. tail
  // -------------------------------------------------------------
  assert.deepEqual(evaluate('(tail \'(1 2 3))'), [2, 3]);
  assert.deepEqual(evaluate('(tail \'(1))'), []);
  assert.deepEqual(evaluate('(tail \'("a" "b" "c"))'), ['b', 'c']);
  assert.deepEqual(evaluate('(tail \'((1 2) (3 4)) )'), [[3, 4]]);

  // Arity errors
  assert.throws(() => {
    evaluate('(tail)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(tail \'(1) \'(2))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type error: expected list
  assert.throws(() => {
    evaluate('(tail 100)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(tail "text")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Empty list error
  assert.throws(() => {
    evaluate('(tail \'())');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'empty list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(tail (list))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'empty list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('\n   (tail \'())');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'empty list');
    assert.equal(err.line, 2);
    assert.equal(err.col, 5);
    return true;
  });

  // -------------------------------------------------------------
  // 4. cons
  // -------------------------------------------------------------
  assert.deepEqual(evaluate('(cons 1 \'(2 3))'), [1, 2, 3]);
  assert.deepEqual(evaluate('(cons 1 \'())'), [1]);
  assert.deepEqual(evaluate('(cons 1 (list))'), [1]);
  assert.deepEqual(evaluate('(cons "a" \'("b" "c"))'), ['a', 'b', 'c']);
  assert.deepEqual(evaluate('(cons nil \'(1 2))'), [null, 1, 2]);
  assert.deepEqual(evaluate('(cons false (list true))'), [false, true]);
  assert.deepEqual(evaluate('(cons \'(1 2) \'(3 4))'), [[1, 2], 3, 4]);

  // Arity errors
  assert.throws(() => {
    evaluate('(cons)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(cons 1)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 1');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(cons 1 \'(2) 3)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 3');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type error: second arg must be list
  assert.throws(() => {
    evaluate('(cons 1 2)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(cons 1 "str")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(cons 1 nil)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // -------------------------------------------------------------
  // 5. len
  // -------------------------------------------------------------
  assert.equal(evaluate('(len \'())'), 0);
  assert.equal(evaluate('(len (list))'), 0);
  assert.equal(evaluate('(len \'(42))'), 1);
  assert.equal(evaluate('(len \'(1 2 3 4 5))'), 5);
  assert.equal(evaluate('(len \'((1 2) (3 4)))'), 2);

  // Arity errors
  assert.throws(() => {
    evaluate('(len)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(len \'() \'())');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type error
  assert.throws(() => {
    evaluate('(len 42)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(len "string")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // -------------------------------------------------------------
  // 6. nth
  // -------------------------------------------------------------
  assert.equal(evaluate('(nth \'(10 20 30) 0)'), 10);
  assert.equal(evaluate('(nth \'(10 20 30) 1)'), 20);
  assert.equal(evaluate('(nth \'(10 20 30) 2)'), 30);
  assert.equal(evaluate('(nth \'("alpha" "beta") 1)'), 'beta');
  assert.deepEqual(evaluate('(nth \'((1 2) (3 4)) 0)'), [1, 2]);
  assert.equal(evaluate('(nth (list nil false 42) 0)'), null);
  assert.equal(evaluate('(nth (list nil false 42) 1)'), false);
  assert.equal(evaluate('(nth (list nil false 42) 2)'), 42);

  // Arity errors
  assert.throws(() => {
    evaluate('(nth)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(nth \'(1))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 1');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(nth \'(1) 0 99)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 3');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type errors
  assert.throws(() => {
    evaluate('(nth 42 0)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(nth \'(1 2) "0")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(nth \'(1 2) nil)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Out of range errors
  assert.throws(() => {
    evaluate('(nth \'() 0)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'index out of range');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(nth \'(1 2) 2)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'index out of range');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(nth \'(1 2) 5)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'index out of range');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(nth \'(1 2) -1)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'index out of range');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(nth \'(1 2) 0.5)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'index out of range');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('\n    (nth \'(1 2) 5)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'index out of range');
    assert.equal(err.line, 2);
    assert.equal(err.col, 6);
    return true;
  });

  // -------------------------------------------------------------
  // 7. concat
  // -------------------------------------------------------------
  assert.deepEqual(evaluate('(concat)'), []);
  assert.deepEqual(evaluate('(concat \'())'), []);
  assert.deepEqual(evaluate('(concat \'(1 2))'), [1, 2]);
  assert.deepEqual(evaluate('(concat \'(1 2) \'(3 4))'), [1, 2, 3, 4]);
  assert.deepEqual(evaluate('(concat \'(1) \'(2) \'(3 4) \'())'), [1, 2, 3, 4]);
  assert.deepEqual(evaluate('(concat \'() \'(1 2) \'())'), [1, 2]);

  // Type error
  assert.throws(() => {
    evaluate('(concat 42)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(concat \'(1 2) "string")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(concat nil \'(1 2))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // -------------------------------------------------------------
  // 8. reverse
  // -------------------------------------------------------------
  assert.deepEqual(evaluate('(reverse \'())'), []);
  assert.deepEqual(evaluate('(reverse \'(1))'), [1]);
  assert.deepEqual(evaluate('(reverse \'(1 2 3))'), [3, 2, 1]);
  assert.deepEqual(evaluate('(reverse \'(1 2 3 4 5))'), [5, 4, 3, 2, 1]);
  assert.deepEqual(evaluate('(reverse \'("a" "b" "c"))'), ['c', 'b', 'a']);

  // Arity errors
  assert.throws(() => {
    evaluate('(reverse)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(reverse \'(1) \'(2))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type error
  assert.throws(() => {
    evaluate('(reverse 42)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // -------------------------------------------------------------
  // 9. Non-mutation guarantees
  // -------------------------------------------------------------
  const env = newGlobalEnv();
  evaluate('(def xs \'(10 20 30))', env);

  const headRes = evaluate('(head xs)', env);
  assert.equal(headRes, 10);
  assert.deepEqual(evaluate('xs', env), [10, 20, 30]);

  const tailRes = evaluate('(tail xs)', env);
  assert.deepEqual(tailRes, [20, 30]);
  assert.deepEqual(evaluate('xs', env), [10, 20, 30]);

  const consRes = evaluate('(cons 5 xs)', env);
  assert.deepEqual(consRes, [5, 10, 20, 30]);
  assert.deepEqual(evaluate('xs', env), [10, 20, 30]);

  const nthRes = evaluate('(nth xs 1)', env);
  assert.equal(nthRes, 20);
  assert.deepEqual(evaluate('xs', env), [10, 20, 30]);

  const revRes = evaluate('(reverse xs)', env);
  assert.deepEqual(revRes, [30, 20, 10]);
  assert.deepEqual(evaluate('xs', env), [10, 20, 30]);

  const catRes1 = evaluate('(concat xs \'(40 50))', env);
  assert.deepEqual(catRes1, [10, 20, 30, 40, 50]);
  assert.deepEqual(evaluate('xs', env), [10, 20, 30]);

  const catRes2 = evaluate('(concat \'(1 2) xs)', env);
  assert.deepEqual(catRes2, [1, 2, 10, 20, 30]);
  assert.deepEqual(evaluate('xs', env), [10, 20, 30]);

  const mapRes = evaluate('(map (fn (x) (* x 2)) xs)', env);
  assert.deepEqual(mapRes, [20, 40, 60]);
  assert.deepEqual(evaluate('xs', env), [10, 20, 30]);

  const filterRes = evaluate('(filter (fn (x) (> x 15)) xs)', env);
  assert.deepEqual(filterRes, [20, 30]);
  assert.deepEqual(evaluate('xs', env), [10, 20, 30]);

  const reduceRes = evaluate('(reduce + 0 xs)', env);
  assert.equal(reduceRes, 60);
  assert.deepEqual(evaluate('xs', env), [10, 20, 30]);

  // Modifying JS array returned by concat does not mutate the other
  evaluate('(def c (concat xs \'(40)))', env);
  assert.deepEqual(evaluate('xs', env), [10, 20, 30]);
  assert.deepEqual(evaluate('c', env), [10, 20, 30, 40]);

  // -------------------------------------------------------------
  // 10. map
  // -------------------------------------------------------------
  assert.deepEqual(evaluate('(map (fn (x) (* x 2)) \'(1 2 3 4))'), [2, 4, 6, 8]);
  assert.deepEqual(evaluate('(map (fn (x) (+ x 1)) \'())'), []);
  assert.deepEqual(evaluate('(map (fn (s) (str s "!")) \'("a" "b" "c"))'), ['a!', 'b!', 'c!']);

  // Closures capturing outer scope
  assert.deepEqual(evaluate(`
    (let ((factor 5))
      (map (fn (x) (* x factor)) '(1 2 3)))
  `), [5, 10, 15]);

  // Mapping with builtins
  assert.deepEqual(evaluate('(map len \'(() (1) (1 2) (1 2 3)))'), [0, 1, 2, 3]);
  assert.deepEqual(evaluate('(map head \'((1 2) (3 4) (5 6)) )'), [1, 3, 5]);

  // Arity errors
  assert.throws(() => {
    evaluate('(map)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(map (fn (x) x))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 1');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(map (fn (x) x) \'() \'())');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 3');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type errors
  assert.throws(() => {
    evaluate('(map 42 \'())');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'not a function');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(map (fn (x) x) 42)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Closure parameter arity error during map
  assert.throws(() => {
    evaluate('(map (fn (a b) (+ a b)) \'(1 2 3))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 1');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // -------------------------------------------------------------
  // 11. filter
  // -------------------------------------------------------------
  assert.deepEqual(evaluate('(filter (fn (x) (> x 2)) \'(1 2 3 4 5))'), [3, 4, 5]);
  assert.deepEqual(evaluate('(filter (fn (x) (< x 0)) \'(1 2 3))'), []);
  assert.deepEqual(evaluate('(filter (fn (x) true) \'(1 2 3))'), [1, 2, 3]);
  assert.deepEqual(evaluate('(filter (fn (x) true) \'())'), []);

  // Closures capturing outer scope
  assert.deepEqual(evaluate(`
    (let ((threshold 10))
      (filter (fn (x) (> x threshold)) '(5 10 15 20)))
  `), [15, 20]);

  // Truthiness boundaries in filter:
  // 0 and "" are TRUTHY in Weft; false and nil are FALSY.
  assert.deepEqual(evaluate('(filter (fn (x) 0) \'(10 20))'), [10, 20]);
  assert.deepEqual(evaluate('(filter (fn (x) "") \'(10 20))'), [10, 20]);
  assert.deepEqual(evaluate('(filter (fn (x) false) \'(10 20))'), []);
  assert.deepEqual(evaluate('(filter (fn (x) nil) \'(10 20))'), []);

  // Filter with identity-like closure: only false and nil are removed
  assert.deepEqual(
    evaluate('(filter (fn (x) x) (list true false nil 0 "" 42 "hello"))'),
    [true, 0, '', 42, 'hello']
  );

  // Arity errors
  assert.throws(() => {
    evaluate('(filter)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(filter (fn (x) x))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 1');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(filter (fn (x) x) \'() \'())');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 3');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type errors
  assert.throws(() => {
    evaluate('(filter "not-a-fn" \'())');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'not a function');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(filter (fn (x) x) 42)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Closure arity mismatch during filter
  assert.throws(() => {
    evaluate('(filter (fn (a b) true) \'(1 2))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 1');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // -------------------------------------------------------------
  // 12. reduce
  // -------------------------------------------------------------
  // Basic reductions
  assert.equal(evaluate('(reduce + 0 \'(1 2 3 4))'), 10);
  assert.equal(evaluate('(reduce * 1 \'(2 3 4 5))'), 120);

  // Empty list returns required init
  assert.equal(evaluate('(reduce + 99 \'())'), 99);
  assert.equal(evaluate('(reduce (fn (acc x) x) "init-val" \'())'), 'init-val');
  assert.deepEqual(evaluate('(reduce (fn (acc x) acc) \'() \'())'), []);

  // Required init: arity error if omitted
  assert.throws(() => {
    evaluate('(reduce + \'(1 2 3))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 3, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(reduce)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 3, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(reduce +)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 3, got 1');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(reduce + 0 \'() 99)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 3, got 4');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type errors
  assert.throws(() => {
    evaluate('(reduce 42 0 \'())');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'not a function');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(reduce + 0 42)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Left-fold verification:
  // Subtraction: ((100 - 10) - 20) - 30 = 40
  // (If right fold: 10 - (20 - (30 - 100)) = -80)
  assert.equal(evaluate('(reduce - 100 \'(10 20 30))'), 40);

  // Left-fold building list in reverse: (f acc x) -> (cons x acc)
  assert.deepEqual(
    evaluate('(reduce (fn (acc x) (cons x acc)) \'() \'(1 2 3 4))'),
    [4, 3, 2, 1]
  );

  // Left-fold string formatting: (f acc x) -> (str acc "-" x)
  assert.equal(
    evaluate('(reduce (fn (acc x) (str acc "-" x)) "start" \'("a" "b" "c"))'),
    'start-a-b-c'
  );

  // Closures capturing outer scope in reduce
  assert.equal(evaluate(`
    (let ((scale 2))
      (reduce (fn (acc x) (+ acc (* x scale))) 0 '(1 2 3 4)))
  `), 20); // (1+2+3+4)*2 = 20

  // Closure arity mismatch during reduce
  assert.throws(() => {
    evaluate('(reduce (fn (x) x) 0 \'(1 2 3))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(reduce (fn (a b c) a) 0 \'(1 2 3))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 3, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // -------------------------------------------------------------
  // 13. Multiline error positions
  // -------------------------------------------------------------
  assert.throws(() => {
    evaluate('\n\n    (tail \'())');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'empty list');
    assert.equal(err.line, 3);
    assert.equal(err.col, 6);
    return true;
  });

  assert.throws(() => {
    evaluate('\n\n      (cons 1 2)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 3);
    assert.equal(err.col, 8);
    return true;
  });

  assert.throws(() => {
    evaluate('\n  (reduce 1 2 3)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'not a function');
    assert.equal(err.line, 2);
    assert.equal(err.col, 4);
    return true;
  });
});
