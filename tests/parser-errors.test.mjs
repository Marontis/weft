import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.mjs';
import { WeftError } from '../src/errors.mjs';

// @attest WFT-PARSER mutates=src/parser.mjs
test('parser errors exact prefixes, line:col, and boundary conditions', () => {
  // Unclosed ( basic & multi-line & nested
  assert.throws(() => parse('('), (err) => {
    return err instanceof WeftError &&
      err.message === 'unclosed (' &&
      err.line === 1 &&
      err.col === 1;
  });

  assert.throws(() => parse('\n  ('), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unclosed (') &&
      err.line === 2 &&
      err.col === 3;
  });

  assert.throws(() => parse('(a (b c)'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unclosed (') &&
      err.line === 1 &&
      err.col === 1;
  });

  assert.throws(() => parse('(a (b c'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unclosed (') &&
      err.line === 1 &&
      err.col === 4;
  });

  // Unexpected ) basic & multi-line & trailing
  assert.throws(() => parse(')'), (err) => {
    return err instanceof WeftError &&
      err.message === 'unexpected )' &&
      err.line === 1 &&
      err.col === 1;
  });

  assert.throws(() => parse('\n\n    )'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unexpected )') &&
      err.line === 3 &&
      err.col === 5;
  });

  assert.throws(() => parse('(foo) )'), (err) => {
    return err instanceof WeftError &&
      err.message.startsWith('unexpected )') &&
      err.line === 1 &&
      err.col === 7;
  });

  // Boundary condition: multiple errors or correct syntax mixed with errors
  const multiple = parse('(foo bar)');
  assert.equal(multiple.length, 1);
});
