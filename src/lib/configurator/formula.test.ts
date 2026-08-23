import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateFormula, referencedVariables } from './formula';

const vars = { height: 2100, width: 900, thickness: 45, density: 700, zero: 0 };

function value(formula: string, variables: Record<string, number> = vars): number {
  const result = evaluateFormula(formula, variables);
  assert.equal(result.ok, true, `expected "${formula}" to evaluate`);
  return (result as { ok: true; value: number }).value;
}

function error(formula: string, variables: Record<string, number> = vars): string {
  const result = evaluateFormula(formula, variables);
  assert.equal(result.ok, false, `expected "${formula}" to fail`);
  return (result as { ok: false; error: string }).error;
}

describe('arithmetic', () => {
  it('respects operator precedence', () => {
    assert.equal(value('2 + 3 * 4'), 14);
    assert.equal(value('(2 + 3) * 4'), 20);
    assert.equal(value('100 / 4 / 5'), 5);
    assert.equal(value('2 - 3 - 4'), -5); // left-associative
  });

  it('handles unary minus, including doubled', () => {
    assert.equal(value('-5'), -5);
    assert.equal(value('3 * -2'), -6);
    assert.equal(value('--4'), 4);
  });

  it('reads decimals and ignores whitespace', () => {
    assert.equal(value('0.5 * 4'), 2);
    assert.equal(value('  1   +\t2  '), 3);
  });

  it('computes the real door quantities', () => {
    assert.equal(value('height * width / 1000000'), 1.89);
    assert.equal(round6(value('height * width / 1000000 * thickness / 1000')), 0.08505);
  });
});

describe('the function allowlist', () => {
  it('supports the six allowed functions', () => {
    assert.equal(value('min(3, 7, 2)'), 2);
    assert.equal(value('max(3, 7, 2)'), 7);
    assert.equal(value('round(2.5)'), 3);
    assert.equal(value('ceil(2.1)'), 3);
    assert.equal(value('floor(2.9)'), 2);
    assert.equal(value('abs(0 - 4)'), 4);
  });

  it('nests functions and expressions', () => {
    assert.equal(value('max(1, min(10, 5)) * 2'), 10);
  });

  it('rejects anything not on the allowlist, so no host function is reachable', () => {
    assert.match(error('eval(1)'), /Unknown function/);
    assert.match(error('constructor(1)'), /Unknown function/);
    assert.match(error('require(1)'), /Unknown function/);
  });

  it('enforces arity', () => {
    assert.match(error('round(1, 2)'), /exactly one argument/);
  });
});

describe('failure is explicit, never zero', () => {
  // A weight that silently becomes 0 makes freight free. Every one of these
  // must surface as an error the caller can flag for review.
  it('refuses division by zero rather than producing Infinity', () => {
    assert.match(error('height / zero'), /Division by zero/);
  });

  it('rejects an unknown variable instead of defaulting it', () => {
    assert.match(error('height * unknown_thing'), /Unknown variable/);
  });

  it('rejects a variable that is present but NaN', () => {
    assert.match(error('a * 2', { a: Number.NaN }), /no value yet/);
  });

  it('never returns a non-finite number', () => {
    const result = evaluateFormula('a * 2', { a: Number.POSITIVE_INFINITY });
    assert.equal(result.ok, false);
  });

  it('rejects malformed input', () => {
    assert.match(error('2 +'), /Unexpected end/);
    assert.match(error('(2 + 3'), /Missing closing parenthesis/);
    assert.match(error('2 3'), /trailing input/);
    assert.match(error('2 $ 3'), /Unexpected character/);
    assert.match(error(''), /empty/);
  });
});

describe('referencedVariables', () => {
  it('reports variables but not function names, for the DAG check', () => {
    const names = referencedVariables('max(area_m2, 1) * thickness / 1000');
    assert.deepEqual([...names].sort(), ['area_m2', 'thickness']);
  });

  it('returns nothing for an unparseable formula rather than throwing', () => {
    assert.deepEqual([...referencedVariables('%%%')], []);
  });
});

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
