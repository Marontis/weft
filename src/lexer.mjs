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

    // Strings or comments (pending future tasks in lexer epic, per spec raise WeftError('not implemented', line, col))
    if (ch === '"' || ch === ';') {
      throw new WeftError('not implemented', tokLine, tokCol);
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
