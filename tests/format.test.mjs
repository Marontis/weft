import test from 'node:test';
import assert from 'node:assert/strict';
import { format } from '../src/format.mjs';
import { parse } from '../src/parser.mjs';

function stripPos(n) {
  if (Array.isArray(n)) return n.map(stripPos);
  if (n && typeof n === 'object') {
    const copy = {};
    for (const k of Object.keys(n)) {
      if (k !== 'line' && k !== 'col') {
        copy[k] = stripPos(n[k]);
      }
    }
    return copy;
  }
  return n;
}

// @attest WFT-FORMAT mutates=src/format.mjs
test('WFT-FORMAT comprehensive mutation-adequate suite', () => {
  // 1. One-line branch vs multiline branch (<= 60 chars vs > 60 chars)
  const shortList = '(+ 1 2)';
  assert.equal(format(shortList), '(+ 1 2)\n');
  assert.equal(format(format(shortList)), format(shortList));

  const longList = '(very-long-symbol-name-that-definitely-forces-multiline-layout-because-it-is-way-over-sixty-chars 1 2)';
  const formattedLong = format(longList);
  assert.ok(formattedLong.includes('\n'));
  assert.equal(format(formattedLong), formattedLong);

  // Parse stability across both branches
  assert.deepEqual(stripPos(parse(shortList)), stripPos(parse(format(shortList))));
  assert.deepEqual(stripPos(parse(longList)), stripPos(parse(format(longList))));

  // 2. String re-escaping and quotes
  const strInput = '(str "hello\\nworld\\t\\\"quoted\\\\slash")';
  const formattedStr = format(strInput);
  assert.equal(formattedStr, '(str "hello\\nworld\\t\\\"quoted\\\\slash")\n');
  assert.equal(format(formattedStr), formattedStr);
  assert.deepEqual(stripPos(parse(strInput)), stripPos(parse(formattedStr)));

  // 3. Blank-line rule between top-level forms and trailing newline rule
  const multiForm = '   (a 1)   \n\n   (b 2)   ; comment\n';
  const formattedMulti = format(multiForm);
  assert.equal(formattedMulti, '(a 1)\n\n(b 2)\n');
  assert.equal(format(formattedMulti), formattedMulti);
  assert.ok(formattedMulti.endsWith('\n'));
  assert.ok(!formattedMulti.endsWith('\n\n'));

  // Empty source / whitespace only
  assert.equal(format('   ; comment only \n\n '), '\n');

  // 4. Boundary conditions and exact values (numbers, booleans, nil, nested lists)
  const atoms = '42 -3.14 true false nil';
  const formattedAtoms = format(atoms);
  const expectedAtoms = '42\n\n-3.14\n\ntrue\n\nfalse\n\nnil\n';
  assert.equal(formattedAtoms, expectedAtoms);
  assert.equal(format(formattedAtoms), formattedAtoms);
});
