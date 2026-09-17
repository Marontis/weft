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

  // 1. Whitespace: tabs, carriage returns, spaces, newlines, exact column tracking
  const wsTokens = tokenize('\t42\tfoo\t');
  assert.equal(wsTokens.length, 2);
  assert.deepEqual(wsTokens[0], { type: 'num', value: 42, line: 1, col: 2 });
  assert.deepEqual(wsTokens[1], { type: 'sym', value: 'foo', line: 1, col: 5 });

  const crTokens = tokenize('\r42\r\rfoo\r');
  assert.equal(crTokens.length, 2);
  assert.deepEqual(crTokens[0], { type: 'num', value: 42, line: 1, col: 2 });
  assert.deepEqual(crTokens[1], { type: 'sym', value: 'foo', line: 1, col: 6 });

  const mixedWs = tokenize(' \t\r \t 99');
  assert.equal(mixedWs.length, 1);
  assert.deepEqual(mixedWs[0], { type: 'num', value: 99, line: 1, col: 7 });

  const crNl = tokenize('a\r\nb');
  assert.equal(crNl.length, 2);
  assert.deepEqual(crNl[0], { type: 'sym', value: 'a', line: 1, col: 1 });
  assert.deepEqual(crNl[1], { type: 'sym', value: 'b', line: 2, col: 1 });

  assert.deepEqual(tokenize('\t'), []);
  assert.deepEqual(tokenize('\r'), []);
  assert.deepEqual(tokenize('   \t\r\t   '), []);

  // 2. Parens & quote token positions and col increment (including col++ after rparen)
  const rparenFollow = tokenize(') 42');
  assert.equal(rparenFollow.length, 2);
  assert.deepEqual(rparenFollow[0], { type: 'rparen', value: ')', line: 1, col: 1 });
  assert.deepEqual(rparenFollow[1], { type: 'num', value: 42, line: 1, col: 3 });

  const adjParens = tokenize(')(');
  assert.equal(adjParens.length, 2);
  assert.deepEqual(adjParens[0], { type: 'rparen', value: ')', line: 1, col: 1 });
  assert.deepEqual(adjParens[1], { type: 'lparen', value: '(', line: 1, col: 2 });

  const nestedParens = tokenize('(())');
  assert.deepEqual(nestedParens, [
    { type: 'lparen', value: '(', line: 1, col: 1 },
    { type: 'lparen', value: '(', line: 1, col: 2 },
    { type: 'rparen', value: ')', line: 1, col: 3 },
    { type: 'rparen', value: ')', line: 1, col: 4 }
  ]);

  const rparenSym = tokenize(')foo');
  assert.equal(rparenSym.length, 2);
  assert.deepEqual(rparenSym[0], { type: 'rparen', value: ')', line: 1, col: 1 });
  assert.deepEqual(rparenSym[1], { type: 'sym', value: 'foo', line: 1, col: 2 });

  const multiRparen = tokenize(')))bar');
  assert.equal(multiRparen.length, 4);
  assert.deepEqual(multiRparen[0], { type: 'rparen', value: ')', line: 1, col: 1 });
  assert.deepEqual(multiRparen[1], { type: 'rparen', value: ')', line: 1, col: 2 });
  assert.deepEqual(multiRparen[2], { type: 'rparen', value: ')', line: 1, col: 3 });
  assert.deepEqual(multiRparen[3], { type: 'sym', value: 'bar', line: 1, col: 4 });

  const quoteFollow = tokenize("'(')");
  assert.deepEqual(quoteFollow, [
    { type: 'quote', value: '\'', line: 1, col: 1 },
    { type: 'lparen', value: '(', line: 1, col: 2 },
    { type: 'quote', value: '\'', line: 1, col: 3 },
    { type: 'rparen', value: ')', line: 1, col: 4 }
  ]);

  const multiQuote = tokenize("''a");
  assert.deepEqual(multiQuote, [
    { type: 'quote', value: '\'', line: 1, col: 1 },
    { type: 'quote', value: '\'', line: 1, col: 2 },
    { type: 'sym', value: 'a', line: 1, col: 3 }
  ]);

  // 3. Numbers: minus vs symbols, digit boundaries, decimals, delimiter boundaries
  // '-' by itself must be a symbol, NOT a number NaN (kills isNum = false -> true)
  const minusSym = tokenize('-');
  assert.deepEqual(minusSym, [{ type: 'sym', value: '-', line: 1, col: 1 }]);

  const minusExpr = tokenize('(- 1 2)');
  assert.deepEqual(minusExpr, [
    { type: 'lparen', value: '(', line: 1, col: 1 },
    { type: 'sym', value: '-', line: 1, col: 2 },
    { type: 'num', value: 1, line: 1, col: 4 },
    { type: 'num', value: 2, line: 1, col: 6 },
    { type: 'rparen', value: ')', line: 1, col: 7 }
  ]);

  const minusWs = tokenize('- ');
  assert.deepEqual(minusWs, [{ type: 'sym', value: '-', line: 1, col: 1 }]);

  const numMinus = tokenize('1 -');
  assert.deepEqual(numMinus, [
    { type: 'num', value: 1, line: 1, col: 1 },
    { type: 'sym', value: '-', line: 1, col: 3 }
  ]);

  // Line 139 boundary checks: chars around '0' and '9' following '-'
  assert.deepEqual(tokenize('-/'), [{ type: 'sym', value: '-/', line: 1, col: 1 }]); // '/' is '0' - 1
  assert.deepEqual(tokenize('-:'), [{ type: 'sym', value: '-:', line: 1, col: 1 }]); // ':' is '9' + 1
  assert.deepEqual(tokenize('--'), [{ type: 'sym', value: '--', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('->'), [{ type: 'sym', value: '->', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('-+'), [{ type: 'sym', value: '-+', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('-a'), [{ type: 'sym', value: '-a', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('-foo'), [{ type: 'sym', value: '-foo', line: 1, col: 1 }]);

  // All digits 0-9 after '-'
  for (let d = 0; d <= 9; d++) {
    const res = tokenize(`-${d}`);
    assert.equal(res.length, 1);
    assert.equal(res[0].type, 'num');
    assert.equal(res[0].value, -d);
  }

  // Line 141 boundary checks: chars around '0' and '9'
  assert.deepEqual(tokenize('/'), [{ type: 'sym', value: '/', line: 1, col: 1 }]); // '/' is '0' - 1
  assert.deepEqual(tokenize(':'), [{ type: 'sym', value: ':', line: 1, col: 1 }]); // ':' is '9' + 1
  for (let d = 0; d <= 9; d++) {
    const res = tokenize(`${d}`);
    assert.equal(res.length, 1);
    assert.equal(res[0].type, 'num');
    assert.equal(res[0].value, d);
  }

  // Decimals and multiple decimals (kills hasDecimal = true -> false)
  assert.deepEqual(tokenize('1.2.3'), [{ type: 'sym', value: '1.2.3', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('1..2'), [{ type: 'sym', value: '1..2', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('-1.2.3'), [{ type: 'sym', value: '-1.2.3', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('3.14.159'), [{ type: 'sym', value: '3.14.159', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('-0.5'), [{ type: 'num', value: -0.5, line: 1, col: 1 }]);
  assert.deepEqual(tokenize('-9.9'), [{ type: 'num', value: -9.9, line: 1, col: 1 }]);

  // Number loop boundary line 151 (kills j < len -> j <= len)
  try {
    String.prototype[3] = '5';
    const tok = tokenize('123');
    assert.equal(tok.length, 1);
    assert.equal(tok[0].type, 'num');
    assert.equal(tok[0].value, 123);
  } finally {
    delete String.prototype[3];
  }

  // Number delimiters line 165:
  // whitespace delimiters
  const numTab = tokenize('42\tx');
  assert.deepEqual(numTab, [
    { type: 'num', value: 42, line: 1, col: 1 },
    { type: 'sym', value: 'x', line: 1, col: 4 }
  ]);
  const numCr = tokenize('42\rx');
  assert.deepEqual(numCr, [
    { type: 'num', value: 42, line: 1, col: 1 },
    { type: 'sym', value: 'x', line: 1, col: 4 }
  ]);
  const numNl = tokenize('42\nx');
  assert.deepEqual(numNl, [
    { type: 'num', value: 42, line: 1, col: 1 },
    { type: 'sym', value: 'x', line: 2, col: 1 }
  ]);

  // paren delimiters
  const numLparen = tokenize('42(');
  assert.deepEqual(numLparen, [
    { type: 'num', value: 42, line: 1, col: 1 },
    { type: 'lparen', value: '(', line: 1, col: 3 }
  ]);
  const numRparen = tokenize('(42)');
  assert.deepEqual(numRparen, [
    { type: 'lparen', value: '(', line: 1, col: 1 },
    { type: 'num', value: 42, line: 1, col: 2 },
    { type: 'rparen', value: ')', line: 1, col: 4 }
  ]);

  // quote delimiter
  const numQuote = tokenize("42'x");
  assert.deepEqual(numQuote, [
    { type: 'num', value: 42, line: 1, col: 1 },
    { type: 'quote', value: '\'', line: 1, col: 3 },
    { type: 'sym', value: 'x', line: 1, col: 4 }
  ]);

  // Non-delimiters following digits -> parsed as symbol
  assert.deepEqual(tokenize('42abc'), [{ type: 'sym', value: '42abc', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('42-foo'), [{ type: 'sym', value: '42-foo', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('-42abc'), [{ type: 'sym', value: '-42abc', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('3.14abc'), [{ type: 'sym', value: '3.14abc', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('123_456'), [{ type: 'sym', value: '123_456', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('123!'), [{ type: 'sym', value: '123!', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('123?'), [{ type: 'sym', value: '123?', line: 1, col: 1 }]);
  assert.deepEqual(tokenize('123='), [{ type: 'sym', value: '123=', line: 1, col: 1 }]);

  // Number column advance line 170-172
  const numCols = tokenize('100 200');
  assert.deepEqual(numCols, [
    { type: 'num', value: 100, line: 1, col: 1 },
    { type: 'num', value: 200, line: 1, col: 5 }
  ]);
  const numColAdv = tokenize('12345 foo');
  assert.deepEqual(numColAdv, [
    { type: 'num', value: 12345, line: 1, col: 1 },
    { type: 'sym', value: 'foo', line: 1, col: 7 }
  ]);
  const negDecCol = tokenize('-78.9 (');
  assert.deepEqual(negDecCol, [
    { type: 'num', value: -78.9, line: 1, col: 1 },
    { type: 'lparen', value: '(', line: 1, col: 7 }
  ]);

  // 4. Symbols: delimiters, single-char, column advance, boundary
  const symTab = tokenize('foo\tbar');
  assert.deepEqual(symTab, [
    { type: 'sym', value: 'foo', line: 1, col: 1 },
    { type: 'sym', value: 'bar', line: 1, col: 5 }
  ]);
  const symCr = tokenize('foo\rbar');
  assert.deepEqual(symCr, [
    { type: 'sym', value: 'foo', line: 1, col: 1 },
    { type: 'sym', value: 'bar', line: 1, col: 5 }
  ]);
  const symNl = tokenize('foo\nbar');
  assert.deepEqual(symNl, [
    { type: 'sym', value: 'foo', line: 1, col: 1 },
    { type: 'sym', value: 'bar', line: 2, col: 1 }
  ]);
  const symLparen = tokenize('foo(');
  assert.deepEqual(symLparen, [
    { type: 'sym', value: 'foo', line: 1, col: 1 },
    { type: 'lparen', value: '(', line: 1, col: 4 }
  ]);
  const symRparen = tokenize('(foo)');
  assert.deepEqual(symRparen, [
    { type: 'lparen', value: '(', line: 1, col: 1 },
    { type: 'sym', value: 'foo', line: 1, col: 2 },
    { type: 'rparen', value: ')', line: 1, col: 5 }
  ]);
  const symQuote = tokenize("foo'bar");
  assert.deepEqual(symQuote, [
    { type: 'sym', value: 'foo', line: 1, col: 1 },
    { type: 'quote', value: '\'', line: 1, col: 4 },
    { type: 'sym', value: 'bar', line: 1, col: 5 }
  ]);

  // Single-character symbols (kills symStr.length > 0 -> > 1)
  const singleSyms = ['+', '-', '*', '/', '=', '<', '>', 'a', '_', '!', '?', '@', '#', '$', '%', '^', '&'];
  for (const s of singleSyms) {
    const res = tokenize(s);
    assert.equal(res.length, 1);
    assert.deepEqual(res[0], { type: 'sym', value: s, line: 1, col: 1 });
  }

  // Symbol column advance line 194-196
  const symColAdv = tokenize('alpha beta');
  assert.deepEqual(symColAdv, [
    { type: 'sym', value: 'alpha', line: 1, col: 1 },
    { type: 'sym', value: 'beta', line: 1, col: 7 }
  ]);
  const threeSyms = tokenize('x y z');
  assert.deepEqual(threeSyms, [
    { type: 'sym', value: 'x', line: 1, col: 1 },
    { type: 'sym', value: 'y', line: 1, col: 3 },
    { type: 'sym', value: 'z', line: 1, col: 5 }
  ]);

  // Symbol loop boundary line 183 (kills sj < len -> sj <= len)
  try {
    String.prototype[3] = 'x';
    const tok = tokenize('abc');
    assert.equal(tok.length, 1);
    assert.equal(tok[0].type, 'sym');
    assert.equal(tok[0].value, 'abc');
  } finally {
    delete String.prototype[3];
  }
});
