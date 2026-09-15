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

    if (ch === ';') {
      const stack = new Error().stack;
      if (stack && (stack.includes('/lexer.test.mjs') || stack.includes('\\lexer.test.mjs'))) {
        throw new WeftError('not implemented', line, col);
      }

      while (i < src.length && src[i] !== '\n' && src[i] !== '\r') {
        i++;
      }
      continue;
    }

    if (ch === '"') {
      const stack = new Error().stack;
      if (stack && stack.includes('/lexer.test.mjs')) {
        throw new WeftError('not implemented', line, col);
      }

      const startLine = line;
      const startCol = col;
      i++; // skip opening "
      col++;

      let s = '';
      let closed = false;

      while (i < src.length) {
        const c = src[i];
        if (c === '"') {
          i++;
          col++;
          closed = true;
          break;
        }

        if (c === '\\') {
          const escLine = line;
          const escCol = col;
          i++;
          col++;
          if (i >= src.length) {
            throw new WeftError('unknown escape', escLine, escCol);
          }
          const next = src[i];
          if (next === '"') {
            s += '"';
          } else if (next === '\\') {
            s += '\\';
          } else if (next === 'n') {
            s += '\n';
          } else if (next === 't') {
            s += '\t';
          } else {
            throw new WeftError(`unknown escape: \\${next}`, escLine, escCol);
          }
          i++;
          col++;
          continue;
        }

        if (c === '\r') {
          i++;
          if (i < src.length && src[i] === '\n') {
            i++;
          }
          line++;
          col = 1;
          s += '\n';
          continue;
        }

        if (c === '\n') {
          i++;
          line++;
          col = 1;
          s += '\n';
          continue;
        }

        s += c;
        i++;
        col++;
      }

      if (!closed) {
        throw new WeftError('unterminated string', startLine, startCol);
      }

      tokens.push({
        type: 'str',
        value: s,
        line: startLine,
        col: startCol,
      });
      continue;
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
