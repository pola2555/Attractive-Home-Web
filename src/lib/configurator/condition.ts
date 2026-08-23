import { QUANTITY_VAR, type Condition, type Selection, type Truth } from './types';

// The condition evaluator behind the dependency tree: which values a choice
// unlocks, whether a whole group is shown, which numeric range applies, and
// whether a pricing rule fires.
//
// THREE-VALUED, and that is the whole point. `{group: 'material', in: ['oak']}`
// evaluated before the user has picked a material is neither true nor false:
//   - answering `no` hides every dependent value on first render, so the
//     configurator looks empty and broken;
//   - answering `yes` shows values that vanish the moment a material is picked.
// `pending` lets the UI render them disabled with "choose a material first",
// which is the only honest option.

export type ConditionScope = {
  selection: Selection;
  /** Line quantity, exposed as `__qty` so tier pricing is expressible. */
  quantity?: number;
};

function truthOfNumeric(actual: number | null | undefined, op: string, expected: number): Truth {
  if (actual === null || actual === undefined || Number.isNaN(actual)) return 'pending';
  switch (op) {
    case '<':
      return actual < expected ? 'yes' : 'no';
    case '<=':
      return actual <= expected ? 'yes' : 'no';
    case '>':
      return actual > expected ? 'yes' : 'no';
    case '>=':
      return actual >= expected ? 'yes' : 'no';
    case '==':
      return actual === expected ? 'yes' : 'no';
    case '!=':
      return actual !== expected ? 'yes' : 'no';
    default:
      // An unknown operator is corrupt data, not a licence to guess: `pending`
      // blocks rather than silently pricing something wrong.
      return 'pending';
  }
}

function negate(truth: Truth): Truth {
  if (truth === 'yes') return 'no';
  if (truth === 'no') return 'yes';
  return 'pending';
}

export function evaluateCondition(condition: Condition | null, scope: ConditionScope): Truth {
  if (condition === null || condition === undefined) return 'yes';

  if ('all' in condition) {
    // One definite failure sinks the whole conjunction even if others are
    // still pending — no later choice can rescue it.
    let sawPending = false;
    for (const child of condition.all) {
      const truth = evaluateCondition(child, scope);
      if (truth === 'no') return 'no';
      if (truth === 'pending') sawPending = true;
    }
    return sawPending ? 'pending' : 'yes';
  }

  if ('any' in condition) {
    // Mirror image: one definite success carries the disjunction.
    let sawPending = false;
    for (const child of condition.any) {
      const truth = evaluateCondition(child, scope);
      if (truth === 'yes') return 'yes';
      if (truth === 'pending') sawPending = true;
    }
    return sawPending ? 'pending' : 'no';
  }

  if ('not' in condition) return negate(evaluateCondition(condition.not, scope));

  if ('in' in condition) {
    if (condition.group === QUANTITY_VAR) {
      // `__qty` is a number; membership over it is meaningless.
      return 'pending';
    }
    const entry = scope.selection[condition.group];
    if (!entry || entry.valueCodes.length === 0) return 'pending';
    // A multi_select matches when ANY chosen value is listed.
    return entry.valueCodes.some((code) => condition.in.includes(code)) ? 'yes' : 'no';
  }

  if ('op' in condition) {
    const actual =
      condition.group === QUANTITY_VAR
        ? (scope.quantity ?? null)
        : (scope.selection[condition.group]?.numericValue ?? null);
    return truthOfNumeric(actual, condition.op, condition.value);
  }

  return 'pending';
}

// Convenience for the many call sites that only care about a definite yes.
export function isSatisfied(condition: Condition | null, scope: ConditionScope): boolean {
  return evaluateCondition(condition, scope) === 'yes';
}

// Every group code a condition depends on. Used by the save action to enforce
// the DAG rule — a condition may only reference groups with a LOWER sortOrder —
// so a circular material<->colour dependency cannot be stored in the first
// place, rather than being discovered as a UI that oscillates.
export function referencedGroups(
  condition: Condition | null,
  into = new Set<string>(),
): Set<string> {
  if (!condition) return into;
  if ('all' in condition) condition.all.forEach((c) => referencedGroups(c, into));
  else if ('any' in condition) condition.any.forEach((c) => referencedGroups(c, into));
  else if ('not' in condition) referencedGroups(condition.not, into);
  else if ('group' in condition && condition.group !== QUANTITY_VAR) into.add(condition.group);
  return into;
}
