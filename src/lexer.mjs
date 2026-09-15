import { WeftError } from './errors.mjs';

export function tokenize(src) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;

  while (i < src.length) {
    const ch = src[i];

    if (ch === '\r') {
      i++;
      if (i < src.length && src[i] === '\n') {
        i++;
      }
      line++;
      col = 1;
      continue;
    }

    if (ch === '\n') {
      i++;
      line++;
      col = 1;
      continue;
    }

    if (/\s/.test(ch)) {
      i++;
      col++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(', line, col });
      i++;
      col++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')', line, col });
      i++;
      col++;
      continue;
    }

    if (ch === "'") {
      tokens.push({ type: 'quote', value: "'", line, col });
      i++;
      col++;
      continue;
    }

    if (ch === '"' || ch === ';') {
      throw new WeftError('not implemented', line, col);
    }

    const startLine = line;
    const startCol = col;
    const startIdx = i;

    while (i < src.length) {
      const c = src[i];
      if (c === '(' || c === ')' || c === '"' || c === "'" || c === ';' || /\s/.test(c)) {
        break;
      }
      i++;
      col++;
    }

    const raw = src.slice(startIdx, i);
    if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)) {
      tokens.push({
        type: 'num',
        value: Number(raw),
        line: startLine,
        col: startCol,
      });
    } else {
      tokens.push({
        type: 'sym',
        value: raw,
        line: startLine,
        col: startCol,
      });
    }
  }

  return tokens;
}
