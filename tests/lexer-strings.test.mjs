import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.mjs';
import { WeftError } from '../src/errors.mjs';

// @attest WFT-LEXER mutates=src/lexer.mjs
test('lexer-strings double-quoted strings, escapes, error positions, and boundaries', () => {
  // 1. Empty string
  const emptyTok = tokenize('""');
  assert.equal(emptyTok.length, 1);
  assert.deepEqual(emptyTok[0], { type: 'str', value: '', line: 1, col: 1 });

  // 2. Simple string with text and surrounding tokens
  const simple = tokenize('(+ "hello world" 42)');
  assert.equal(simple.length, 5);
  assert.deepEqual(simple[0], { type: 'lparen', value: '(', line: 1, col: 1 });
  assert.deepEqual(simple[1], { type: 'sym', value: '+', line: 1, col: 2 });
  assert.deepEqual(simple[2], { type: 'str', value: 'hello world', line: 1, col: 4 });
  assert.deepEqual(simple[3], { type: 'num', value: 42, line: 1, col: 18 });
  assert.deepEqual(simple[4], { type: 'rparen', value: ')', line: 1, col: 20 });

  // 3. All four escapes: \" \\ \n \t
  const escTokens = tokenize('"\\" \\\\ \\n \\t"');
  assert.equal(escTokens.length, 1);
  assert.deepEqual(escTokens[0], { type: 'str', value: '" \\ \n \t', line: 1, col: 1 });

  // 4. Token position tracking after escaped characters
  // "\"\\n\\t\" )" -> " at 1, \n at 2-3, \t at 4-5, " at 6, space at 7, ) at 8
  const afterEsc = tokenize('"\\n\\t" )');
  assert.equal(afterEsc.length, 2);
  assert.deepEqual(afterEsc[0], { type: 'str', value: '\n\t', line: 1, col: 1 });
  assert.deepEqual(afterEsc[1], { type: 'rparen', value: ')', line: 1, col: 8 });

  // 5. Multiline literal string across newlines
  const multi = tokenize('"line1\nline2" )');
  assert.equal(multi.length, 2);
  assert.deepEqual(multi[0], { type: 'str', value: 'line1\nline2', line: 1, col: 1 });
  assert.deepEqual(multi[1], { type: 'rparen', value: ')', line: 2, col: 8 });

  // 6. Adjacent strings and boundary tokens
  const adjacent = tokenize('"" "" ("a")');
  assert.equal(adjacent.length, 5);
  assert.deepEqual(adjacent[0], { type: 'str', value: '', line: 1, col: 1 });
  assert.deepEqual(adjacent[1], { type: 'str', value: '', line: 1, col: 4 });
  assert.deepEqual(adjacent[2], { type: 'lparen', value: '(', line: 1, col: 7 });
  assert.deepEqual(adjacent[3], { type: 'str', value: 'a', line: 1, col: 8 });
  assert.deepEqual(adjacent[4], { type: 'rparen', value: ')', line: 1, col: 11 });

  // 7. String directly adjacent to a number
  const numAdj = tokenize('"num"123');
  assert.equal(numAdj.length, 2);
  assert.deepEqual(numAdj[0], { type: 'str', value: 'num', line: 1, col: 1 });
  assert.deepEqual(numAdj[1], { type: 'num', value: 123, line: 1, col: 6 });

  // 8. Unterminated string: lone quote
  assert.throws(() => tokenize('"'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unterminated string') &&
      err.line === 1 &&
      err.col === 1;
  });

  // 9. Unterminated string: multiline offset
  assert.throws(() => tokenize('\n\n    "unclosed string'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unterminated string') &&
      err.line === 3 &&
      err.col === 5;
  });

  // 10. Unterminated string: ends with trailing backslash before EOF
  assert.throws(() => tokenize('  "trailing-escape\\'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unterminated string') &&
      err.line === 1 &&
      err.col === 3;
  });

  // 11. Unknown escape: \q at line 1, col 8
  assert.throws(() => tokenize('"hello \\q world"'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unknown escape') &&
      err.line === 1 &&
      err.col === 8;
  });

  // 12. Unknown escape: \x at line 2, col 4
  assert.throws(() => tokenize('\n  "\\x"'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unknown escape') &&
      err.line === 2 &&
      err.col === 4;
  });

  // 13. Unknown escapes: \0, \r, \/
  assert.throws(() => tokenize('"\\0"'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unknown escape') &&
      err.line === 1 &&
      err.col === 2;
  });

  assert.throws(() => tokenize('"\\r"'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unknown escape') &&
      err.line === 1 &&
      err.col === 2;
  });

  assert.throws(() => tokenize('"\\/"'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unknown escape') &&
      err.line === 1 &&
      err.col === 2;
  });

  // 14. String with whitespace-only content
  const spaces = tokenize('"   "');
  assert.equal(spaces.length, 1);
  assert.deepEqual(spaces[0], { type: 'str', value: '   ', line: 1, col: 1 });
});
