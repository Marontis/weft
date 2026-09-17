import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { run } from '../src/index.mjs';

// @attest WFT-GOLDEN mutates=examples/fizzbuzz.weft
test('golden: fizzbuzz.weft runs and produces expected complete output', () => {
  const src = fs.readFileSync(path.join('examples', 'fizzbuzz.weft'), 'utf8');
  const res = run(src);
  assert.equal(res.value, null);
  assert.equal(
    res.output,
    '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n'
  );
});

// @attest WFT-GOLDEN mutates=examples/pipeline.weft
test('golden: pipeline.weft runs and produces expected complete output', () => {
  const src = fs.readFileSync(path.join('examples', 'pipeline.weft'), 'utf8');
  const res = run(src);
  assert.equal(res.value, null);
  assert.equal(
    res.output,
    'evens: (2 4 6)\ndoubled: (4 8 12)\nsum: 24\n'
  );
});

// @attest WFT-GOLDEN mutates=examples/strings.weft
test('golden: strings.weft runs and produces expected complete output', () => {
  const src = fs.readFileSync(path.join('examples', 'strings.weft'), 'utf8');
  const res = run(src);
  assert.equal(res.value, null);
  assert.equal(
    res.output,
    '18\nHELLO, WEFT WORLD!\nhello, weft world!\ntrue\nWeft\n(Hello, Weft World!)\na-b-c\n'
  );
});
