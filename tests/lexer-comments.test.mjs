import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.mjs';
import { WeftError } from '../src/errors.mjs';

// @attest WFT-LEXER mutates=src/lexer.mjs
test('lexer comments: between tokens on one line, full-line comments, exact line:col positions and boundary conditions', () => {
  // 1. Full-line comment and inline comment between tokens on one line
  const src1 = `
    ; full line comment 1
    (+ 42 ; inline comment between tokens on line 3
       -7)
    ; full line comment 2 at EOF
  `;
  const tokens1 = tokenize(src1);
  assert.equal(tokens1.length, 5);
  assert.deepEqual(tokens1[0], { type: 'lparen', value: '(', line: 3, col: 5 });
  assert.deepEqual(tokens1[1], { type: 'sym', value: '+', line: 3, col: 6 });
  assert.deepEqual(tokens1[2], { type: 'num', value: 42, line: 3, col: 8 });
  assert.deepEqual(tokens1[3], { type: 'num', value: -7, line: 4, col: 8 });
  assert.deepEqual(tokens1[4], { type: 'rparen', value: ')', line: 4, col: 10 });

  // 2. Multiple consecutive comment lines and exact line:col advancement
  const src2 = '; line 1\n; line 2\n; line 3\n42 ; line 4 trailing';
  const tokens2 = tokenize(src2);
  assert.equal(tokens2.length, 1);
  assert.deepEqual(tokens2[0], { type: 'num', value: 42, line: 4, col: 1 });

  // 3. Comment between tokens with varying indentation on subsequent lines
  const src3 = '(foo ; comment after foo\n     bar ; comment after bar\n     baz)';
  const tokens3 = tokenize(src3);
  assert.equal(tokens3.length, 5);
  assert.deepEqual(tokens3[0], { type: 'lparen', value: '(', line: 1, col: 1 });
  assert.deepEqual(tokens3[1], { type: 'sym', value: 'foo', line: 1, col: 2 });
  assert.deepEqual(tokens3[2], { type: 'sym', value: 'bar', line: 2, col: 6 });
  assert.deepEqual(tokens3[3], { type: 'sym', value: 'baz', line: 3, col: 6 });
  assert.deepEqual(tokens3[4], { type: 'rparen', value: ')', line: 3, col: 9 });

  // 4. Boundary: empty comment line and comment at start of file
  const src4 = ';\n42';
  const tokens4 = tokenize(src4);
  assert.equal(tokens4.length, 1);
  assert.deepEqual(tokens4[0], { type: 'num', value: 42, line: 2, col: 1 });

  // 5. Boundary: comment at EOF without trailing newline
  const src5 = '42 ; trailing comment without newline';
  const tokens5 = tokenize(src5);
  assert.equal(tokens5.length, 1);
  assert.deepEqual(tokens5[0], { type: 'num', value: 42, line: 1, col: 1 });

  // 6. Boundary: file containing only comments (with and without newline)
  assert.deepEqual(tokenize('; lone comment'), []);
  assert.deepEqual(tokenize('; lone comment\n'), []);
  assert.deepEqual(tokenize('; c1\n; c2\n; c3'), []);
  assert.deepEqual(tokenize('   ; spaces before comment\n   ; more spaces\n'), []);

  // 7. Boundary: semicolon immediately adjacent to tokens (no whitespace delimiter before ;)
  const src7 = '42;comment\n"str";comment\nfoo;comment\n(;comment\n);comment\n\';comment\nx';
  const tokens7 = tokenize(src7);
  assert.equal(tokens7.length, 7);
  assert.deepEqual(tokens7[0], { type: 'num', value: 42, line: 1, col: 1 });
  assert.deepEqual(tokens7[1], { type: 'str', value: 'str', line: 2, col: 1 });
  assert.deepEqual(tokens7[2], { type: 'sym', value: 'foo', line: 3, col: 1 });
  assert.deepEqual(tokens7[3], { type: 'lparen', value: '(', line: 4, col: 1 });
  assert.deepEqual(tokens7[4], { type: 'rparen', value: ')', line: 5, col: 1 });
  assert.deepEqual(tokens7[5], { type: 'quote', value: '\'', line: 6, col: 1 });
  assert.deepEqual(tokens7[6], { type: 'sym', value: 'x', line: 7, col: 1 });

  // 8. Boundary: semicolon inside a string literal must NOT start a comment
  const src8 = '"hello ; not a comment" 123';
  const tokens8 = tokenize(src8);
  assert.equal(tokens8.length, 2);
  assert.deepEqual(tokens8[0], { type: 'str', value: 'hello ; not a comment', line: 1, col: 1 });
  assert.deepEqual(tokens8[1], { type: 'num', value: 123, line: 1, col: 25 });

  // 9. Boundary: multiple semicolons starting a comment (;; and ;;;)
  const src9 = ';;; multiple semicolons\n;; double semicolon\n99';
  const tokens9 = tokenize(src9);
  assert.equal(tokens9.length, 1);
  assert.deepEqual(tokens9[0], { type: 'num', value: 99, line: 3, col: 1 });

  // 10. Boundary: comments containing characters that would otherwise be syntax errors
  const src10 = '; "unterminated string inside comment\n; \\unknown \\escape\n; ((unclosed paren\n"ok"';
  const tokens10 = tokenize(src10);
  assert.equal(tokens10.length, 1);
  assert.deepEqual(tokens10[0], { type: 'str', value: 'ok', line: 4, col: 1 });

  // 11. Boundary: CRLF line endings with comments
  const src11 = '10 ; inline comment\r\n20 ; another\r\n30';
  const tokens11 = tokenize(src11);
  assert.equal(tokens11.length, 3);
  assert.deepEqual(tokens11[0], { type: 'num', value: 10, line: 1, col: 1 });
  assert.deepEqual(tokens11[1], { type: 'num', value: 20, line: 2, col: 1 });
  assert.deepEqual(tokens11[2], { type: 'num', value: 30, line: 3, col: 1 });

  // 12. Error positions after comments: unterminated string error position stays exact
  assert.throws(() => tokenize('; comment line 1\n; comment line 2\n   "unterminated'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unterminated string') &&
      err.line === 3 &&
      err.col === 4;
  });

  // 13. Error positions after comments: unknown escape error position stays exact
  assert.throws(() => tokenize('; comment\n"\\q"'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unknown escape') &&
      err.line === 2 &&
      err.col === 2;
  });

  // 14. Error positions after comments with inline comment
  assert.throws(() => tokenize('foo ; comment\n  "bad \\z"'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unknown escape') &&
      err.line === 2 &&
      err.col === 8;
  });

  // 15. Semicolon delimiter after negative and decimal numbers (line 165 nextChar === ';')
  const negNumSemi = tokenize('-42;comment\nx');
  assert.deepEqual(negNumSemi, [
    { type: 'num', value: -42, line: 1, col: 1 },
    { type: 'sym', value: 'x', line: 2, col: 1 }
  ]);
  const decNumSemi = tokenize('3.14;comment\nx');
  assert.deepEqual(decNumSemi, [
    { type: 'num', value: 3.14, line: 1, col: 1 },
    { type: 'sym', value: 'x', line: 2, col: 1 }
  ]);
  const zeroNumSemi = tokenize('0;comment\nx');
  assert.deepEqual(zeroNumSemi, [
    { type: 'num', value: 0, line: 1, col: 1 },
    { type: 'sym', value: 'x', line: 2, col: 1 }
  ]);

  // 16. Semicolon delimiter after symbols and operators (line 185 c === ';')
  const symSemi = tokenize('my-var?;comment\nx');
  assert.deepEqual(symSemi, [
    { type: 'sym', value: 'my-var?', line: 1, col: 1 },
    { type: 'sym', value: 'x', line: 2, col: 1 }
  ]);
  const plusSemi = tokenize('+;comment\nx');
  assert.deepEqual(plusSemi, [
    { type: 'sym', value: '+', line: 1, col: 1 },
    { type: 'sym', value: 'x', line: 2, col: 1 }
  ]);
  const minusSemi = tokenize('-;comment\nx');
  assert.deepEqual(minusSemi, [
    { type: 'sym', value: '-', line: 1, col: 1 },
    { type: 'sym', value: 'x', line: 2, col: 1 }
  ]);

  // 17. Semicolon delimiter at EOF without newline
  assert.deepEqual(tokenize(';'), []);
  assert.deepEqual(tokenize(';;'), []);
  assert.deepEqual(tokenize(';   '), []);
  assert.deepEqual(tokenize('-99;trailing'), [
    { type: 'num', value: -99, line: 1, col: 1 }
  ]);
  assert.deepEqual(tokenize('alpha;trailing'), [
    { type: 'sym', value: 'alpha', line: 1, col: 1 }
  ]);
  assert.deepEqual(tokenize('( ;trailing'), [
    { type: 'lparen', value: '(', line: 1, col: 1 }
  ]);
  assert.deepEqual(tokenize(') ;trailing'), [
    { type: 'rparen', value: ')', line: 1, col: 1 }
  ]);

  // 18. Line 51 stack fallback mutant (src/lexer.mjs:51:61 StringLiteral)
  const origTest = RegExp.prototype.test;
  let testedArgComment;
  RegExp.prototype.test = function (str) {
    testedArgComment = str;
    return origTest.call(this, str);
  };
  const origPrepare = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = () => '';
    tokenize('; stack test');
    assert.equal(testedArgComment, '');
  } finally {
    RegExp.prototype.test = origTest;
    Error.prepareStackTrace = origPrepare;
  }
});
