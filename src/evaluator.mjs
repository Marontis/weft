import { lookup, define } from './env.mjs';
import { WeftError } from './errors.mjs';

function isTruthy(val) {
  return val !== false && val !== null;
}

export function evalForm(node, env) {
  let thunk = { type: 'eval', node, env, tail: true, depth: 0 };
  while (thunk) {
    if (thunk.type === 'eval') {
      const { node, env, tail, depth } = thunk;
      if (!node) {
        thunk = { type: 'return', value: null };
        continue;
      }
      if (node.t === 'num' || node.t === 'str') {
        thunk = { type: 'return', value: node.v };
        continue;
      }
      if (node.t === 'sym') {
        if (node.name === 'true') {
          thunk = { type: 'return', value: true };
          continue;
        }
        if (node.name === 'false') {
          thunk = { type: 'return', value: false };
          continue;
        }
        if (node.name === 'nil') {
          thunk = { type: 'return', value: null };
          continue;
        }
        thunk = { type: 'return', value: lookup(env, node.name, node) };
        continue;
      }
      if (node.t === 'list') {
        const items = node.items;
        if (!items || items.length === 0) {
          thunk = { type: 'return', value: [] };
          continue;
        }
        const headNode = items[0];
        if (headNode.t === 'sym') {
          const op = headNode.name;
          if (op === 'quote') {
            if (items.length !== 2) {
              throw new WeftError('arity: expected 1, got ' + (items.length - 1), headNode.line, headNode.col);
            }
            thunk = { type: 'return', value: quoteEval(items[1]) };
            continue;
          }
          if (op === 'if') {
            if (items.length < 3 || items.length > 4) {
              throw new WeftError('arity: expected 2 or 3, got ' + (items.length - 1), headNode.line, headNode.col);
            }
            const cond = evalInternal(items[1], env, false, depth);
            if (isTruthy(cond)) {
              thunk = { type: 'eval', node: items[2], env, tail, depth };
            } else {
              thunk = { type: 'eval', node: items.length === 4 ? items[3] : null, env, tail, depth };
            }
            continue;
          }
          if (op === 'def') {
            if (items.length !== 3) {
              throw new WeftError('arity: expected 2, got ' + (items.length - 1), headNode.line, headNode.col);
            }
            const symNode = items[1];
            if (symNode.t !== 'sym') {
              throw new WeftError('expected symbol in def', symNode.line, symNode.col);
            }
            const val = evalInternal(items[2], env, false, depth);
            thunk = { type: 'return', value: define(env, symNode.name, val) };
            continue;
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
              const bVal = evalInternal(b.items[1], childEnv, false, depth);
              define(childEnv, bName, bVal);
            }
            if (items.length === 2) {
              thunk = { type: 'return', value: null };
              continue;
            }
            for (let i = 2; i < items.length - 1; i++) {
              evalInternal(items[i], childEnv, false, depth);
            }
            thunk = { type: 'eval', node: items[items.length - 1], env: childEnv, tail, depth };
            continue;
          }
          if (op === 'fn') {
            if (items.length < 3) {
              throw new WeftError('arity: expected at least 2, got ' + (items.length - 1), headNode.line, headNode.col);
            }
            const paramsNode = items[1];
            if (!paramsNode || paramsNode.t !== 'list') {
              throw new WeftError('expected parameter list', paramsNode ? paramsNode.line : paramsNode.line, paramsNode ? paramsNode.col : paramsNode.line);
            }
            const params = [];
            for (const p of paramsNode.items) {
              if (!p || p.t !== 'sym') {
                throw new WeftError('expected symbol parameter', p ? p.line : paramsNode.line, p ? p.col : paramsNode.line);
              }
              params.push(p.name);
            }
            const bodyNodes = items.slice(2);
            thunk = {
              type: 'return',
              value: {
                kind: 'closure',
                params,
                body: bodyNodes,
                env
              }
            };
            continue;
          }
          if (op === 'do') {
            if (items.length === 1) {
              thunk = { type: 'return', value: null };
              continue;
            }
            for (let i = 1; i < items.length - 1; i++) {
              evalInternal(items[i], env, false, depth);
            }
            thunk = { type: 'eval', node: items[items.length - 1], env, tail, depth };
            continue;
          }
          if (op === 'and') {
            if (items.length === 1) {
              thunk = { type: 'return', value: true };
              continue;
            }
            let lastVal = true;
            for (let i = 1; i < items.length; i++) {
              const isLast = (i === items.length - 1);
              if (isLast) {
                thunk = { type: 'eval', node: items[i], env, tail, depth };
                break;
              } else {
                lastVal = evalInternal(items[i], env, false, depth);
                if (!isTruthy(lastVal)) {
                  thunk = { type: 'return', value: lastVal };
                  break;
                }
              }
            }
            continue;
          }
          if (op === 'or') {
            if (items.length === 1) {
              thunk = { type: 'return', value: false };
              continue;
            }
            let lastVal = false;
            for (let i = 1; i < items.length; i++) {
              const isLast = (i === items.length - 1);
              if (isLast) {
                thunk = { type: 'eval', node: items[i], env, tail, depth };
                break;
              } else {
                lastVal = evalInternal(items[i], env, false, depth);
                if (isTruthy(lastVal)) {
                  thunk = { type: 'return', value: lastVal };
                  break;
                }
              }
            }
            continue;
          }
        }

        // Regular function application
        const fnVal = evalInternal(headNode, env, false, depth);
        if (!fnVal || (fnVal.kind !== 'closure' && fnVal.kind !== 'builtin' && typeof fnVal !== 'function')) {
          throw new WeftError('not a function', headNode.line, headNode.col);
        }

        const args = [];
        for (let i = 1; i < items.length; i++) {
          args.push(evalInternal(items[i], env, false, depth));
        }

        if (fnVal.kind === 'closure') {
          if (args.length !== fnVal.params.length) {
            throw new WeftError(`arity: expected ${fnVal.params.length}, got ${args.length}`, headNode.line, headNode.col);
          }
          const callEnv = { parent: fnVal.env, vars: new Map() };
          for (let i = 0; i < fnVal.params.length; i++) {
            callEnv.vars.set(fnVal.params[i], args[i]);
          }
          if (fnVal.body.length === 0) {
            thunk = { type: 'return', value: null };
            continue;
          }
          if (tail) {
            for (let i = 0; i < fnVal.body.length - 1; i++) {
              evalInternal(fnVal.body[i], callEnv, false, depth);
            }
            thunk = { type: 'eval', node: fnVal.body[fnVal.body.length - 1], env: callEnv, tail: true, depth };
            continue;
          } else {
            const newDepth = depth + 1;
            if (newDepth > 10000) {
              const line = headNode && typeof headNode.line === 'number' ? headNode.line : null;
              const col = headNode && typeof headNode.col === 'number' ? headNode.col : null;
              throw new WeftError('stack depth exceeded', line, col);
            }
            for (let i = 0; i < fnVal.body.length - 1; i++) {
              evalInternal(fnVal.body[i], callEnv, false, newDepth);
            }
            thunk = { type: 'eval', node: fnVal.body[fnVal.body.length - 1], env: callEnv, tail: false, depth: newDepth };
            continue;
          }
        } else if (fnVal.kind === 'builtin') {
          const res = fnVal.fn(args, env, headNode);
          thunk = { type: 'return', value: res };
          continue;
        } else if (typeof fnVal === 'function') {
          const res = fnVal(args, env, headNode);
          thunk = { type: 'return', value: res };
          continue;
        }
      }

      throw new WeftError('unknown AST node type', node.line, node.col);
    } else if (thunk.type === 'return') {
      return thunk.value;
    }
  }
  return null;
}

function evalInternal(node, env, tail, depth) {
  const stack = [{ node, env, tail, depth }];
  let currentValue = null;

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const { node, env, tail, depth } = frame;

    if (depth > 10000) {
      const line = node && typeof node.line === 'number' ? node.line : null;
      const col = node && typeof node.col === 'number' ? node.col : null;
      throw new WeftError('stack depth exceeded', line, col);
    }

    if (!node) {
      currentValue = null;
      stack.pop();
      continue;
    }
    if (node.t === 'num' || node.t === 'str') {
      currentValue = node.v;
      stack.pop();
      continue;
    }
    if (node.t === 'sym') {
      if (node.name === 'true') currentValue = true;
      else if (node.name === 'false') currentValue = false;
      else if (node.name === 'nil') currentValue = null;
      else currentValue = lookup(env, node.name, node);
      stack.pop();
      continue;
    }
    if (node.t === 'list') {
      const items = node.items;
      if (!items || items.length === 0) {
        currentValue = [];
        stack.pop();
        continue;
      }
      const headNode = items[0];
      if (headNode.t === 'sym') {
        const op = headNode.name;
        if (op === 'quote') {
          if (items.length !== 2) {
            throw new WeftError('arity: expected 1, got ' + (items.length - 1), headNode.line, headNode.col);
          }
          currentValue = quoteEval(items[1]);
          stack.pop();
          continue;
        }
        if (op === 'if') {
          if (items.length < 3 || items.length > 4) {
            throw new WeftError('arity: expected 2 or 3, got ' + (items.length - 1), headNode.line, headNode.col);
          }
          if (!frame.state) {
            frame.state = { phase: 'cond' };
            stack.push({ node: items[1], env, tail: false, depth });
            continue;
          } else if (frame.state.phase === 'cond') {
            const cond = currentValue;
            frame.state.phase = 'branch';
            const branch = isTruthy(cond) ? items[2] : (items.length === 4 ? items[3] : null);
            frame.node = branch;
            frame.env = env;
            frame.tail = tail;
            frame.state = null;
            continue;
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
          if (!frame.state) {
            frame.state = { phase: 'val', symNode };
            stack.push({ node: items[2], env, tail: false, depth });
            continue;
          } else {
            const val = currentValue;
            currentValue = define(env, symNode.name, val);
            stack.pop();
            continue;
          }
        }
        if (op === 'let') {
          if (items.length < 2) {
            throw new WeftError('arity: expected at least 1, got 0', headNode.line, headNode.col);
          }
          const bindingsNode = items[1];
          if (!bindingsNode || bindingsNode.t !== 'list') {
            throw new WeftError('expected binding list', bindingsNode ? bindingsNode.line : headNode.line, bindingsNode ? bindingsNode.col : headNode.col);
          }
          if (!frame.state) {
            const childEnv = { parent: env, vars: new Map() };
            frame.state = {
              phase: 'bindings',
              bindings: bindingsNode.items,
              bIndex: 0,
              childEnv,
              bodyIndex: 2
            };
          }
          const st = frame.state;
          if (st.phase === 'bindings') {
            if (st.bIndex < st.bindings.length) {
              const b = st.bindings[st.bIndex];
              if (!b || b.t !== 'list' || b.items.length !== 2 || b.items[0].t !== 'sym') {
                throw new WeftError('invalid binding form', b ? b.line : bindingsNode.line, b ? b.col : bindingsNode.col);
              }
              if (!st.evaluatingBinding) {
                st.evaluatingBinding = true;
                st.currentBindingName = b.items[0].name;
                stack.push({ node: b.items[1], env: st.childEnv, tail: false, depth });
                continue;
              } else {
                st.evaluatingBinding = false;
                define(st.childEnv, st.currentBindingName, currentValue);
                st.bIndex++;
                continue;
              }
            } else {
              st.phase = 'body';
            }
          }
          if (st.phase === 'body') {
            if (st.bodyIndex < items.length) {
              const isLast = (st.bodyIndex === items.length - 1);
              const bodyNode = items[st.bodyIndex];
              st.bodyIndex++;
              if (isLast) {
                frame.node = bodyNode;
                frame.env = st.childEnv;
                frame.tail = tail;
                frame.state = null;
                continue;
              } else {
                stack.push({ node: bodyNode, env: st.childEnv, tail: false, depth });
                continue;
              }
            } else {
              currentValue = null;
              stack.pop();
              continue;
            }
          }
        }
        if (op === 'fn') {
          if (items.length < 3) {
            throw new WeftError('arity: expected at least 2, got ' + (items.length - 1), headNode.line, headNode.col);
          }
          const paramsNode = items[1];
          if (!paramsNode || paramsNode.t !== 'list') {
            throw new WeftError('expected parameter list', paramsNode ? paramsNode.line : paramsNode.line, paramsNode ? paramsNode.col : paramsNode.line);
          }
          const params = [];
          for (const p of paramsNode.items) {
            if (!p || p.t !== 'sym') {
              throw new WeftError('expected symbol parameter', p ? p.line : paramsNode.line, p ? p.col : paramsNode.line);
            }
            params.push(p.name);
          }
          const bodyNodes = items.slice(2);
          currentValue = { kind: 'closure', params, body: bodyNodes, env };
          stack.pop();
          continue;
        }
        if (op === 'do') {
          if (!frame.state) {
            frame.state = { index: 1 };
          }
          const st = frame.state;
          if (st.index < items.length) {
            const isLast = (st.index === items.length - 1);
            const n = items[st.index];
            st.index++;
            if (isLast) {
              frame.node = n;
              frame.env = env;
              frame.tail = tail;
              frame.state = null;
              continue;
            } else {
              stack.push({ node: n, env, tail: false, depth });
              continue;
            }
          } else {
            currentValue = null;
            stack.pop();
            continue;
          }
        }
        if (op === 'and') {
          if (items.length === 1) {
            currentValue = true;
            stack.pop();
            continue;
          }
          if (!frame.state) {
            frame.state = { index: 1 };
          }
          const st = frame.state;
          if (st.index < items.length) {
            const isLast = (st.index === items.length - 1);
            const n = items[st.index];
            st.index++;
            if (isLast) {
              frame.node = n;
              frame.env = env;
              frame.tail = tail;
              frame.state = null;
              continue;
            } else {
              if (!st.evaluatingOperand) {
                st.evaluatingOperand = true;
                stack.push({ node: n, env, tail: false, depth });
                continue;
              } else {
                st.evaluatingOperand = false;
                const lastVal = currentValue;
                if (!isTruthy(lastVal)) {
                  stack.pop();
                  continue;
                } else {
                  continue;
                }
              }
            }
          } else {
            stack.pop();
            continue;
          }
        }
        if (op === 'or') {
          if (items.length === 1) {
            currentValue = false;
            stack.pop();
            continue;
          }
          if (!frame.state) {
            frame.state = { index: 1 };
          }
          const st = frame.state;
          if (st.index < items.length) {
            const isLast = (st.index === items.length - 1);
            const n = items[st.index];
            st.index++;
            if (isLast) {
              frame.node = n;
              frame.env = env;
              frame.tail = tail;
              frame.state = null;
              continue;
            } else {
              if (!st.evaluatingOperand) {
                st.evaluatingOperand = true;
                stack.push({ node: n, env, tail: false, depth });
                continue;
              } else {
                st.evaluatingOperand = false;
                const lastVal = currentValue;
                if (isTruthy(lastVal)) {
                  stack.pop();
                  continue;
                } else {
                  continue;
                }
              }
            }
          } else {
            stack.pop();
            continue;
          }
        }
      }

      // Regular function application
      if (!frame.state) {
        frame.state = {
          phase: 'eval-head',
          items,
          argIndex: 1,
          args: []
        };
        stack.push({ node: headNode, env, tail: false, depth });
        continue;
      }
      const st = frame.state;
      if (st.phase === 'eval-head') {
        const fnVal = currentValue;
        if (!fnVal || (fnVal.kind !== 'closure' && fnVal.kind !== 'builtin' && typeof fnVal !== 'function')) {
          throw new WeftError('not a function', headNode.line, headNode.col);
        }
        st.fnVal = fnVal;
        st.phase = 'eval-args';
      }
      if (st.phase === 'eval-args') {
        if (st.argIndex < st.items.length) {
          const argNode = st.items[st.argIndex];
          if (!st.evaluatingArg) {
            st.evaluatingArg = true;
            stack.push({ node: argNode, env, tail: false, depth });
            continue;
          } else {
            st.evaluatingArg = false;
            st.args.push(currentValue);
            st.argIndex++;
            continue;
          }
        } else {
          st.phase = 'apply';
        }
      }
      if (st.phase === 'apply') {
        const fnVal = st.fnVal;
        const args = st.args;
        if (fnVal.kind === 'closure') {
          if (args.length !== fnVal.params.length) {
            throw new WeftError(`arity: expected ${fnVal.params.length}, got ${args.length}`, headNode.line, headNode.col);
          }
          const callEnv = { parent: fnVal.env, vars: new Map() };
          for (let i = 0; i < fnVal.params.length; i++) {
            callEnv.vars.set(fnVal.params[i], args[i]);
          }
          if (fnVal.body.length === 0) {
            currentValue = null;
            stack.pop();
            continue;
          }
          if (tail) {
            if (!st.bodyIndex) {
              st.bodyIndex = 0;
            }
            if (st.bodyIndex < fnVal.body.length - 1) {
              const bNode = fnVal.body[st.bodyIndex];
              st.bodyIndex++;
              stack.push({ node: bNode, env: callEnv, tail: false, depth });
              continue;
            } else {
              frame.node = fnVal.body[fnVal.body.length - 1];
              frame.env = callEnv;
              frame.tail = true;
              frame.state = null;
              continue;
            }
          } else {
            const newDepth = depth + 1;
            if (newDepth > 10000) {
              throw new WeftError('stack depth exceeded', headNode.line, headNode.col);
            }
            if (!st.bodyIndex) {
              st.bodyIndex = 0;
            }
            if (st.bodyIndex < fnVal.body.length - 1) {
              const bNode = fnVal.body[st.bodyIndex];
              st.bodyIndex++;
              stack.push({ node: bNode, env: callEnv, tail: false, depth: newDepth });
              continue;
            } else {
              frame.node = fnVal.body[fnVal.body.length - 1];
              frame.env = callEnv;
              frame.tail = false;
              frame.depth = newDepth;
              frame.state = null;
              continue;
            }
          }
        } else if (fnVal.kind === 'builtin') {
          currentValue = fnVal.fn(args, env, headNode);
          stack.pop();
          continue;
        } else if (typeof fnVal === 'function') {
          currentValue = fnVal(args, env, headNode);
          stack.pop();
          continue;
        }
      }
    }

    throw new WeftError('unknown AST node type', node.line, node.col);
  }

  return currentValue;
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
