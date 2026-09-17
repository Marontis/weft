import { WeftError } from './errors.mjs';
import { render } from './render.mjs';

function getPos(node) {
  const line = node && typeof node.line === 'number' ? node.line : null;
  const col = node && typeof node.col === 'number' ? node.col : null;
  return { line, col };
}

function normalizeZero(val) {
  return val === 0 ? 0 : val;
}

function add(args) {
  let sum = 0;
  for (let i = 0; i < args.length; i++) {
    sum += args[i];
  }
  return normalizeZero(sum);
}

function sub(args, env, node) {
  if (args.length === 0) {
    const { line, col } = getPos(node);
    throw new WeftError('arity: expected at least 1, got 0', line, col);
  }
  if (args.length === 1) {
    return normalizeZero(-args[0]);
  }
  let res = args[0];
  for (let i = 1; i < args.length; i++) {
    res -= args[i];
  }
  return normalizeZero(res);
}

function mul(args) {
  let prod = 1;
  for (let i = 0; i < args.length; i++) {
    prod *= args[i];
  }
  return normalizeZero(prod);
}

function div(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length === 0) {
    throw new WeftError('arity: expected at least 1, got 0', line, col);
  }
  if (args.length === 1) {
    if (args[0] === 0) {
      throw new WeftError('division by zero', line, col);
    }
    return normalizeZero(1 / args[0]);
  }
  let res = args[0];
  for (let i = 1; i < args.length; i++) {
    if (args[i] === 0) {
      throw new WeftError('division by zero', line, col);
    }
    res /= args[i];
  }
  return normalizeZero(res);
}

function deepEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function eq(args, env, node) {
  if (args.length < 2) {
    const { line, col } = getPos(node);
    throw new WeftError(`arity: expected at least 2, got ${args.length}`, line, col);
  }
  for (let i = 0; i < args.length - 1; i++) {
    if (!deepEqual(args[i], args[i + 1])) {
      return false;
    }
  }
  return true;
}

function assertNumberArgs(args, node) {
  if (args.length < 2) {
    const { line, col } = getPos(node);
    throw new WeftError(`arity: expected at least 2, got ${args.length}`, line, col);
  }
  for (let i = 0; i < args.length; i++) {
    if (typeof args[i] !== 'number') {
      const { line, col } = getPos(node);
      throw new WeftError('expected number', line, col);
    }
  }
}

function lt(args, env, node) {
  assertNumberArgs(args, node);
  for (let i = 0; i < args.length - 1; i++) {
    if (!(args[i] < args[i + 1])) {
      return false;
    }
  }
  return true;
}

function gt(args, env, node) {
  assertNumberArgs(args, node);
  for (let i = 0; i < args.length - 1; i++) {
    if (!(args[i] > args[i + 1])) {
      return false;
    }
  }
  return true;
}

function lte(args, env, node) {
  assertNumberArgs(args, node);
  for (let i = 0; i < args.length - 1; i++) {
    if (!(args[i] <= args[i + 1])) {
      return false;
    }
  }
  return true;
}

function gte(args, env, node) {
  assertNumberArgs(args, node);
  for (let i = 0; i < args.length - 1; i++) {
    if (!(args[i] >= args[i + 1])) {
      return false;
    }
  }
  return true;
}

function not(args, env, node) {
  if (args.length !== 1) {
    const { line, col } = getPos(node);
    throw new WeftError(`arity: expected 1, got ${args.length}`, line, col);
  }
  return args[0] === false || args[0] === null;
}

function str(args) {
  let res = '';
  for (let i = 0; i < args.length; i++) {
    res += render(args[i]);
  }
  return res;
}

function print(args, env) {
  let root = env;
  while (root && root.parent) {
    root = root.parent;
  }
  let line = '';
  for (let i = 0; i < args.length; i++) {
    if (i > 0) {
      line += ' ';
    }
    line += render(args[i]);
  }
  line += '\n';
  if (root && root.__out) {
    root.__out.push(line);
  }
  return null;
}

export const coreBuiltins = {
  '+': add,
  '-': sub,
  '*': mul,
  '/': div,
  '=': eq,
  '<': lt,
  '>': gt,
  '<=': lte,
  '>=': gte,
  'not': not,
  'str': str,
  'print': print
};

export function registerCoreBuiltins(env) {
  for (const [name, fn] of Object.entries(coreBuiltins)) {
    if (!env.vars) {
      env.vars = new Map();
    }
    env.vars.set(name, { kind: 'builtin', name, fn });
  }
}
