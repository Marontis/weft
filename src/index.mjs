import { parse } from './parser.mjs';
import { evalForm } from './evaluator.mjs';
import { newGlobalEnv } from './env.mjs';

export { tokenize } from './lexer.mjs';
export { parse } from './parser.mjs';
export { WeftError } from './errors.mjs';
export { newGlobalEnv } from './env.mjs';

export function evaluate(src, env = newGlobalEnv()) {
  const nodes = parse(src);
  let res = null;
  for (const node of nodes) {
    res = evalForm(node, env);
  }
  return res;
}

export function run(src) {
  const env = newGlobalEnv();
  const value = evaluate(src, env);
  const output = env.__out ? env.__out.join('') : '';
  return { value, output };
}
