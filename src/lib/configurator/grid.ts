import {
  VARIANT_VAR,
  type GridLookup,
  type PriceGridDef,
  type Selection,
  type VariantDef,
} from './types';

// The price grid.
//
// A supplier publishes a table, not a formula. The Benison door's base price
// depends on thickness, edge banding and board material AT ONCE — it is a cell
// address, not a calculation — and nine of its eighteen cells are combinations
// the factory does not make. Reproducing that with conditional rules costs one
// rule per cell, and a full rewrite of all of them at every reprice.
//
// The three failure states are kept apart on purpose. Collapsing them into
// "no price" would let a hole in the company's own data look exactly like a
// product the supplier refuses to sell, and only one of those is something to
// tell a customer.

/** Axis order is the grid's own; a key built in any other order is a miss. */
export function cellKey(axes: string[], selection: Selection): string | null {
  const parts: string[] = [];
  for (const axis of axes) {
    const entry = selection[axis];
    // A multi_select cannot be a grid axis: there is no single coordinate to
    // address a cell with. The loader rejects it, and this is the backstop.
    if (!entry || entry.valueCodes.length !== 1) return null;
    parts.push(entry.valueCodes[0]);
  }
  return parts.join('|');
}

export function missingAxes(axes: string[], selection: Selection): string[] {
  return axes.filter((axis) => {
    const entry = selection[axis];
    return !entry || entry.valueCodes.length !== 1;
  });
}

export function lookupGrid(grid: PriceGridDef | null, selection: Selection): GridLookup {
  if (!grid || grid.axes.length === 0) {
    return { state: 'no_grid', amount: null, currency: null, key: null, missingAxes: [] };
  }

  const missing = missingAxes(grid.axes, selection);
  if (missing.length > 0) {
    return {
      state: 'incomplete',
      amount: null,
      currency: grid.currency,
      key: null,
      missingAxes: missing,
    };
  }

  const key = cellKey(grid.axes, selection);
  if (key === null) {
    return {
      state: 'incomplete',
      amount: null,
      currency: grid.currency,
      key: null,
      missingAxes: grid.axes,
    };
  }

  // `in` rather than a truthiness test: a legitimately free cell priced at 0
  // would fail `if (cells[key])`, and `Object.hasOwn` is what separates a
  // stored null (not sold) from an absent key (not entered). A plain object
  // literal also inherits from Object.prototype, so a cell keyed 'constructor'
  // would otherwise resolve to a function.
  if (!Object.hasOwn(grid.cells, key)) {
    return { state: 'not_entered', amount: null, currency: grid.currency, key, missingAxes: [] };
  }

  const amount = grid.cells[key];
  if (amount === null || amount === undefined) {
    return { state: 'not_sold', amount: null, currency: grid.currency, key, missingAxes: [] };
  }
  if (!Number.isFinite(amount)) {
    // Postgres NUMERIC accepts NaN, and a NaN base price silently poisons the
    // whole landed-cost chain. Refuse it the same way a missing cell is
    // refused rather than quoting a blank.
    return { state: 'not_entered', amount: null, currency: grid.currency, key, missingAxes: [] };
  }

  return { state: 'sold', amount, currency: grid.currency, key, missingAxes: [] };
}

/** Every coordinate the grid could hold, in axis order — the editor's canvas. */
export function enumerateCells(
  axes: string[],
  valuesByAxis: Record<string, string[]>,
): { key: string; coords: Record<string, string> }[] {
  if (axes.length === 0) return [];

  let rows: Record<string, string>[] = [{}];
  for (const axis of axes) {
    const values = valuesByAxis[axis] ?? [];
    const next: Record<string, string>[] = [];
    for (const row of rows) {
      for (const value of values) next.push({ ...row, [axis]: value });
    }
    rows = next;
  }

  return rows.map((coords) => ({
    key: axes.map((axis) => coords[axis]).join('|'),
    coords,
  }));
}

export type GridCompleteness = {
  total: number;
  priced: number;
  notSold: number;
  notEntered: number;
};

/** Drives the editor's "18 cells · 9 priced · 9 unavailable" readout. */
export function gridCompleteness(
  axes: string[],
  valuesByAxis: Record<string, string[]>,
  cells: Record<string, number | null>,
): GridCompleteness {
  const all = enumerateCells(axes, valuesByAxis);
  let priced = 0;
  let notSold = 0;
  let notEntered = 0;

  for (const { key } of all) {
    if (!Object.hasOwn(cells, key)) notEntered += 1;
    else if (cells[key] === null) notSold += 1;
    else priced += 1;
  }

  return { total: all.length, priced, notSold, notEntered };
}

export function variantByCode(variants: VariantDef[], code: string | null): VariantDef | null {
  if (!code) return null;
  return variants.find((v) => v.code === code) ?? null;
}

/**
 * The chosen branch, read from the selection's reserved pseudo-group. Kept
 * here rather than in the composer above so that `resolve.ts` can reach it
 * without importing the module that imports `resolve.ts`.
 */
export function selectedVariantCode(selection: Selection): string | null {
  return selection[VARIANT_VAR]?.valueCodes[0] ?? null;
}

export function withVariant(selection: Selection, variantCode: string | null): Selection {
  if (!variantCode) {
    const next = { ...selection };
    delete next[VARIANT_VAR];
    return next;
  }
  return {
    ...selection,
    [VARIANT_VAR]: { groupCode: VARIANT_VAR, valueCodes: [variantCode], numericValue: null },
  };
}
