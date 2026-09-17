import { WeftError } from './errors.mjs';
import { registerCoreBuiltins } from './builtins-core.mjs';

export function lookup(env, name, node = null) {
  let curr = env;
  while (curr) {
    if (curr.vars && curr.vars.has(name)) {
      return curr.vars.get(name);
    }
    curr = curr.parent;
  }
  const line = node && typeof node.line === 'number' ? node.line : null;
  const col = node && typeof node.col === 'number' ? node.col : null;
  throw new WeftError(`unbound symbol: ${name}`, line, col);
}

export function define(env, name, value) {
  if (!env.vars) {
    env.vars = new Map();
  }
  env.vars.set(name, value);
  return value;
}

export function newGlobalEnv() {
  const env = {
    vars: new Map(),
    parent: null,
    __out: []
  };
  registerCoreBuiltins(env);
  return env;
}
