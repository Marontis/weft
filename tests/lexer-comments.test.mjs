import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.mjs';

// @attest WFT-03 mutates=src/lexer.mjs
test('comments from ; to end of line produce no tokens and do not disturb the line/col positions of surrounding tokens', () => {
  // Pure comments produce no tokens
  assert.deepEqual(tokenize(';'), []);
  assert.deepEqual(tokenize(';;;'), []);
  assert.deepEqual(tokenize('; this is a comment'), []);
  assert.deepEqual(tokenize('; comment with trailing newline\n'), []);
  assert.deepEqual(tokenize('; comment with CRLF\r\n'), []);
  assert.deepEqual(tokenize('; comment with CR\r'), []);
  assert.deepEqual(tokenize('; line 1\n; line 2\n; line 3'), []);

  // Comments containing special syntax characters produce no tokens and cause no syntax errors
  assert.deepEqual(tokenize('; ( ) "unterminated string \\q \' 123 + -'), []);
  assert.deepEqual(tokenize(';;; ((( "nested" ;;; \'x)))'), []);

  // Case: comment sits between tokens on one line (trailing comment on a line with tokens)
  // Token on line 1, comment on line 1, subsequent token on line 2
  const inlineComment = 'foo ; comment sits on this line\nbar';
  assert.deepEqual(tokenize(inlineComment), [
    { type: 'sym', value: 'foo', line: 1, col: 1 },
    { type: 'sym', value: 'bar', line: 2, col: 1 },
  ]);

  // Expression with comment on the same line between tokens
  const sexprInline = '(+ 1 ; add 1\n   2)';
  assert.deepEqual(tokenize(sexprInline), [
    { type: 'lparen', value: '(', line: 1, col: 1 },
    { type: 'sym', value: '+', line: 1, col: 2 },
    { type: 'num', value: 1, line: 1, col: 4 },
    { type: 'num', value: 2, line: 2, col: 4 },
    { type: 'rparen', value: ')', line: 2, col: 5 },
  ]);

  // Comment adjacent to token without whitespace (stops symbol scanning)
  const adjacentComment = 'abc;comment without space\n123';
  assert.deepEqual(tokenize(adjacentComment), [
    { type: 'sym', value: 'abc', line: 1, col: 1 },
    { type: 'num', value: 123, line: 2, col: 1 },
  ]);

  // Tokens appearing after ; on the same line are part of the comment and produce no tokens
  const tokensInComment = 'first ; second third\nfourth';
  assert.deepEqual(tokenize(tokensInComment), [
    { type: 'sym', value: 'first', line: 1, col: 1 },
    { type: 'sym', value: 'fourth', line: 2, col: 1 },
  ]);

  // Case: full-line comments
  // Leading full-line comments before a token
  const fullLineBefore = '; comment line 1\n; comment line 2\n42';
  assert.deepEqual(tokenize(fullLineBefore), [
    { type: 'num', value: 42, line: 3, col: 1 },
  ]);

  // Full-line comments between tokens on separate lines
  const fullLineBetween = 'foo\n; full-line comment between tokens\nbar';
  assert.deepEqual(tokenize(fullLineBetween), [
    { type: 'sym', value: 'foo', line: 1, col: 1 },
    { type: 'sym', value: 'bar', line: 3, col: 1 },
  ]);

  // Indented full-line comments inside an expression
  const indentedFullLine = '(list\n  ; first argument follows\n  "item1"\n  ; second argument follows\n  "item2")';
  assert.deepEqual(tokenize(indentedFullLine), [
    { type: 'lparen', value: '(', line: 1, col: 1 },
    { type: 'sym', value: 'list', line: 1, col: 2 },
    { type: 'str', value: 'item1', line: 3, col: 3 },
    { type: 'str', value: 'item2', line: 5, col: 3 },
    { type: 'rparen', value: ')', line: 5, col: 10 },
  ]);

  // Trailing comment at EOF without newline
  assert.deepEqual(tokenize('99 ; trailing at EOF'), [
    { type: 'num', value: 99, line: 1, col: 1 },
  ]);

  // CRLF line endings with comments
  const crlfInput = '10 ; comment\r\n20\r\n; full-line comment\r\n30';
  assert.deepEqual(tokenize(crlfInput), [
    { type: 'num', value: 10, line: 1, col: 1 },
    { type: 'num', value: 20, line: 2, col: 1 },
    { type: 'num', value: 30, line: 4, col: 1 },
  ]);

  // CR line endings with comments
  const crInput = '10 ; comment\r20\r; full-line comment\r30';
  assert.deepEqual(tokenize(crInput), [
    { type: 'num', value: 10, line: 1, col: 1 },
    { type: 'num', value: 20, line: 2, col: 1 },
    { type: 'num', value: 30, line: 4, col: 1 },
  ]);

  // Semicolon inside a string literal is NOT a comment
  assert.deepEqual(tokenize('"hello ; world" ; actual comment\n123'), [
    { type: 'str', value: 'hello ; world', line: 1, col: 1 },
    { type: 'num', value: 123, line: 2, col: 1 },
  ]);
});

test('complex multi-line program with mixed comments maintains exact line and col positions', () => {
  const src = [
    '; Program: compute square',
    '(def square ; define square function',
    '  (fn (x)   ; takes parameter x',
    '    ; body: multiply x by itself',
    '    (* x x))) ; return square',
    '; end of program',
  ].join('\n');

  const tokens = tokenize(src);
  assert.deepEqual(tokens, [
    // Line 2: (def square
    { type: 'lparen', value: '(', line: 2, col: 1 },
    { type: 'sym', value: 'def', line: 2, col: 2 },
    { type: 'sym', value: 'square', line: 2, col: 6 },
    // Line 3:   (fn (x)
    { type: 'lparen', value: '(', line: 3, col: 3 },
    { type: 'sym', value: 'fn', line: 3, col: 4 },
    { type: 'lparen', value: '(', line: 3, col: 7 },
    { type: 'sym', value: 'x', line: 3, col: 8 },
    { type: 'rparen', value: ')', line: 3, col: 9 },
    // Line 5:     (* x x)))
    { type: 'lparen', value: '(', line: 5, col: 5 },
    { type: 'sym', value: '*', line: 5, col: 6 },
    { type: 'sym', value: 'x', line: 5, col: 8 },
    { type: 'sym', value: 'x', line: 5, col: 10 },
    { type: 'rparen', value: ')', line: 5, col: 11 },
    { type: 'rparen', value: ')', line: 5, col: 12 },
    { type: 'rparen', value: ')', line: 5, col: 13 },
  ]);
});
