import type { GridLookup, PriceTreeNodeDef, Selection } from './types';

// The base-price decision tree.
//
// Where the grid is a cartesian table with holes, this is a genuine tree: you
// walk it one question at a time, following the selection, and each branch may
// ask its own next question. It exists because a real supplier list is not
// always a rectangle — 55 mm offers no PUR edge, and the wood frame's grades
// ask a question the aluminium frame never does. Reproducing that in a grid
// means one "not sold" cell per impossible combination and a fixed set of axes
// for every branch; the tree drops both constraints.
//
// Result shape is the SAME GridLookup the grid returns, and the five states
// carry the same meanings, so the composer treats a tree and a grid
// identically.
//
// A node's amount is optional. Many nodes are "just a choice" (the colour under
// an aluminium door): they carry no price, and the effective price of a chosen
// path is the DEEPEST declared amount along it — a price may sit on an internal
// node and a deeper node overrides it. The states stay apart on purpose: a
// chosen value with no node is a combination that was never built (not_sold), a
// fully-chosen path that was never priced anywhere is not_entered, and a
// question not yet answered is incomplete — never conflated with "unavailable".

type Level = PriceTreeNodeDef[];

function childrenByParent(nodes: PriceTreeNodeDef[]): Map<string | null, Level> {
  const byParent = new Map<string | null, Level>();
  for (const node of nodes) {
    const key = node.parentId;
    const list = byParent.get(key);
    if (list) list.push(node);
    else byParent.set(key, [node]);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
  return byParent;
}

export function lookupPriceTree(
  nodes: PriceTreeNodeDef[] | null | undefined,
  selection: Selection,
  currency: string,
): GridLookup {
  if (!nodes || nodes.length === 0) {
    return { state: 'no_grid', amount: null, currency: null, key: null, missingAxes: [] };
  }

  const byParent = childrenByParent(nodes);
  let level: Level = byParent.get(null) ?? [];
  const path: string[] = [];
  let inherited: number | null = null; // deepest declared price seen so far

  // Guard against a malformed cyclic tree: the walk can never take more steps
  // than there are nodes.
  for (let guard = 0; guard <= nodes.length; guard++) {
    if (level.length === 0) break;

    // Siblings share a question; the first one names it.
    const groupCode = level[0].groupCode;
    const entry = selection[groupCode];
    if (!entry || entry.valueCodes.length !== 1) {
      return { state: 'incomplete', amount: null, currency, key: null, missingAxes: [groupCode] };
    }

    const chosen = entry.valueCodes[0];
    const node = level.find((n) => n.valueCode === chosen);
    if (!node) {
      // The customer chose a value this branch never offers — a combination
      // that was never built, which is exactly "not sold".
      return { state: 'not_sold', amount: null, currency, key: null, missingAxes: [] };
    }
    path.push(chosen);

    if (node.amount !== null) {
      if (!Number.isFinite(node.amount)) {
        // A NaN price would poison the landed-cost chain; refuse it the same
        // way a missing cell is refused.
        return { state: 'not_entered', amount: null, currency, key: path.join('|'), missingAxes: [] };
      }
      inherited = node.amount; // a deeper declared price overrides a shallower one
    }

    const children = byParent.get(node.id) ?? [];
    if (children.length === 0) {
      // A leaf: the effective price is the deepest declared amount on the path.
      const key = path.join('|');
      if (inherited === null) {
        // A fully-chosen path that was never priced anywhere — the author still
        // owes a price somewhere along it.
        return { state: 'not_entered', amount: null, currency, key, missingAxes: [] };
      }
      return { state: 'sold', amount: inherited, currency, key, missingAxes: [] };
    }

    level = children;
  }

  // Fell off the tree without hitting a leaf — treat as incomplete rather than
  // inventing a price.
  return { state: 'incomplete', amount: null, currency, key: null, missingAxes: [] };
}
