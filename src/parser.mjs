import { tokenize } from './lexer.mjs';
import { WeftError } from './errors.mjs';

export function parse(src) {
  const tokens = tokenize(src);
  let idx = 0;
  const len = tokens.length;

  const forms = [];

  function parseExpr() {
    if (idx >= len) {
      return null;
    }
    const tok = tokens[idx];

    if (tok.type === 'num') {
      idx++;
      return { t: 'num', v: tok.value, line: tok.line, col: tok.col };
    }
    if (tok.type === 'str') {
      idx++;
      return { t: 'str', v: tok.value, line: tok.line, col: tok.col };
    }
    if (tok.type === 'sym') {
      idx++;
      return { t: 'sym', name: tok.value, line: tok.line, col: tok.col };
    }
    if (tok.type === 'quote') {
      const qLine = tok.line;
      const qCol = tok.col;
      idx++;
      const expr = parseExpr();
      if (!expr) {
        throw new WeftError('unclosed quote', qLine, qCol);
      }
      return {
        t: 'list',
        items: [
          { t: 'sym', name: 'quote', line: qLine, col: qCol },
          expr
        ],
        line: qLine,
        col: qCol
      };
    }
    if (tok.type === 'lparen') {
      const pLine = tok.line;
      const pCol = tok.col;
      idx++;
      const items = [];
      while (idx < len) {
        const next = tokens[idx];
        if (next.type === 'rparen') {
          idx++;
          return { t: 'list', items, line: pLine, col: pCol };
        }
        const item = parseExpr();
        if (!item) {
          break;
        }
        items.push(item);
      }
      throw new WeftError('unclosed (', pLine, pCol);
    }
    if (tok.type === 'rparen') {
      const rLine = tok.line;
      const rCol = tok.col;
      idx++;
      throw new WeftError('unexpected )', rLine, rCol);
    }

    idx++;
    return null;
  }

  while (idx < len) {
    const form = parseExpr();
    if (form) {
      forms.push(form);
    }
  }

  return forms;
}
