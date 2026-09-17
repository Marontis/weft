import { lookup, define } from './env.mjs';
import { WeftError } from './errors.mjs';

function isTruthy(val) {
  return val !== false && val !== null;
}

export function evalForm(node, env) {
  if (!node) {
    return null;
  }
  if (node.t === 'num' || node.t === 'str') {
    return node.v;
  }
  if (node.t === 'sym') {
    if (node.name === 'true') return true;
    if (node.name === 'false') return false;
    if (node.name === 'nil') return null;
    return lookup(env, node.name, node);
  }
  if (node.t === 'list') {
    const items = node.items;
    if (!items || items.length === 0) {
      return [];
    }
    const headNode = items[0];
    
    // Check if head is a symbol representing a special form
    if (headNode.t === 'sym') {
      const op = headNode.name;
      
      if (op === 'quote') {
        if (items.length !== 2) {
          throw new WeftError('arity: expected 1, got ' + (items.length - 1), headNode.line, headNode.col);
        }
        const x = items[1];
        return quoteEval(x);
      }
      
      if (op === 'if') {
        if (items.length < 3 || items.length > 4) {
          throw new WeftError('arity: expected 2 or 3, got ' + (items.length - 1), headNode.line, headNode.col);
        }
        const cond = evalForm(items[1], env);
        if (isTruthy(cond)) {
          return evalForm(items[2], env);
        } else {
          return items.length === 4 ? evalForm(items[3], env) : null;
        }
      }
      
      if (op === 'def') {
        if (items.length !== 3) {
          throw new WeftError('arity: expected 2, got ' + (items.length - 1), headNode.line, headNode.col);
        }
        const symNode = items[1];
        if (symNode.t !== 'sym') {
          throw new WeftError('expected symbol in def', symNode.line, symNode.col);
        }
        const val = evalForm(items[2], env);
        return define(env, symNode.name, val);
      }
      
      if (op === 'let') {
        if (items.length < 2) {
          throw new WeftError('arity: expected at least 1, got 0', headNode.line, headNode.col);
        }
        const bindingsNode = items[1];
        if (!bindingsNode || bindingsNode.t !== 'list') {
          throw new WeftError('expected binding list', bindingsNode ? bindingsNode.line : headNode.line, bindingsNode ? bindingsNode.col : headNode.col);
        }
        const childEnv = { parent: env, vars: new Map() };
        for (const b of bindingsNode.items) {
          if (!b || b.t !== 'list' || b.items.length !== 2 || b.items[0].t !== 'sym') {
            throw new WeftError('invalid binding form', b ? b.line : bindingsNode.line, b ? b.col : bindingsNode.col);
          }
          const bName = b.items[0].name;
          const bVal = evalForm(b.items[1], childEnv);
          define(childEnv, bName, bVal);
        }
        let res = null;
        for (let i = 2; i < items.length; i++) {
          res = evalForm(items[i], childEnv);
        }
        return res;
      }
      
      if (op === 'fn') {
        if (items.length < 3) {
          throw new WeftError('arity: expected at least 2, got ' + (items.length - 1), headNode.line, headNode.col);
        }
        const paramsNode = items[1];
        if (!paramsNode || paramsNode.t !== 'list') {
          throw new WeftError('expected parameter list', paramsNode ? paramsNode.line : headNode.line, paramsNode ? paramsNode.col : headNode.line);
        }
        const params = [];
        for (const p of paramsNode.items) {
          if (!p || p.t !== 'sym') {
            throw new WeftError('expected symbol parameter', p ? p.line : paramsNode.line, p ? p.col : paramsNode.line);
          }
          params.push(p.name);
        }
        const bodyNodes = items.slice(2);
        return {
          kind: 'closure',
          params,
          body: bodyNodes,
          env
        };
      }
      
      if (op === 'do') {
        let res = null;
        for (let i = 1; i < items.length; i++) {
          res = evalForm(items[i], env);
        }
        return res;
      }
      
      if (op === 'and') {
        let last = true;
        for (let i = 1; i < items.length; i++) {
          last = evalForm(items[i], env);
          if (!isTruthy(last)) {
            return last;
          }
        }
        return last;
      }
      
      if (op === 'or') {
        let last = false;
        for (let i = 1; i < items.length; i++) {
          last = evalForm(items[i], env);
          if (isTruthy(last)) {
            return last;
          }
        }
        return last;
      }
    }
    
    // Regular function application
    const fnVal = evalForm(headNode, env);
    if (!fnVal || (fnVal.kind !== 'closure' && fnVal.kind !== 'builtin' && typeof fnVal !== 'function')) {
      throw new WeftError('not a function', headNode.line, headNode.col);
    }
    
    const args = [];
    for (let i = 1; i < items.length; i++) {
      args.push(evalForm(items[i], env));
    }
    
    if (fnVal.kind === 'closure') {
      if (args.length !== fnVal.params.length) {
        throw new WeftError(`arity: expected ${fnVal.params.length}, got ${args.length}`, headNode.line, headNode.col);
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
      return fnVal.fn(args, env, headNode);
    } else if (typeof fnVal === 'function') {
      return fnVal(args, env, headNode);
    }
  }
  
  throw new WeftError('unknown AST node type', node.line, node.col);
}

function quoteEval(node) {
  if (!node) return null;
  if (node.t === 'num' || node.t === 'str') {
    return node.v;
  }
  if (node.t === 'sym') {
    return node.name;
  }
  if (node.t === 'list') {
    const arr = [];
    for (const item of node.items) {
      arr.push(quoteEval(item));
    }
    return arr;
  }
  return null;
}
