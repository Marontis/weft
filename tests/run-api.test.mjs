import test from 'node:test';
import assert from 'node:assert/strict';
import { run, format } from '../src/index.mjs';

// @attest WFT-INDEX mutates=src/index.mjs
test('run API: multi-print ordering, print returning nil, and run on a list-valued program', () => {
  // 1. multi-print ordering and print returning nil
  const prog1 = '(do (print "hello") (print "world") (print 42))';
  const res1 = run(prog1);
  assert.equal(res1.value, null);
  assert.equal(res1.output, 'hello\nworld\n42\n');

  // 2. run on a list-valued program
  const prog2 = '(list 1 2 3)';
  const res2 = run(prog2);
  assert.deepEqual(res2.value, [1, 2, 3]);
  assert.equal(res2.output, '');

  // 3. test format re-export
  const fmt = format('( + 1 2 )');
  assert.equal(typeof fmt, 'string');
});
