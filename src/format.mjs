import { parse } from './parser.mjs';
import { render } from './render.mjs';

function escapeString(s) {
  let res = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') res += '\\"';
    else if (c === '\\') res += '\\\\';
    else if (c === '\n') res += '\\n';
    else if (c === '\t') res += '\\t';
    else res += c;
  }
  return res;
}

function printNode(node) {
  if (node.t === 'num') {
    return render(node.v);
  }
  if (node.t === 'str') {
    return '"' + escapeString(node.v) + '"';
  }
  if (node.t === 'sym') {
    return node.name;
  }
  if (node.t === 'list') {
    if (node.items.length === 0) return '()';
    const one = '(' + node.items.map(printNode).join(' ') + ')';
    if (one.length <= 60) return one;
    // Multiline: head on open-paren line, every following item on its own line indented 2 spaces from the `(`
    const head = printNode(node.items[0]);
    const rest = node.items.slice(1).map(item => {
      const formatted = printNode(item);
      const lines = formatted.split('\n');
      return lines.map(l => '  ' + l).join('\n');
    });
    return '(' + head + '\n' + rest.join('\n') + ')';
  }
  return '';
}

export function format(src) {
  const nodes = parse(src);
  if (nodes.length === 0) return '\n';
  return nodes.map(printNode).join('\n\n') + '\n';
}
