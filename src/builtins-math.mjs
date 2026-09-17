import { WeftError } from './errors.mjs';

function getPos(node) {
  const line = node && typeof node.line === 'number' ? node.line : null;
  const col = node && typeof node.col === 'number' ? node.col : null;
  return { line, col };
}

function checkNumber(arg, node) {
  if (typeof arg !== 'number' || Number.isNaN(arg)) {
    const { line, col } = getPos(node);
    throw new WeftError('expected number', line, col);
  }
}

function normalizeZero(val) {
  return val === 0 ? 0 : val;
}

function mod(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 2) {
    throw new WeftError(`arity: expected 2, got ${args.length}`, line, col);
  }
  checkNumber(args[0], node);
  checkNumber(args[1], node);
  if (args[1] === 0) {
    throw new WeftError('division by zero', line, col);
  }
  return normalizeZero(args[0] % args[1]);
}

function floor(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 1) {
    throw new WeftError(`arity: expected 1, got ${args.length}`, line, col);
  }
  checkNumber(args[0], node);
  return normalizeZero(Math.floor(args[0]));
}

function ceil(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 1) {
    throw new WeftError(`arity: expected 1, got ${args.length}`, line, col);
  }
  checkNumber(args[0], node);
  return normalizeZero(Math.ceil(args[0]));
}

function abs(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length !== 1) {
    throw new WeftError(`arity: expected 1, got ${args.length}`, line, col);
  }
  checkNumber(args[0], node);
  return normalizeZero(Math.abs(args[0]));
}

function min(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length === 0) {
    throw new WeftError('arity: expected at least 1, got 0', line, col);
  }
  for (let i = 0; i < args.length; i++) {
    checkNumber(args[i], node);
  }
  let m = args[0];
  for (let i = 1; i < args.length; i++) {
    if (args[i] < m) {
      m = args[i];
    }
  }
  return normalizeZero(m);
}

function max(args, env, node) {
  const { line, col } = getPos(node);
  if (args.length === 0) {
    throw new WeftError('arity: expected at least 1, got 0', line, col);
  }
  for (let i = 0; i < args.length; i++) {
    checkNumber(args[i], node);
  }
  let m = args[0];
  for (let i = 1; i < args.length; i++) {
    if (args[i] > m) {
      m = args[i];
    }
  }
  return normalizeZero(m);
}

export const mathBuiltins = {
  'mod': mod,
  'floor': floor,
  'ceil': ceil,
  'abs': abs,
  'min': min,
  'max': max
};

export function registerMathBuiltins(env) {
  for (const [name, fn] of Object.entries(mathBuiltins)) {
    if (!env.vars) {
      env.vars = new Map();
    }
    env.vars.set(name, { kind: 'builtin', name, fn });
  }
}
