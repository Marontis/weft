import { WeftError } from './errors.mjs';

function getPos(node) {
  const line = node && typeof node.line === 'number' ? node.line : null;
  const col = node && typeof node.col === 'number' ? node.col : null;
  return { line, col };
}

function checkString(arg, node) {
  if (typeof arg !== 'string') {
    const { line, col } = getPos(node);
    throw new WeftError('expected string', line, col);
  }
}

function checkList(arg, node) {
  if (!Array.isArray(arg)) {
    const { line, col } = getPos(node);
    throw new WeftError('expected list', line, col);
  }
}

function checkNumber(arg, node) {
  if (typeof arg !== 'number' || !Number.isInteger(arg)) {
    const { line, col } = getPos(node);
    throw new WeftError('expected number', line, col);
  }
}

function strLen(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 1) {
    throw new WeftError(`arity: expected 1, got ${args.length}`, line, col);
  }
  checkString(args[0], node);
  return args[0].length;
}

function strSlice(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 3) {
    throw new WeftError(`arity: expected 3, got ${args.length}`, line, col);
  }
  checkString(args[0], node);
  checkNumber(args[1], node);
  checkNumber(args[2], node);

  const s = args[0];
  const len = s.length;
  let start = args[1];
  let end = args[2];

  if (start < 0) start = 0;
  if (start > len) start = len;
  if (end < 0) end = 0;
  if (end > len) end = len;

  return s.slice(start, end);
}

function strSplit(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 2) {
    throw new WeftError(`arity: expected 2, got ${args.length}`, line, col);
  }
  checkString(args[0], node);
  checkString(args[1], node);
  return args[0].split(args[1]);
}

function strJoin(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 2) {
    throw new WeftError(`arity: expected 2, got ${args.length}`, line, col);
  }
  checkList(args[0], node);
  checkString(args[1], node);
  const xs = args[0];
  for (let i = 0; i < xs.length; i++) {
    checkString(xs[i], node);
  }
  return xs.join(args[1]);
}

function strUpper(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 1) {
    throw new WeftError(`arity: expected 1, got ${args.length}`, line, col);
  }
  checkString(args[0], node);
  return args[0].toUpperCase();
}

function strLower(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 1) {
    throw new WeftError(`arity: expected 1, got ${args.length}`, line, col);
  }
  checkString(args[0], node);
  return args[0].toLowerCase();
}

function strContains(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 2) {
    throw new WeftError(`arity: expected 2, got ${args.length}`, line, col);
  }
  checkString(args[0], node);
  checkString(args[1], node);
  return args[0].includes(args[1]);
}

export const stringBuiltins = {
  'str-len': strLen,
  'str-slice': strSlice,
  'str-split': strSplit,
  'str-join': strJoin,
  'str-upper': strUpper,
  'str-lower': strLower,
  'str-contains?': strContains
};

export function registerStringBuiltins(env) {
  for (const [name, fn] of Object.entries(stringBuiltins)) {
    if (!env.vars) {
      env.vars = new Map();
    }
    env.vars.set(name, { kind: 'builtin', name, fn });
  }
}
