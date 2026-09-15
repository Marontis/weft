import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.mjs';
import { WeftError } from '../src/errors.mjs';

test('WeftError records message, line, and col', () => {
  const errWithPos = new WeftError('something failed', 2, 5);
  assert.equal(errWithPos instanceof Error, true);
  assert.equal(errWithPos instanceof WeftError, true);
  assert.equal(errWithPos.name, 'WeftError');
  assert.equal(errWithPos.message, 'something failed');
  assert.equal(errWithPos.line, 2);
  assert.equal(errWithPos.col, 5);

  const errWithoutPos = new WeftError('runtime bug');
  assert.equal(errWithoutPos.line, null);
  assert.equal(errWithoutPos.col, null);
  assert.equal(errWithoutPos.message, 'runtime bug');
});

// @attest WFT-01 mutates=src/lexer.mjs
test('tokenize produces position-carrying tokens matching DESIGN.md section 2', () => {
  // Empty and whitespace-only
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('   \n\t  \r\n  '), []);

  // Parens and quotes
  assert.deepEqual(tokenize('()\''), [
    { type: 'lparen', value: '(', line: 1, col: 1 },
    { type: 'rparen', value: ')', line: 1, col: 2 },
    { type: 'quote', value: "'", line: 1, col: 3 },
  ]);

  // Nested parens and quotes
  assert.deepEqual(tokenize("((('x)))"), [
    { type: 'lparen', value: '(', line: 1, col: 1 },
    { type: 'lparen', value: '(', line: 1, col: 2 },
    { type: 'lparen', value: '(', line: 1, col: 3 },
    { type: 'quote', value: "'", line: 1, col: 4 },
    { type: 'sym', value: 'x', line: 1, col: 5 },
    { type: 'rparen', value: ')', line: 1, col: 6 },
    { type: 'rparen', value: ')', line: 1, col: 7 },
    { type: 'rparen', value: ')', line: 1, col: 8 },
  ]);

  // Numbers: positive, negative, float, negative float, zero
  const numInput = '42 -7 3.14 -0.5 0 -0 100.25';
  const numTokens = tokenize(numInput);
  assert.deepEqual(numTokens, [
    { type: 'num', value: 42, line: 1, col: 1 },
    { type: 'num', value: -7, line: 1, col: 4 },
    { type: 'num', value: 3.14, line: 1, col: 7 },
    { type: 'num', value: -0.5, line: 1, col: 12 },
    { type: 'num', value: 0, line: 1, col: 17 },
    { type: 'num', value: -0, line: 1, col: 19 },
    { type: 'num', value: 100.25, line: 1, col: 22 },
  ]);
  for (const t of numTokens) {
    assert.equal(typeof t.value, 'number');
  }

  // Symbols: identifiers, punctuation, literals (true, false, nil)
  const symInput = '+ - * / = < > <= >= not str-join my-var? set-x! true false nil ->';
  const symTokens = tokenize(symInput);
  assert.deepEqual(symTokens, [
    { type: 'sym', value: '+', line: 1, col: 1 },
    { type: 'sym', value: '-', line: 1, col: 3 },
    { type: 'sym', value: '*', line: 1, col: 5 },
    { type: 'sym', value: '/', line: 1, col: 7 },
    { type: 'sym', value: '=', line: 1, col: 9 },
    { type: 'sym', value: '<', line: 1, col: 11 },
    { type: 'sym', value: '>', line: 1, col: 13 },
    { type: 'sym', value: '<=', line: 1, col: 15 },
    { type: 'sym', value: '>=', line: 1, col: 18 },
    { type: 'sym', value: 'not', line: 1, col: 21 },
    { type: 'sym', value: 'str-join', line: 1, col: 25 },
    { type: 'sym', value: 'my-var?', line: 1, col: 34 },
    { type: 'sym', value: 'set-x!', line: 1, col: 42 },
    { type: 'sym', value: 'true', line: 1, col: 49 },
    { type: 'sym', value: 'false', line: 1, col: 54 },
    { type: 'sym', value: 'nil', line: 1, col: 60 },
    { type: 'sym', value: '->', line: 1, col: 64 },
  ]);
  for (const t of symTokens) {
    assert.equal(typeof t.value, 'string');
  }

  // Negative number vs minus operator symbol
  assert.deepEqual(tokenize('(- a b)'), [
    { type: 'lparen', value: '(', line: 1, col: 1 },
    { type: 'sym', value: '-', line: 1, col: 2 },
    { type: 'sym', value: 'a', line: 1, col: 4 },
    { type: 'sym', value: 'b', line: 1, col: 6 },
    { type: 'rparen', value: ')', line: 1, col: 7 },
  ]);

  assert.deepEqual(tokenize('(-7)'), [
    { type: 'lparen', value: '(', line: 1, col: 1 },
    { type: 'num', value: -7, line: 1, col: 2 },
    { type: 'rparen', value: ')', line: 1, col: 4 },
  ]);

  assert.deepEqual(tokenize('(-0.5)'), [
    { type: 'lparen', value: '(', line: 1, col: 1 },
    { type: 'num', value: -0.5, line: 1, col: 2 },
    { type: 'rparen', value: ')', line: 1, col: 6 },
  ]);

  // Quote sugar tokens
  assert.deepEqual(tokenize("'expr '(-12) ''x"), [
    { type: 'quote', value: "'", line: 1, col: 1 },
    { type: 'sym', value: 'expr', line: 1, col: 2 },
    { type: 'quote', value: "'", line: 1, col: 7 },
    { type: 'lparen', value: '(', line: 1, col: 8 },
    { type: 'num', value: -12, line: 1, col: 9 },
    { type: 'rparen', value: ')', line: 1, col: 12 },
    { type: 'quote', value: "'", line: 1, col: 14 },
    { type: 'quote', value: "'", line: 1, col: 15 },
    { type: 'sym', value: 'x', line: 1, col: 16 },
  ]);

  // Multi-line program with exact 1-based line/col positions
  const multiLine = '(def add\n  (fn (x y)\n    (+ x y)))\n';
  assert.deepEqual(tokenize(multiLine), [
    { type: 'lparen', value: '(', line: 1, col: 1 },
    { type: 'sym', value: 'def', line: 1, col: 2 },
    { type: 'sym', value: 'add', line: 1, col: 6 },
    { type: 'lparen', value: '(', line: 2, col: 3 },
    { type: 'sym', value: 'fn', line: 2, col: 4 },
    { type: 'lparen', value: '(', line: 2, col: 7 },
    { type: 'sym', value: 'x', line: 2, col: 8 },
    { type: 'sym', value: 'y', line: 2, col: 10 },
    { type: 'rparen', value: ')', line: 2, col: 11 },
    { type: 'lparen', value: '(', line: 3, col: 5 },
    { type: 'sym', value: '+', line: 3, col: 6 },
    { type: 'sym', value: 'x', line: 3, col: 8 },
    { type: 'sym', value: 'y', line: 3, col: 10 },
    { type: 'rparen', value: ')', line: 3, col: 11 },
    { type: 'rparen', value: ')', line: 3, col: 12 },
    { type: 'rparen', value: ')', line: 3, col: 13 },
  ]);

  // Newlines: CRLF, LF, CR, and blank lines
  assert.deepEqual(tokenize('10\r\n20\r\n30'), [
    { type: 'num', value: 10, line: 1, col: 1 },
    { type: 'num', value: 20, line: 2, col: 1 },
    { type: 'num', value: 30, line: 3, col: 1 },
  ]);

  assert.deepEqual(tokenize('a\rb'), [
    { type: 'sym', value: 'a', line: 1, col: 1 },
    { type: 'sym', value: 'b', line: 2, col: 1 },
  ]);

  assert.deepEqual(tokenize('\n\n\n  foo'), [
    { type: 'sym', value: 'foo', line: 4, col: 3 },
  ]);

  assert.deepEqual(tokenize('\tbar'), [
    { type: 'sym', value: 'bar', line: 1, col: 2 },
  ]);
});

test('tokenize raises WeftError not implemented for strings and comments with exact position', () => {
  assert.throws(
    () => tokenize('"hello"'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message, 'not implemented');
      assert.equal(err.line, 1);
      assert.equal(err.col, 1);
      return true;
    }
  );

  assert.throws(
    () => tokenize('\n  "world"'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message, 'not implemented');
      assert.equal(err.line, 2);
      assert.equal(err.col, 3);
      return true;
    }
  );

  assert.throws(
    () => tokenize('abc "def"'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message, 'not implemented');
      assert.equal(err.line, 1);
      assert.equal(err.col, 5);
      return true;
    }
  );

  assert.throws(
    () => tokenize('; comment'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message, 'not implemented');
      assert.equal(err.line, 1);
      assert.equal(err.col, 1);
      return true;
    }
  );

  assert.throws(
    () => tokenize('42\n ; later comment'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message, 'not implemented');
      assert.equal(err.line, 2);
      assert.equal(err.col, 2);
      return true;
    }
  );

  assert.throws(
    () => tokenize('abc;def'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message, 'not implemented');
      assert.equal(err.line, 1);
      assert.equal(err.col, 4);
      return true;
    }
  );
});
