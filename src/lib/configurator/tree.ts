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

// A level is MULTI-SELECT when its nodes carry the flag (set on all siblings
// together). Then several values may be picked at once and each picked branch is
// priced and SUMMED; a plain level still takes exactly one value. A single-select
// level behaves exactly as before — this is why the existing products are
// untouched.
type SubResult = { state: GridLookup['state']; amount: number | null; key: string | null; missingAxes: string[] };

function priceLevel(
  level: Level,
  byParent: Map<string | null, Level>,
  selection: Selection,
  inherited: number | null, // deepest declared price above this level
  depth: number,
): SubResult {
  const groupCode = level[0].groupCode;
  const multi = level[0].multiSelect === true;
  const entry = selection[groupCode];
  const picked = entry?.valueCodes ?? [];
  // Single-select takes exactly one; multi takes everything chosen here.
  const pickList = multi ? picked : picked.slice(0, 1);

  if (picked.length === 0 || (!multi && picked.length !== 1)) {
    return { state: 'incomplete', amount: null, key: null, missingAxes: [groupCode] };
  }

  let sum = 0;
  const branchKeys: string[] = [];
  for (const code of pickList) {
    const node = level.find((n) => n.valueCode === code);
    if (!node) {
      // A value this branch never offers — a combination that was never built.
      return { state: 'not_sold', amount: null, key: null, missingAxes: [] };
    }

    let branchInherited = inherited;
    if (node.amount !== null) {
      if (!Number.isFinite(node.amount)) {
        // A NaN price would poison the landed-cost chain; refuse it.
        return { state: 'not_entered', amount: null, key: code, missingAxes: [] };
      }
      branchInherited = node.amount; // a deeper declared price overrides a shallower one
    }

    const children = byParent.get(node.id) ?? [];
    if (children.length === 0) {
      // A leaf: its price is the deepest declared amount on the path to it.
      if (branchInherited === null) {
        return { state: 'not_entered', amount: null, key: code, missingAxes: [] };
      }
      sum += branchInherited;
      branchKeys.push(code);
      continue;
    }

    // Guard against a malformed cyclic tree.
    if (depth > level.length + byParent.size) {
      return { state: 'incomplete', amount: null, key: null, missingAxes: [] };
    }
    const sub = priceLevel(children, byParent, selection, branchInherited, depth + 1);
    if (sub.state !== 'sold') return sub; // propagate incomplete / not_sold / not_entered
    sum += sub.amount ?? 0;
    branchKeys.push(`${code}|${sub.key ?? ''}`);
  }

  // Joined with '+' across picked branches; a single-select level has one branch,
  // so its key stays the plain `a|b|c` chain the grid audit trail expects.
  return { state: 'sold', amount: sum, key: branchKeys.join('+'), missingAxes: [] };
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
  const root = byParent.get(null) ?? [];
  if (root.length === 0) {
    return { state: 'incomplete', amount: null, currency, key: null, missingAxes: [] };
  }
  const r = priceLevel(root, byParent, selection, null, 0);
  return { state: r.state, amount: r.amount, currency, key: r.key, missingAxes: r.missingAxes };
}

/**
 * Which values each tree QUESTION offers given the current (partial) selection —
 * the availability the quote form needs so its dropdowns match the decision
 * tree exactly, rather than offering every value on every branch.
 *
 * Walks the tree down the chosen path: every level it REACHES is mapped
 * `groupCode -> the set of value codes offered THERE` (after edge=pur the board
 * level offers only {spc}; after edge=alu_silent it offers {spc,wpc,fr}). Every
 * tree group it has NOT reached yet, because an earlier answer is still missing,
 * is `'pending'`. A group that is not part of the tree at all gets no entry, so
 * non-tree questions (colour, size) are left untouched by the caller.
 */
export function treeOptionAvailability(
  nodes: PriceTreeNodeDef[] | null | undefined,
  selection: Selection,
): Map<string, Set<string> | 'pending'> {
  const out = new Map<string, Set<string> | 'pending'>();
  if (!nodes || nodes.length === 0) return out;

  const byParent = childrenByParent(nodes);
  // The parent nodes whose children form the current level. Start at the root
  // (the `null` sentinel). After a multi-select pick this holds SEVERAL parents,
  // so the next level is reached through more than one branch at once.
  let activeParents: (string | null)[] = [null];

  for (let guard = 0; guard <= nodes.length; guard++) {
    const groups = activeParents.map((pid) => byParent.get(pid) ?? []).filter((g) => g.length > 0);
    if (groups.length === 0) break;

    // Siblings under one parent share a question. Different branches reached by a
    // multi-select pick could ask DIFFERENT next questions; a single shared
    // follow-up can't represent that, so stop there (per-branch follow-ups are a
    // later feature). With one active parent this never triggers.
    const groupCode = groups[0][0].groupCode;
    if (!groups.every((g) => g[0].groupCode === groupCode)) break;
    const multi = groups[0][0].multiSelect === true;

    // Offered = the intersection of what every active branch offers, so a shared
    // answer below a multi-select level is valid on all of them. One active
    // parent ⇒ just that parent's children (the old behaviour).
    let offered: Set<string> | null = null;
    for (const g of groups) {
      const codes = new Set<string>(g.map((n) => n.valueCode));
      if (offered === null) {
        offered = codes;
      } else {
        const prev: Set<string> = offered;
        offered = new Set<string>([...codes].filter((c) => prev.has(c)));
      }
    }
    out.set(groupCode, offered ?? new Set<string>());

    const entry = selection[groupCode];
    const picked = entry?.valueCodes ?? [];
    if (picked.length === 0) break;
    if (!multi && picked.length !== 1) break;

    const next: string[] = [];
    for (const g of groups) {
      for (const n of g) if (picked.includes(n.valueCode)) next.push(n.id);
    }
    if (next.length === 0) break;
    activeParents = next;
  }

  for (const node of nodes) {
    if (!out.has(node.groupCode)) out.set(node.groupCode, 'pending');
  }
  return out;
}

/**
 * The group codes whose tree level is MULTI-SELECT — the quote renders these as
 * checkboxes (pick several, each branch priced and summed) instead of a single
 * dropdown. A group is multi-select when its tree nodes carry the flag.
 */
export function multiSelectGroupCodes(
  nodes: PriceTreeNodeDef[] | null | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const node of nodes ?? []) if (node.multiSelect) out.add(node.groupCode);
  return out;
}

/**
 * The images to show for each ANSWERED tree question, given the current
 * selection: walk the chosen path and map `groupCode -> the chosen node's
 * images`. A level the walk has not reached yet, or whose chosen node carries no
 * image, gets no entry. Lets the quote show the picture of whatever has actually
 * been chosen at each step, straight from the canvas.
 */
export function treeSelectedImages(
  nodes: PriceTreeNodeDef[] | null | undefined,
  selection: Selection,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!nodes || nodes.length === 0) return out;

  const byParent = childrenByParent(nodes);
  let level: Level = byParent.get(null) ?? [];

  for (let guard = 0; guard <= nodes.length && level.length > 0; guard++) {
    const groupCode = level[0].groupCode;
    const entry = selection[groupCode];
    if (!entry || entry.valueCodes.length !== 1) break;
    const node = level.find((n) => n.valueCode === entry.valueCodes[0]);
    if (!node) break;
    if (node.images && node.images.length > 0) out.set(groupCode, node.images);
    level = byParent.get(node.id) ?? [];
  }
  return out;
}
