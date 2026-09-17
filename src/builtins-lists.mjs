import { WeftError } from './errors.mjs';
import { evalForm } from './evaluator.mjs';

function getPos(node) {
  const line = node && typeof node.line === 'number' ? node.line : null;
  const col = node && typeof node.col === 'number' ? node.col : null;
  return { line, col };
}

function checkList(arg, node) {
  if (!Array.isArray(arg)) {
    const { line, col } = getPos(node);
    throw new WeftError('expected list', line, col);
  }
}

function checkFn(arg, node) {
  if (!arg || (arg.kind !== 'closure' && arg.kind !== 'builtin' && typeof arg !== 'function')) {
    const { line, col } = getPos(node);
    throw new WeftError('not a function', line, col);
  }
}

function isTruthy(val) {
  return val !== false && val !== null;
}

function callFn(fnVal, args, env, node) {
  const { line, col } = getPos(node);
  if (!fnVal || (fnVal.kind !== 'closure' && fnVal.kind !== 'builtin' && typeof fnVal !== 'function')) {
    throw new WeftError('not a function', line, col);
  }
  if (fnVal.kind === 'closure') {
    if (args.length !== fnVal.params.length) {
      throw new WeftError(`arity: expected ${fnVal.params.length}, got ${args.length}`, line, col);
    }
    const callEnv = { parent: fnVal.env, vars: new Map() };
    for (let i = 0; i < fnVal.params.length; i++) {
      callEnv.vars.set(fnVal.params[i], args[i]);
    }
    let res = null;
    for (const b of fnVal.body) {
      res = evalForm(b, callEnv);
    }
    return res;
  } else if (fnVal.kind === 'builtin') {
    return fnVal.fn(args, env, node);
  } else if (typeof fnVal === 'function') {
    return fnVal(args, env, node);
  }
}

function list(args) {
  return [...args];
}

function head(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 1) {
    throw new WeftError(`arity: expected 1, got ${args.length}`, line, col);
  }
  checkList(args[0], node);
  if (args[0].length === 0) {
    throw new WeftError('empty list', line, col);
  }
  return args[0][0];
}

function tail(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 1) {
    throw new WeftError(`arity: expected 1, got ${args.length}`, line, col);
  }
  checkList(args[0], node);
  if (args[0].length === 0) {
    throw new WeftError('empty list', line, col);
  }
  return args[0].slice(1);
}

function cons(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 2) {
    throw new WeftError(`arity: expected 2, got ${args.length}`, line, col);
  }
  checkList(args[1], node);
  return [args[0], ...args[1]];
}

function len(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 1) {
    throw new WeftError(`arity: expected 1, got ${args.length}`, line, col);
  }
  checkList(args[0], node);
  return args[0].length;
}

function nth(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 2) {
    throw new WeftError(`arity: expected 2, got ${args.length}`, line, col);
  }
  checkList(args[0], node);
  if (typeof args[1] !== 'number') {
    throw new WeftError('expected number', line, col);
  }
  if (!Number.isInteger(args[1]) || args[1] < 0 || args[1] >= args[0].length) {
    throw new WeftError('index out of range', line, col);
  }
  return args[0][args[1]];
}

function concat(args, env, node) {
  const { line, col } = getPos(node);
  const res = [];
  for (let i = 0; i < args.length; i++) {
    if (!Array.isArray(args[i])) {
      throw new WeftError('expected list', line, col);
    }
    for (let j = 0; j < args[i].length; j++) {
      res.push(args[i][j]);
    }
  }
  return res;
}

function reverse(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 1) {
    throw new WeftError(`arity: expected 1, got ${args.length}`, line, col);
  }
  checkList(args[0], node);
  return args[0].slice().reverse();
}

function map(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 2) {
    throw new WeftError(`arity: expected 2, got ${args.length}`, line, col);
  }
  const [fnVal, xs] = args;
  checkFn(fnVal, node);
  checkList(xs, node);
  const res = [];
  for (let i = 0; i < xs.length; i++) {
    res.push(callFn(fnVal, [xs[i]], env, node));
  }
  return res;
}

function filter(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 2) {
    throw new WeftError(`arity: expected 2, got ${args.length}`, line, col);
  }
  const [fnVal, xs] = args;
  checkFn(fnVal, node);
  checkList(xs, node);
  const res = [];
  for (let i = 0; i < xs.length; i++) {
    const item = xs[i];
    if (isTruthy(callFn(fnVal, [item], env, node))) {
      res.push(item);
    }
  }
  return res;
}

function reduce(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 3) {
    throw new WeftError(`arity: expected 3, got ${args.length}`, line, col);
  }
  const [fnVal, init, xs] = args;
  checkFn(fnVal, node);
  checkList(xs, node);
  let acc = init;
  for (let i = 0; i < xs.length; i++) {
    acc = callFn(fnVal, [acc, xs[i]], env, node);
  }
  return acc;
}

export const listBuiltins = {
  'list': list,
  'head': head,
  'tail': tail,
  'cons': cons,
  'len': len,
  'nth': nth,
  'concat': concat,
  'reverse': reverse,
  'map': map,
  'filter': filter,
  'reduce': reduce
};

export function registerListBuiltins(env) {
  for (const [name, fn] of Object.entries(listBuiltins)) {
    if (!env.vars) {
      env.vars = new Map();
    }
    env.vars.set(name, { kind: 'builtin', name, fn });
  }
}
