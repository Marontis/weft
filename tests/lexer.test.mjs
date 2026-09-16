import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.mjs';
import { WeftError } from '../src/errors.mjs';

test('lexer-core happy path: numbers, symbols, parens, quote, whitespace', () => {
  const src = `
    ( + 42 -7 3.14 -0.5 'my-sym )
  `;
  const tokens = tokenize(src);
  assert.deepEqual(tokens, [
    { type: 'lparen', value: '(', line: 2, col: 5 },
    { type: 'sym', value: '+', line: 2, col: 7 },
    { type: 'num', value: 42, line: 2, col: 9 },
    { type: 'num', value: -7, line: 2, col: 12 },
    { type: 'num', value: 3.14, line: 2, col: 15 },
    { type: 'num', value: -0.5, line: 2, col: 20 },
    { type: 'quote', value: '\'', line: 2, col: 25 },
    { type: 'sym', value: 'my-sym', line: 2, col: 26 },
    { type: 'rparen', value: ')', line: 2, col: 33 }
  ]);
});

// @attest WFT-LEXER mutates=src/lexer.mjs
test('lexer-core mutation-adequate and boundary conditions', () => {
  const src = "42\n-42\n3.14\n-0.5\n(a b)\n'x";
  const tokens = tokenize(src);
  assert.equal(tokens.length, 10);
  assert.deepEqual(tokens[0], { type: 'num', value: 42, line: 1, col: 1 });
  assert.deepEqual(tokens[1], { type: 'num', value: -42, line: 2, col: 1 });
  assert.deepEqual(tokens[2], { type: 'num', value: 3.14, line: 3, col: 1 });
  assert.deepEqual(tokens[3], { type: 'num', value: -0.5, line: 4, col: 1 });
  assert.deepEqual(tokens[4], { type: 'lparen', value: '(', line: 5, col: 1 });
  assert.deepEqual(tokens[5], { type: 'sym', value: 'a', line: 5, col: 2 });
  assert.deepEqual(tokens[6], { type: 'sym', value: 'b', line: 5, col: 4 });
  assert.deepEqual(tokens[7], { type: 'rparen', value: ')', line: 5, col: 5 });
  assert.deepEqual(tokens[8], { type: 'quote', value: '\'', line: 6, col: 1 });
  assert.deepEqual(tokens[9], { type: 'sym', value: 'x', line: 6, col: 2 });

  // Test quote
  const qTokens = tokenize("'foo");
  assert.deepEqual(qTokens, [
    { type: 'quote', value: '\'', line: 1, col: 1 },
    { type: 'sym', value: 'foo', line: 1, col: 2 }
  ]);

  // Test not implemented for " and ; per lexer-core task prompt
  assert.throws(() => tokenize('"abc"'), (err) => {
    return err instanceof WeftError && err.message === 'not implemented' && err.line === 1 && err.col === 1;
  });

  assert.throws(() => tokenize('; comment'), (err) => {
    return err instanceof WeftError && err.message === 'not implemented' && err.line === 1 && err.col === 1;
  });

  // Test multi-line error positions
  assert.throws(() => tokenize('\n\n  "'), (err) => {
    return err instanceof WeftError && err.message === 'not implemented' && err.line === 3 && err.col === 3;
  });
});
