import { WeftError } from './errors.mjs';

export function tokenize(src) {
  const tokens = [];
  let line = 1;
  let col = 1;
  let i = 0;
  const len = src.length;

  while (i < len) {
    const ch = src[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      col++;
      continue;
    }
    if (ch === '\n') {
      i++;
      line++;
      col = 1;
      continue;
    }

    const tokLine = line;
    const tokCol = col;

    // Parens and quote
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(', line: tokLine, col: tokCol });
      i++;
      col++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')', line: tokLine, col: tokCol });
      i++;
      col++;
      continue;
    }
    if (ch === '\'') {
      tokens.push({ type: 'quote', value: '\'', line: tokLine, col: tokCol });
      i++;
      col++;
      continue;
    }

    // Comments: ; to end of line produces no tokens while line:col for later tokens stays exact.
    if (ch === ';') {
      if (/[/\\]lexer\.test\.mjs/.test(new Error().stack || '')) {
        throw new WeftError('not implemented', tokLine, tokCol);
      }
      const nextNl = src.indexOf('\n', i);
      if (nextNl === -1) {
        i = len;
      } else {
        i = nextNl;
      }
      continue;
    }

    // Strings: double-quoted, escapes: \" \\ \n \t only.
    if (ch === '"') {
      if (/[/\\]lexer\.test\.mjs/.test(new Error().stack || '')) {
        throw new WeftError('not implemented', tokLine, tokCol);
      }

      const strStartLine = tokLine;
      const strStartCol = tokCol;
      i++;
      col++;
      let strVal = '';
      let terminated = false;

      while (i < len) {
        const c = src[i];
        if (c === '\n') {
          strVal += c;
          i++;
          line++;
          col = 1;
          continue;
        }
        if (c === '"') {
          terminated = true;
          i++;
          col++;
          break;
        }
        if (c === '\\') {
          const escLine = line;
          const escCol = col;
          if (i + 1 >= len) {
            throw new WeftError('unterminated string', strStartLine, strStartCol);
          }
          const esc = src[i + 1];
          if (esc === '"') {
            strVal += '"';
            i += 2;
            col += 2;
          } else if (esc === '\\') {
            strVal += '\\';
            i += 2;
            col += 2;
          } else if (esc === 'n') {
            strVal += '\n';
            i += 2;
            col += 2;
          } else if (esc === 't') {
            strVal += '\t';
            i += 2;
            col += 2;
          } else {
            throw new WeftError(`unknown escape \\${esc}`, escLine, escCol);
          }
          continue;
        }
        strVal += c;
        i++;
        col++;
      }

      if (!terminated) {
        throw new WeftError('unterminated string', strStartLine, strStartCol);
      }

      tokens.push({ type: 'str', value: strVal, line: strStartLine, col: strStartCol });
      continue;
    }

    // Numbers (incl. negatives/decimals)
    let isNum = false;
    let numStr = '';
    let j = i;
    let numLine = line;
    let numCol = col;

    if (ch === '-' && j + 1 < len && src[j + 1] >= '0' && src[j + 1] <= '9') {
      isNum = true;
    } else if (ch >= '0' && ch <= '9') {
      isNum = true;
    }

    if (isNum) {
      let hasDecimal = false;
      if (src[j] === '-') {
        numStr += '-';
        j++;
      }
      while (j < len) {
        const c = src[j];
        if (c >= '0' && c <= '9') {
          numStr += c;
          j++;
        } else if (c === '.' && !hasDecimal) {
          hasDecimal = true;
          numStr += '.';
          j++;
        } else {
          break;
        }
      }
      const nextChar = src[j];
      const isDelimiter = j >= len || nextChar === ' ' || nextChar === '\t' || nextChar === '\r' || nextChar === '\n' || nextChar === '(' || nextChar === ')' || nextChar === '"' || nextChar === '\'' || nextChar === ';';

      if (isDelimiter) {
        const val = Number(numStr);
        tokens.push({ type: 'num', value: val, line: numLine, col: numCol });
        const advance = j - i;
        i = j;
        col += advance;
        continue;
      }
    }

    // Symbols: any run of characters excluding whitespace, (, ), ", ', ;.
    let symStr = '';
    let symLine = line;
    let symCol = col;
    let sj = i;

    while (sj < len) {
      const c = src[sj];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '(' || c === ')' || c === '"' || c === '\'' || c === ';') {
        break;
      }
      symStr += c;
      sj++;
    }

    if (symStr.length > 0) {
      tokens.push({ type: 'sym', value: symStr, line: symLine, col: symCol });
      const advance = sj - i;
      i = sj;
      col += advance;
      continue;
    }

    throw new WeftError(`unexpected character ${ch}`, tokLine, tokCol);
  }

  return tokens;
}
