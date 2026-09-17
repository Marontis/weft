import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, WeftError } from '../src/index.mjs';

// @attest WFT-STRINGS mutates=src/builtins-strings.mjs
test('stdlib-strings: comprehensive mutation-adequate tests through evaluate', () => {
  // -------------------------------------------------------------
  // 1. str-len
  // -------------------------------------------------------------
  assert.equal(evaluate('(str-len "")'), 0);
  assert.equal(evaluate('(str-len "a")'), 1);
  assert.equal(evaluate('(str-len "hello")'), 5);
  assert.equal(evaluate('(str-len "hello world!")'), 12);
  assert.equal(evaluate('(str-len "foo\\nbar")'), 7);

  // Arity errors
  assert.throws(() => {
    evaluate('(str-len)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-len "a" "b")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type error: expected string
  assert.throws(() => {
    evaluate('(str-len 42)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-len true)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-len nil)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-len (list "a"))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('\n  (str-len 123)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 2);
    assert.equal(err.col, 4);
    return true;
  });

  // -------------------------------------------------------------
  // 2. str-slice (clamped both ends)
  // -------------------------------------------------------------
  // Standard within bounds
  assert.equal(evaluate('(str-slice "abcdef" 0 6)'), 'abcdef');
  assert.equal(evaluate('(str-slice "abcdef" 1 4)'), 'bcd');
  assert.equal(evaluate('(str-slice "abcdef" 0 1)'), 'a');
  assert.equal(evaluate('(str-slice "abcdef" 5 6)'), 'f');
  assert.equal(evaluate('(str-slice "abcdef" 2 5)'), 'cde');
  assert.equal(evaluate('(str-slice "abcdef" 3 4)'), 'd');

  // Start clamped below 0: negative start clamped to 0
  // JS native slice('hello', -2, 4) is 'l' (index 3 to 4), but clamped start=0 gives 'hell'
  assert.equal(evaluate('(str-slice "hello" -2 4)'), 'hell');
  assert.equal(evaluate('(str-slice "hello" -1 2)'), 'he');
  assert.equal(evaluate('(str-slice "hello" -5 3)'), 'hel');
  assert.equal(evaluate('(str-slice "hello" -1 5)'), 'hello');
  assert.equal(evaluate('(str-slice "hello" -10 2)'), 'he');

  // Start clamped above len
  assert.equal(evaluate('(str-slice "hello" 6 10)'), '');
  assert.equal(evaluate('(str-slice "hello" 10 20)'), '');
  assert.equal(evaluate('(str-slice "hello" 5 5)'), '');

  // End clamped below 0: negative end clamped to 0
  // JS native slice('hello', 0, -1) is 'hell', but clamped end=0 gives ''
  assert.equal(evaluate('(str-slice "hello" 0 -1)'), '');
  assert.equal(evaluate('(str-slice "hello" 1 -1)'), '');
  assert.equal(evaluate('(str-slice "hello" 2 -2)'), '');
  assert.equal(evaluate('(str-slice "hello" 0 -3)'), '');

  // End clamped above len
  assert.equal(evaluate('(str-slice "hello" 0 10)'), 'hello');
  assert.equal(evaluate('(str-slice "hello" 2 100)'), 'llo');
  assert.equal(evaluate('(str-slice "hello" 4 99)'), 'o');
  assert.equal(evaluate('(str-slice "hello" 3 10)'), 'lo');

  // Both ends clamped
  assert.equal(evaluate('(str-slice "hello" -10 20)'), 'hello');
  assert.equal(evaluate('(str-slice "hello" -10 -2)'), '');
  assert.equal(evaluate('(str-slice "hello" 10 20)'), '');

  // Inverted bounds (start >= end)
  assert.equal(evaluate('(str-slice "hello" 3 2)'), '');
  assert.equal(evaluate('(str-slice "hello" 4 1)'), '');
  assert.equal(evaluate('(str-slice "hello" 5 0)'), '');
  assert.equal(evaluate('(str-slice "hello" 0 0)'), '');
  assert.equal(evaluate('(str-slice "hello" 3 3)'), '');

  // Empty string slice
  assert.equal(evaluate('(str-slice "" 0 0)'), '');
  assert.equal(evaluate('(str-slice "" -5 5)'), '');
  assert.equal(evaluate('(str-slice "" 0 10)'), '');

  // Arity errors
  assert.throws(() => {
    evaluate('(str-slice)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 3, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-slice "hello")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 3, got 1');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-slice "hello" 0)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 3, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-slice "hello" 0 2 3)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 3, got 4');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type errors
  assert.throws(() => {
    evaluate('(str-slice 123 0 1)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-slice nil 0 1)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-slice "hello" "0" 2)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-slice "hello" nil 2)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-slice "hello" 0 "2")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-slice "hello" 0 nil)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-slice "hello" 1.5 3)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-slice "hello" 1 3.5)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected number');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('\n   (str-slice 42 0 1)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 2);
    assert.equal(err.col, 5);
    return true;
  });

  // -------------------------------------------------------------
  // 3. str-split
  // -------------------------------------------------------------
  assert.deepEqual(evaluate('(str-split "a,b,c" ",")'), ['a', 'b', 'c']);
  assert.deepEqual(evaluate('(str-split "hello world foo" " ")'), ['hello', 'world', 'foo']);
  assert.deepEqual(evaluate('(str-split "one--two--three" "--")'), ['one', 'two', 'three']);
  assert.deepEqual(evaluate('(str-split "abc" "")'), ['a', 'b', 'c']);
  assert.deepEqual(evaluate('(str-split "abc" "x")'), ['abc']);
  assert.deepEqual(evaluate('(str-split "" ",")'), ['']);
  assert.deepEqual(evaluate('(str-split "" "")'), []);
  assert.deepEqual(evaluate('(str-split ",a,b," ",")'), ['', 'a', 'b', '']);
  assert.deepEqual(evaluate('(str-split "===" "=")'), ['', '', '', '']);

  // Arity errors
  assert.throws(() => {
    evaluate('(str-split)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-split "a")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 1');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-split "a" "b" "c")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 3');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type errors
  assert.throws(() => {
    evaluate('(str-split 123 ",")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-split nil ",")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-split "abc" 123)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-split "abc" nil)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('\n  (str-split 42 ",")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 2);
    assert.equal(err.col, 4);
    return true;
  });

  // -------------------------------------------------------------
  // 4. str-join & split/join round-trip
  // -------------------------------------------------------------
  assert.equal(evaluate('(str-join (list "a" "b" "c") ",")'), 'a,b,c');
  assert.equal(evaluate('(str-join (list "hello" "world") " ")'), 'hello world');
  assert.equal(evaluate('(str-join (list "foo" "bar") "")'), 'foobar');
  assert.equal(evaluate('(str-join (list "single") ",")'), 'single');
  assert.equal(evaluate('(str-join (list) ",")'), '');
  assert.equal(evaluate('(str-join (list "" "") "-")'), '-');

  // Round trip
  assert.equal(evaluate('(str-join (str-split "a:b:c" ":") ":")'), 'a:b:c');
  assert.equal(evaluate('(str-join (str-split "hello world" " ") "-")'), 'hello-world');
  assert.deepEqual(evaluate('(str-split (str-join (list "1" "2" "3") ":") ":")'), ['1', '2', '3']);

  // Arity errors
  assert.throws(() => {
    evaluate('(str-join)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-join (list "a"))');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 1');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-join (list "a") "," "extra")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 3');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type errors
  assert.throws(() => {
    evaluate('(str-join "not-a-list" ",")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-join 42 ",")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-join nil ",")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-join (list "a") 123)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-join (list "a") nil)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-join (list 1 2) ",")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-join (list "a" nil "b") ",")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-join (list "a" 42) ",")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('\n  (str-join 123 ",")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected list');
    assert.equal(err.line, 2);
    assert.equal(err.col, 4);
    return true;
  });

  // -------------------------------------------------------------
  // 5. str-upper
  // -------------------------------------------------------------
  assert.equal(evaluate('(str-upper "hello")'), 'HELLO');
  assert.equal(evaluate('(str-upper "Hello World!")'), 'HELLO WORLD!');
  assert.equal(evaluate('(str-upper "123 abc DEF!")'), '123 ABC DEF!');
  assert.equal(evaluate('(str-upper "")'), '');
  assert.equal(evaluate('(str-upper "ALREADY UPPER")'), 'ALREADY UPPER');

  // Arity errors
  assert.throws(() => {
    evaluate('(str-upper)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-upper "a" "b")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type errors
  assert.throws(() => {
    evaluate('(str-upper 42)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-upper nil)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-upper false)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('\n  (str-upper 42)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 2);
    assert.equal(err.col, 4);
    return true;
  });

  // -------------------------------------------------------------
  // 6. str-lower
  // -------------------------------------------------------------
  assert.equal(evaluate('(str-lower "HELLO")'), 'hello');
  assert.equal(evaluate('(str-lower "Hello World!")'), 'hello world!');
  assert.equal(evaluate('(str-lower "123 ABC def!")'), '123 abc def!');
  assert.equal(evaluate('(str-lower "")'), '');
  assert.equal(evaluate('(str-lower "already lower")'), 'already lower');

  // Arity errors
  assert.throws(() => {
    evaluate('(str-lower)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-lower "a" "b")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 1, got 2');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type errors
  assert.throws(() => {
    evaluate('(str-lower 42)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-lower nil)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-lower true)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('\n  (str-lower 42)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 2);
    assert.equal(err.col, 4);
    return true;
  });

  // -------------------------------------------------------------
  // 7. str-contains?
  // -------------------------------------------------------------
  assert.equal(evaluate('(str-contains? "hello world" "world")'), true);
  assert.equal(evaluate('(str-contains? "hello world" "hello")'), true);
  assert.equal(evaluate('(str-contains? "hello world" "lo wo")'), true);
  assert.equal(evaluate('(str-contains? "hello world" "foo")'), false);
  assert.equal(evaluate('(str-contains? "hello world" "World")'), false);
  assert.equal(evaluate('(str-contains? "hello" "ll")'), true);
  assert.equal(evaluate('(str-contains? "hello" "")'), true);
  assert.equal(evaluate('(str-contains? "" "")'), true);
  assert.equal(evaluate('(str-contains? "" "a")'), false);
  assert.equal(evaluate('(str-contains? "abc" "abcd")'), false);
  assert.equal(evaluate('(str-contains? "abc" "d")'), false);

  // In conditionals
  assert.equal(evaluate('(if (str-contains? "apple" "app") 1 2)'), 1);
  assert.equal(evaluate('(if (str-contains? "apple" "ban") 1 2)'), 2);

  // Arity errors
  assert.throws(() => {
    evaluate('(str-contains?)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 0');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-contains? "a")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 1');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-contains? "a" "b" "c")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'arity: expected 2, got 3');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  // Type errors
  assert.throws(() => {
    evaluate('(str-contains? 123 "2")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-contains? nil "a")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-contains? (list "a") "a")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-contains? "hello" 123)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('(str-contains? "hello" nil)');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 1);
    assert.equal(err.col, 2);
    return true;
  });

  assert.throws(() => {
    evaluate('\n  (str-contains? 10 "a")');
  }, (err) => {
    assert.equal(err instanceof WeftError, true);
    assert.equal(err.message, 'expected string');
    assert.equal(err.line, 2);
    assert.equal(err.col, 4);
    return true;
  });

  // -------------------------------------------------------------
  // 8. Combinations in complex expressions
  // -------------------------------------------------------------
  assert.equal(
    evaluate('(let ((s "hello world")) (str-slice s 0 (str-len "hello")))'),
    'hello'
  );
  assert.equal(
    evaluate('(let ((parts (str-split "one:two:three" ":"))) (str-join parts "-"))'),
    'one-two-three'
  );
  assert.deepEqual(
    evaluate('(let ((s "Mixed CASE")) (list (str-upper s) (str-lower s)))'),
    ['MIXED CASE', 'mixed case']
  );
});
