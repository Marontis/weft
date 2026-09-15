import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.mjs';
import { WeftError } from '../src/errors.mjs';

// @attest WFT-02 mutates=src/lexer.mjs
test('string literals decode exactly the escapes \\", \\\\, \\n, \\t; unterminated string and unknown escape raise WeftError with exact positions', () => {
  // Empty string
  assert.deepEqual(tokenize('""'), [
    { type: 'str', value: '', line: 1, col: 1 },
  ]);

  // Simple string
  assert.deepEqual(tokenize('"hello world"'), [
    { type: 'str', value: 'hello world', line: 1, col: 1 },
  ]);

  // Exact positions with offset
  assert.deepEqual(tokenize('  "foo"  \n   "bar"'), [
    { type: 'str', value: 'foo', line: 1, col: 3 },
    { type: 'str', value: 'bar', line: 2, col: 4 },
  ]);

  // Subsequent tokens have exact line/col
  assert.deepEqual(tokenize('"hello" 42 "world"'), [
    { type: 'str', value: 'hello', line: 1, col: 1 },
    { type: 'num', value: 42, line: 1, col: 9 },
    { type: 'str', value: 'world', line: 1, col: 12 },
  ]);

  // Single escape characters: \", \\, \n, \t
  assert.deepEqual(tokenize('"\\""'), [
    { type: 'str', value: '"', line: 1, col: 1 },
  ]);
  assert.deepEqual(tokenize('"\\\\"'), [
    { type: 'str', value: '\\', line: 1, col: 1 },
  ]);
  assert.deepEqual(tokenize('"\\n"'), [
    { type: 'str', value: '\n', line: 1, col: 1 },
  ]);
  assert.deepEqual(tokenize('"\\t"'), [
    { type: 'str', value: '\t', line: 1, col: 1 },
  ]);

  // Escaped backslash followed by n is not a newline
  assert.deepEqual(tokenize('"\\\\n"'), [
    { type: 'str', value: '\\n', line: 1, col: 1 },
  ]);

  // Complex escaped strings
  assert.deepEqual(tokenize('"say \\"hello\\""'), [
    { type: 'str', value: 'say "hello"', line: 1, col: 1 },
  ]);
  assert.deepEqual(tokenize('"a\\\\b"'), [
    { type: 'str', value: 'a\\b', line: 1, col: 1 },
  ]);
  assert.deepEqual(tokenize('"a\\nb"'), [
    { type: 'str', value: 'a\nb', line: 1, col: 1 },
  ]);
  assert.deepEqual(tokenize('"a\\tb"'), [
    { type: 'str', value: 'a\tb', line: 1, col: 1 },
  ]);

  // All 4 escapes combined
  assert.deepEqual(tokenize('"\\\\ \\" \\n \\t"'), [
    { type: 'str', value: '\\ " \n \t', line: 1, col: 1 },
  ]);

  // Literal characters like parens, quotes, digits, semicolons inside strings
  assert.deepEqual(tokenize('" ( ) \' ; 123 "'), [
    { type: 'str', value: " ( ) ' ; 123 ", line: 1, col: 1 },
  ]);

  // Unterminated string: opening quote on line 1
  assert.throws(
    () => tokenize('"unterminated'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message.startsWith('unterminated string'), true);
      assert.equal(err.line, 1);
      assert.equal(err.col, 1);
      return true;
    }
  );

  // Unterminated string: solitary quote
  assert.throws(
    () => tokenize('"'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message.startsWith('unterminated string'), true);
      assert.equal(err.line, 1);
      assert.equal(err.col, 1);
      return true;
    }
  );

  // Unterminated string: position is opening quote even after multiline or inner characters
  assert.throws(
    () => tokenize('\n  "multiline\nunclosed'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message.startsWith('unterminated string'), true);
      assert.equal(err.line, 2);
      assert.equal(err.col, 3);
      return true;
    }
  );

  // Unterminated string: preceded by tokens
  assert.throws(
    () => tokenize('42 ("unclosed'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message.startsWith('unterminated string'), true);
      assert.equal(err.line, 1);
      assert.equal(err.col, 5);
      return true;
    }
  );

  // Unterminated string with escaped quote inside
  assert.throws(
    () => tokenize('"escaped \\" still unclosed'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message.startsWith('unterminated string'), true);
      assert.equal(err.line, 1);
      assert.equal(err.col, 1);
      return true;
    }
  );

  // Unknown escape: \q at line 1, col 5
  assert.throws(
    () => tokenize('"abc\\qdef"'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message.startsWith('unknown escape'), true);
      assert.equal(err.line, 1);
      assert.equal(err.col, 5);
      return true;
    }
  );

  // Unknown escape: \r (carriage return is not one of \", \\, \n, \t)
  assert.throws(
    () => tokenize('"hello\\rworld"'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message.startsWith('unknown escape'), true);
      assert.equal(err.line, 1);
      assert.equal(err.col, 7);
      return true;
    }
  );

  // Unknown escape: \a, \0, \x, \', \/, space
  for (const esc of ['a', '0', 'x', "'", '/', ' ']) {
    assert.throws(
      () => tokenize(`"test\\${esc}"`),
      (err) => {
        assert.equal(err instanceof WeftError, true);
        assert.equal(err.message.startsWith('unknown escape'), true);
        assert.equal(err.line, 1);
        assert.equal(err.col, 6);
        return true;
      }
    );
  }

  // Unknown escape on line 2
  assert.throws(
    () => tokenize('(\n  "abc\\z"'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message.startsWith('unknown escape'), true);
      assert.equal(err.line, 2);
      assert.equal(err.col, 7);
      return true;
    }
  );

  // Unknown escape: trailing backslash at EOF
  assert.throws(
    () => tokenize('"hello\\'),
    (err) => {
      assert.equal(err instanceof WeftError, true);
      assert.equal(err.message.startsWith('unknown escape'), true);
      assert.equal(err.line, 1);
      assert.equal(err.col, 7);
      return true;
    }
  );
});

test('tokenize strings in complex expressions and multiline strings', () => {
  // S-expression with strings
  const tokens = tokenize('(print "hello, world!" "foo\\nbar")');
  assert.deepEqual(tokens, [
    { type: 'lparen', value: '(', line: 1, col: 1 },
    { type: 'sym', value: 'print', line: 1, col: 2 },
    { type: 'str', value: 'hello, world!', line: 1, col: 8 },
    { type: 'str', value: 'foo\nbar', line: 1, col: 24 },
    { type: 'rparen', value: ')', line: 1, col: 34 },
  ]);

  // Consecutive escapes
  assert.deepEqual(tokenize('"\\\\\\"\\\\n"'), [
    { type: 'str', value: '\\"\\n', line: 1, col: 1 },
  ]);

  // Multiline literal string
  const multiStr = tokenize('"line1\nline2"\n42');
  assert.deepEqual(multiStr, [
    { type: 'str', value: 'line1\nline2', line: 1, col: 1 },
    { type: 'num', value: 42, line: 3, col: 1 },
  ]);
});
