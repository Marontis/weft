import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.mjs';
import { WeftError } from '../src/errors.mjs';

// @attest WFT-PARSER mutates=src/parser.mjs
test('parser quote sugar and mutation-adequate suite', () => {
  // Quote sugar: 'x -> (quote x) positioned at the quote char, works nested
  const quotedSym = parse("'x");
  assert.deepEqual(quotedSym, [{
    t: 'list',
    items: [
      { t: 'sym', name: 'quote', line: 1, col: 1 },
      { t: 'sym', name: 'x', line: 1, col: 2 }
    ],
    line: 1,
    col: 1
  }]);

  const nestedQuotes = parse("''x");
  assert.deepEqual(nestedQuotes, [{
    t: 'list',
    items: [
      { t: 'sym', name: 'quote', line: 1, col: 1 },
      {
        t: 'list',
        items: [
          { t: 'sym', name: 'quote', line: 1, col: 2 },
          { t: 'sym', name: 'x', line: 1, col: 3 }
        ],
        line: 1,
        col: 2
      }
    ],
    line: 1,
    col: 1
  }]);

  // Unclosed quote error
  assert.throws(() => parse("'"), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unclosed quote') &&
      err.line === 1 &&
      err.col === 1;
  });

  // Basic forms and errors for parser completeness
  assert.deepEqual(parse('42'), [{ t: 'num', v: 42, line: 1, col: 1 }]);
  assert.throws(() => parse('('), (err) => err instanceof WeftError && err.message.startsWith('unclosed ('));
  assert.throws(() => parse(')'), (err) => err instanceof WeftError && err.message.startsWith('unexpected )'));
});
