// A tiny arithmetic evaluator for derived quantities (area, volume, weight).
//
// No `eval`, no `new Function`: these formulas are authored in a dashboard text
// box by staff, and both of those would turn that text box into remote code
// execution against the server. This is a hand-written recursive-descent parser
// over a fixed grammar, so the worst a malformed formula can do is fail.
//
// FAILURE IS EXPLICIT, NEVER ZERO. A formula that cannot be evaluated returns
// an error, and the caller flags the item for review. Silently yielding 0 would
// make a door weigh nothing, which makes its freight free — the kind of bug
// that reaches an invoice before anyone notices.

const FUNCTIONS: Record<string, { arity: 'one' | 'many'; fn: (args: number[]) => number }> = {
  min: { arity: 'many', fn: (a) => Math.min(...a) },
  max: { arity: 'many', fn: (a) => Math.max(...a) },
  round: { arity: 'one', fn: (a) => Math.round(a[0]) },
  ceil: { arity: 'one', fn: (a) => Math.ceil(a[0]) },
  floor: { arity: 'one', fn: (a) => Math.floor(a[0]) },
  abs: { arity: 'one', fn: (a) => Math.abs(a[0]) },
};

export type FormulaResult = { ok: true; value: number } | { ok: false; error: string };

type Token =
  | { type: 'number'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: '+' | '-' | '*' | '/' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

function tokenize(input: string): { ok: true; tokens: Token[] } | { ok: false; error: string } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i += 1;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    if (DIGIT.test(ch) || (ch === '.' && DIGIT.test(input[i + 1] ?? ''))) {
      let raw = '';
      let seenDot = false;
      while (i < input.length && (DIGIT.test(input[i]) || (input[i] === '.' && !seenDot))) {
        if (input[i] === '.') seenDot = true;
        raw += input[i];
        i += 1;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) return { ok: false, error: `Invalid number "${raw}"` };
      tokens.push({ type: 'number', value });
      continue;
    }
    if (IDENT_START.test(ch)) {
      let raw = '';
      while (i < input.length && IDENT_PART.test(input[i])) {
        raw += input[i];
        i += 1;
      }
      tokens.push({ type: 'ident', value: raw });
      continue;
    }
    return { ok: false, error: `Unexpected character "${ch}" at position ${i}` };
  }
  return { ok: true, tokens };
}

class ParseError extends Error {}

// expression := term (('+' | '-') term)*
// term       := factor (('*' | '/') factor)*
// factor     := ('+' | '-') factor | primary
// primary    := number | ident '(' args ')' | ident | '(' expression ')'
function parseAndEvaluate(tokens: Token[], variables: Record<string, number>): number {
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];

  function expression(): number {
    let left = term();
    for (;;) {
      const token = peek();
      if (token?.type !== 'op' || (token.value !== '+' && token.value !== '-')) break;
      pos += 1;
      const right = term();
      left = token.value === '+' ? left + right : left - right;
    }
    return left;
  }

  function term(): number {
    let left = factor();
    for (;;) {
      const token = peek();
      if (token?.type !== 'op' || (token.value !== '*' && token.value !== '/')) break;
      pos += 1;
      const right = factor();
      if (token.value === '*') {
        left = left * right;
      } else {
        // Guarded rather than allowed to produce Infinity: Postgres NUMERIC
        // accepts Infinity, so an unguarded division would PERSIST a poisoned
        // value into a money column and quietly break every downstream sum.
        if (right === 0) throw new ParseError('Division by zero');
        left = left / right;
      }
    }
    return left;
  }

  function factor(): number {
    const token = peek();
    if (token?.type === 'op' && (token.value === '+' || token.value === '-')) {
      pos += 1;
      const value = factor();
      return token.value === '-' ? -value : value;
    }
    return primary();
  }

  function primary(): number {
    const token = peek();
    if (!token) throw new ParseError('Unexpected end of formula');

    if (token.type === 'number') {
      pos += 1;
      return token.value;
    }

    if (token.type === 'lparen') {
      pos += 1;
      const value = expression();
      if (peek()?.type !== 'rparen') throw new ParseError('Missing closing parenthesis');
      pos += 1;
      return value;
    }

    if (token.type === 'ident') {
      pos += 1;
      const name = token.value;

      if (peek()?.type === 'lparen') {
        // Object.hasOwn, NOT `FUNCTIONS[name]`: a plain object literal
        // inherits from Object.prototype, so `FUNCTIONS['constructor']` returns
        // a real function and would sail past a truthiness check. The allowlist
        // has to be checked on OWN properties or it is not an allowlist.
        const spec = Object.hasOwn(FUNCTIONS, name) ? FUNCTIONS[name] : undefined;
        if (!spec) throw new ParseError(`Unknown function "${name}"`);
        pos += 1;
        const args: number[] = [];
        if (peek()?.type !== 'rparen') {
          args.push(expression());
          while (peek()?.type === 'comma') {
            pos += 1;
            args.push(expression());
          }
        }
        if (peek()?.type !== 'rparen') throw new ParseError(`Missing ")" after ${name}(`);
        pos += 1;
        if (spec.arity === 'one' && args.length !== 1) {
          throw new ParseError(`${name}() takes exactly one argument`);
        }
        if (spec.arity === 'many' && args.length < 1) {
          throw new ParseError(`${name}() needs at least one argument`);
        }
        return spec.fn(args);
      }

      // Same reasoning as the function allowlist: `'constructor' in variables`
      // is true for every plain object, and would hand a host function to the
      // arithmetic below.
      if (!Object.hasOwn(variables, name)) throw new ParseError(`Unknown variable "${name}"`);
      const value = variables[name];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ParseError(`"${name}" has no value yet`);
      }
      return value;
    }

    throw new ParseError('Unexpected token in formula');
  }

  const result = expression();
  if (pos !== tokens.length) throw new ParseError('Unexpected trailing input in formula');
  return result;
}

export function evaluateFormula(formula: string, variables: Record<string, number>): FormulaResult {
  if (!formula.trim()) return { ok: false, error: 'Formula is empty' };

  const tokenized = tokenize(formula);
  if (!tokenized.ok) return { ok: false, error: tokenized.error };

  try {
    const value = parseAndEvaluate(tokenized.tokens, variables);
    // The final gate. NaN and +/-Infinity must never leave this function:
    // downstream they land in NUMERIC columns and poison every sum silently.
    if (!Number.isFinite(value)) return { ok: false, error: 'Formula produced a non-finite value' };
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof ParseError ? error.message : 'Invalid formula' };
  }
}

// Variable names a formula depends on, ignoring function names. Used by the
// save action to enforce the same DAG rule conditions obey: a formula may only
// reference groups and EARLIER derived quantities.
export function referencedVariables(formula: string): Set<string> {
  const names = new Set<string>();
  const tokenized = tokenize(formula);
  if (!tokenized.ok) return names;
  const { tokens } = tokenized;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type !== 'ident') continue;
    if (tokens[i + 1]?.type === 'lparen') continue; // a function call, not a variable
    names.add(token.value);
  }
  return names;
}

export const ALLOWED_FUNCTIONS = Object.keys(FUNCTIONS);
