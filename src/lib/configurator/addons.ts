import { lookupPriceTree } from './tree';
import type { AddonDef, PriceTreeNodeDef, Selection } from './types';

// Pricing a configuration's ADD-ONS straight from the canvas.
//
// The canvas is the single source of truth: an add-on's price, how it is
// charged, and which branches it is offered on all come from the add-on and its
// attachments — not from a parallel table of upgrade rows. An add-on is either
//
//   * FLAT    — a single `amount` charged by its `priceUnit`; or
//   * a TREE  — its own option sub-tree (`nodes`), priced exactly like the base
//               price tree: the person answers its sub-question(s) and the
//               chosen leaf's price applies (e.g. side hinges: standard $7 /
//               colour-matched $11).
//
// and it is OFFERED when it is attached to the whole base (`attachBase`) or the
// current base selection descends through one of the branches it hangs on.

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/**
 * The ids of the base-tree nodes the current selection passes through, root to
 * wherever the answers run out. An add-on attached to any node on this path is
 * on offer — attaching to an internal node means "every configuration beneath
 * it", which is exactly "the node is on the path".
 */
export function pathNodeIds(
  baseTree: PriceTreeNodeDef[] | null | undefined,
  selection: Selection,
): Set<string> {
  const ids = new Set<string>();
  if (!baseTree || baseTree.length === 0) return ids;

  const byParent = new Map<string | null, PriceTreeNodeDef[]>();
  for (const node of baseTree) {
    const list = byParent.get(node.parentId);
    if (list) list.push(node);
    else byParent.set(node.parentId, [node]);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

  // A multi-select level reaches several branches at once, so track the set of
  // active parents, not one. An add-on attached to a node any picked branch
  // reaches is on offer. Single-select walks exactly one branch, as before.
  let activeParents: (string | null)[] = [null];
  for (let guard = 0; guard <= baseTree.length; guard++) {
    const groups = activeParents.map((pid) => byParent.get(pid) ?? []).filter((g) => g.length > 0);
    if (groups.length === 0) break;
    const groupCode = groups[0][0].groupCode;
    if (!groups.every((g) => g[0].groupCode === groupCode)) break;
    const multi = groups[0][0].multiSelect === true;

    const entry = selection[groupCode];
    const picked = entry?.valueCodes ?? [];
    if (picked.length === 0) break;
    if (!multi && picked.length !== 1) break;

    const next: string[] = [];
    for (const g of groups) {
      for (const n of g) {
        if (picked.includes(n.valueCode)) {
          ids.add(n.id);
          next.push(n.id);
        }
      }
    }
    if (next.length === 0) break;
    activeParents = next;
  }
  return ids;
}

/** An add-on is on offer for the whole base, or for a branch on the path. */
export function addonOffered(addon: AddonDef, pathIds: Set<string>): boolean {
  if (addon.attachBase) return true;
  return addon.attachedBaseNodeIds.some((id) => pathIds.has(id));
}

export function addonsForSelection(
  addons: AddonDef[],
  baseTree: PriceTreeNodeDef[] | null | undefined,
  selection: Selection,
): AddonDef[] {
  const pathIds = pathNodeIds(baseTree, selection);
  return addons
    .filter((a) => addonOffered(a, pathIds))
    .slice()
    .sort((a, b) =>
      a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.name.localeCompare(b.name),
    );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

function round2(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100;
}

// Flat add-ons are charged once; everything else multiplies by the entered
// quantity. (per_sqm scaling by a derived area is a later phase — the add-ons
// that use it do not exist on the canvas yet.)
function unitCount(priceUnit: string | null, chosenQty: number): number {
  return priceUnit === null || priceUnit === 'flat' ? 1 : Math.max(1, chosenQty);
}

export type AddonSelection = {
  /** Add-on id -> how many. Absent or 0 means not chosen. */
  [addonId: string]: number;
};

export type AddonLine = {
  addonId: string;
  name: string;
  priceUnit: string | null;
  unitAmount: number;
  quantity: number;
  amount: number;
};

/**
 * The per-unit price of one add-on for the current selection. A flat add-on
 * yields its own `amount`; a tree add-on is priced by walking its sub-tree with
 * the same selection (its sub-question answers live there). Returns an `issue`
 * when the add-on is picked but cannot be priced yet (an unanswered sub-choice,
 * a branch the supplier does not sell).
 */
export function addonUnitPrice(
  addon: AddonDef,
  selection: Selection,
  currency: string,
): { unitAmount: number | null; issue: string | null } {
  if (addon.nodes.length > 0) {
    const look = lookupPriceTree(addon.nodes, selection, currency);
    if (look.state === 'sold' && look.amount !== null) {
      return { unitAmount: look.amount, issue: null };
    }
    if (look.state === 'incomplete') {
      return {
        unitAmount: null,
        issue: `"${addon.name}" still needs a choice before it can be priced.`,
      };
    }
    return { unitAmount: null, issue: `"${addon.name}" is not available for this configuration.` };
  }
  if (addon.amount === null || !Number.isFinite(addon.amount)) {
    return { unitAmount: null, issue: `"${addon.name}" has no price.` };
  }
  return { unitAmount: addon.amount, issue: null };
}

export function priceAddons(
  addons: AddonDef[],
  picked: AddonSelection,
  baseTree: PriceTreeNodeDef[] | null | undefined,
  selection: Selection,
  currency: string,
): { lines: AddonLine[]; total: number; issues: string[] } {
  const lines: AddonLine[] = [];
  const issues: string[] = [];
  const offered = new Set(addonsForSelection(addons, baseTree, selection).map((a) => a.id));

  for (const addon of addons) {
    const chosen = picked[addon.id];
    if (!chosen || chosen <= 0) continue;

    // A picked add-on whose branch is no longer on the path must not be charged
    // — the UI clears these on cascade, but a stale post can still arrive here.
    if (!offered.has(addon.id)) {
      issues.push(`"${addon.name}" is not available for this configuration and was not charged.`);
      continue;
    }

    const { unitAmount, issue } = addonUnitPrice(addon, selection, currency);
    if (issue || unitAmount === null) {
      if (issue) issues.push(issue);
      continue;
    }

    const quantity = unitCount(addon.priceUnit, chosen);
    const amount = round2(unitAmount * quantity);
    if (!Number.isFinite(amount)) {
      issues.push(`"${addon.name}" produced a value that is not a number.`);
      continue;
    }

    lines.push({
      addonId: addon.id,
      name: addon.name,
      priceUnit: addon.priceUnit,
      unitAmount,
      quantity,
      amount,
    });
  }

  const total = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  return { lines, total, issues };
}
