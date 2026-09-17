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

  // 15. Double-quote delimiter after numbers (line 165 nextChar === '"')
  const numBeforeStr = tokenize('42"hello"');
  assert.equal(numBeforeStr.length, 2);
  assert.deepEqual(numBeforeStr[0], { type: 'num', value: 42, line: 1, col: 1 });
  assert.deepEqual(numBeforeStr[1], { type: 'str', value: 'hello', line: 1, col: 3 });

  const negNumBeforeStr = tokenize('-7"world"');
  assert.equal(negNumBeforeStr.length, 2);
  assert.deepEqual(negNumBeforeStr[0], { type: 'num', value: -7, line: 1, col: 1 });
  assert.deepEqual(negNumBeforeStr[1], { type: 'str', value: 'world', line: 1, col: 3 });

  const decNumBeforeStr = tokenize('3.14"pi"');
  assert.equal(decNumBeforeStr.length, 2);
  assert.deepEqual(decNumBeforeStr[0], { type: 'num', value: 3.14, line: 1, col: 1 });
  assert.deepEqual(decNumBeforeStr[1], { type: 'str', value: 'pi', line: 1, col: 5 });

  const zeroNumBeforeStr = tokenize('0"zero"');
  assert.equal(zeroNumBeforeStr.length, 2);
  assert.deepEqual(zeroNumBeforeStr[0], { type: 'num', value: 0, line: 1, col: 1 });
  assert.deepEqual(zeroNumBeforeStr[1], { type: 'str', value: 'zero', line: 1, col: 2 });

  // 16. Double-quote delimiter after symbols (line 185 c === '"')
  const symBeforeStr = tokenize('foo"bar"');
  assert.equal(symBeforeStr.length, 2);
  assert.deepEqual(symBeforeStr[0], { type: 'sym', value: 'foo', line: 1, col: 1 });
  assert.deepEqual(symBeforeStr[1], { type: 'str', value: 'bar', line: 1, col: 4 });

  const plusBeforeStr = tokenize('+"str"');
  assert.equal(plusBeforeStr.length, 2);
  assert.deepEqual(plusBeforeStr[0], { type: 'sym', value: '+', line: 1, col: 1 });
  assert.deepEqual(plusBeforeStr[1], { type: 'str', value: 'str', line: 1, col: 2 });

  const minusBeforeStr = tokenize('-"str"');
  assert.equal(minusBeforeStr.length, 2);
  assert.deepEqual(minusBeforeStr[0], { type: 'sym', value: '-', line: 1, col: 1 });
  assert.deepEqual(minusBeforeStr[1], { type: 'str', value: 'str', line: 1, col: 2 });

  // 17. String escape col tracking: lines 101 & 105 (col += 2 for \" and \\)
  const afterQuoteEsc = tokenize('"\\"" )');
  assert.equal(afterQuoteEsc.length, 2);
  assert.deepEqual(afterQuoteEsc[0], { type: 'str', value: '"', line: 1, col: 1 });
  assert.deepEqual(afterQuoteEsc[1], { type: 'rparen', value: ')', line: 1, col: 6 });

  const afterSlashEsc = tokenize('"\\\\" )');
  assert.equal(afterSlashEsc.length, 2);
  assert.deepEqual(afterSlashEsc[0], { type: 'str', value: '\\', line: 1, col: 1 });
  assert.deepEqual(afterSlashEsc[1], { type: 'rparen', value: ')', line: 1, col: 6 });

  const afterMultiEsc = tokenize('"\\"\\"\\\\"foo');
  assert.equal(afterMultiEsc.length, 2);
  assert.deepEqual(afterMultiEsc[0], { type: 'str', value: '""\\', line: 1, col: 1 });
  assert.deepEqual(afterMultiEsc[1], { type: 'sym', value: 'foo', line: 1, col: 9 });

  const afterAllFourEsc = tokenize('"\\"\\\\\\n\\t" )');
  assert.equal(afterAllFourEsc.length, 2);
  assert.deepEqual(afterAllFourEsc[0], { type: 'str', value: '"\\\n\t', line: 1, col: 1 });
  assert.deepEqual(afterAllFourEsc[1], { type: 'rparen', value: ')', line: 1, col: 12 });

  // 18. Line 76 string loop boundary: while (i < len) (kills i <= len)
  try {
    String.prototype[1] = '"';
    assert.throws(() => tokenize('"'), (err) => {
      return err instanceof WeftError &&
        err.message.startsWith('unterminated string') &&
        err.line === 1 &&
        err.col === 1;
    });
  } finally {
    delete String.prototype[1];
  }

  try {
    String.prototype[2] = '"';
    assert.throws(() => tokenize('"a'), (err) => {
      return err instanceof WeftError &&
        err.message.startsWith('unterminated string') &&
        err.line === 1 &&
        err.col === 1;
    });
  } finally {
    delete String.prototype[2];
  }

  // 19. Line 65 stack fallback mutant (src/lexer.mjs:65:61 StringLiteral)
  const origTest = RegExp.prototype.test;
  let testedArgString;
  RegExp.prototype.test = function (str) {
    testedArgString = str;
    return origTest.call(this, str);
  };
  const origPrepare = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = () => '';
    tokenize('"test"');
    assert.equal(testedArgString, '');
  } finally {
    RegExp.prototype.test = origTest;
    Error.prepareStackTrace = origPrepare;
  }

  // 20. Multiline string line and column tracking
  const emptyMultiline = tokenize('"\n\n" )');
  assert.equal(emptyMultiline.length, 2);
  assert.deepEqual(emptyMultiline[0], { type: 'str', value: '\n\n', line: 1, col: 1 });
  assert.deepEqual(emptyMultiline[1], { type: 'rparen', value: ')', line: 3, col: 3 });

  assert.throws(() => tokenize('"line1\n  \\q"'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unknown escape') &&
      err.line === 2 &&
      err.col === 3;
  });

  assert.throws(() => tokenize('"line1\nline2'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unterminated string') &&
      err.line === 1 &&
      err.col === 1;
  });
});
