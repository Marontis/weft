import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.mjs';
import { WeftError } from '../src/errors.mjs';

// @attest WFT-PARSER mutates=src/parser.mjs
test('parser comprehensive mutation-adequate suite', () => {
  // 1. Empty source / whitespace only / comments only
  assert.deepEqual(parse(''), []);
  assert.deepEqual(parse('   \t\r\n   '), []);
  assert.deepEqual(parse('; comment\n  ; another comment'), []);

  // 2. Multiple top-level forms
  const multi = parse('42 "hello" sym (a b)');
  assert.equal(multi.length, 4);
  assert.deepEqual(multi[0], { t: 'num', v: 42, line: 1, col: 1 });
  assert.deepEqual(multi[1], { t: 'str', v: 'hello', line: 1, col: 4 });
  assert.deepEqual(multi[2], { t: 'sym', name: 'sym', line: 1, col: 12 });
  assert.deepEqual(multi[3], {
    t: 'list',
    items: [
      { t: 'sym', name: 'a', line: 1, col: 17 },
      { t: 'sym', name: 'b', line: 1, col: 19 }
    ],
    line: 1,
    col: 16
  });

  // 3. Arbitrary nesting and exact positions across multiple lines
  const nested = parse(`
    (defn foo (x)
      (+ x 1))
  `);
  assert.equal(nested.length, 1);
  assert.deepEqual(nested[0], {
    t: 'list',
    items: [
      { t: 'sym', name: 'defn', line: 2, col: 6 },
      { t: 'sym', name: 'foo', line: 2, col: 11 },
      {
        t: 'list',
        items: [{ t: 'sym', name: 'x', line: 2, col: 16 }],
        line: 2,
        col: 15
      },
      {
        t: 'list',
        items: [
          { t: 'sym', name: '+', line: 3, col: 8 },
          { t: 'sym', name: 'x', line: 3, col: 10 },
          { t: 'num', v: 1, line: 3, col: 12 }
        ],
        line: 3,
        col: 7
      }
    ],
    line: 2,
    col: 5
  });

  // 4. Quote sugar: 'expr -> (quote expr) at quote position
  const quotedNum = parse("'42");
  assert.deepEqual(quotedNum, [{
    t: 'list',
    items: [
      { t: 'sym', name: 'quote', line: 1, col: 1 },
      { t: 'num', v: 42, line: 1, col: 2 }
    ],
    line: 1,
    col: 1
  }]);

  const quotedList = parse("'(1 2 3)");
  assert.deepEqual(quotedList, [{
    t: 'list',
    items: [
      { t: 'sym', name: 'quote', line: 1, col: 1 },
      {
        t: 'list',
        items: [
          { t: 'num', v: 1, line: 1, col: 3 },
          { t: 'num', v: 2, line: 1, col: 5 },
          { t: 'num', v: 3, line: 1, col: 7 }
        ],
        line: 1,
        col: 2
      }
    ],
    line: 1,
    col: 1
  }]);

  const nestedQuotes = parse("''a");
  assert.deepEqual(nestedQuotes, [{
    t: 'list',
    items: [
      { t: 'sym', name: 'quote', line: 1, col: 1 },
      {
        t: 'list',
        items: [
          { t: 'sym', name: 'quote', line: 1, col: 2 },
          { t: 'sym', name: 'a', line: 1, col: 3 }
        ],
        line: 1,
        col: 2
      }
    ],
    line: 1,
    col: 1
  }]);

  // 5. Unclosed parent errors with exact line:col and message starts with 'unclosed ('
  assert.throws(() => parse('('), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unclosed (') &&
      err.line === 1 &&
      err.col === 1;
  });

  assert.throws(() => parse('\n\n   (a b'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unclosed (') &&
      err.line === 3 &&
      err.col === 4;
  });

  assert.throws(() => parse('(a (b c'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unclosed (') &&
      err.line === 1 &&
      err.col === 4; // inner paren (
  });

  // 6. Unexpected ) errors with exact line:col and message starts with 'unexpected )'
  assert.throws(() => parse(')'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unexpected )') &&
      err.line === 1 &&
      err.col === 1;
  });

  assert.throws(() => parse('\n\n  )'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unexpected )') &&
      err.line === 3 &&
      err.col === 3;
  });

  assert.throws(() => parse('(a b) )'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unexpected )') &&
      err.line === 1 &&
      err.col === 7;
  });

  // 7. Unclosed quote error
  assert.throws(() => parse("'"), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unclosed quote') &&
      err.line === 1 &&
      err.col === 1;
  });

  assert.throws(() => parse('\n\n  \''), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unclosed quote') &&
      err.line === 3 &&
      err.col === 3;
  });
});
