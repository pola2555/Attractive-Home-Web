// Pure accessory pricing — no Prisma, no `server-only`, so the quote
// configurator prices a selection in the browser and the server re-runs the
// EXACT same function authoritatively on save. An accessory is a standalone
// product sold alongside the door: priced at its own listed price, with its OWN
// quantity (independent of the door quantity), and deliberately kept out of the
// door's margin and the China → UAE landed-cost chain.

export type AccessoryTierDef = { minQty: number; unitAmount: number };
export type AccessoryDef = {
  id: string;
  name: string;
  category: string | null;
  colorName: string | null;
  pricingMode: 'per_item' | 'bulk';
  unitPrice: number | null;
  tiers: AccessoryTierDef[];
};

/** Accessory id -> quantity ordered. A non-positive quantity counts as unchosen. */
export type AccessorySelection = Record<string, number>;

export type AccessoryLine = {
  accessoryId: string;
  name: string;
  quantity: number;
  /** The per-unit figure actually used, after any bulk tier. */
  unitAmount: number;
  amount: number;
};

function round2(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100;
}

/**
 * The tier that applies at `quantity`: the highest `minQty` at or below it.
 * Same rule as the upgrade tiers — ordering 150 pamphlets is priced at the 100
 * tier, not the 200 and not interpolated between them.
 */
export function accessoryTierFor(
  tiers: AccessoryTierDef[],
  quantity: number,
): AccessoryTierDef | null {
  let best: AccessoryTierDef | null = null;
  for (const tier of tiers) {
    if (tier.minQty <= quantity && (best === null || tier.minQty > best.minQty)) best = tier;
  }
  return best;
}

export type PriceAccessoriesResult = { lines: AccessoryLine[]; total: number; issues: string[] };

export function priceAccessories(
  defs: AccessoryDef[],
  picked: AccessorySelection,
): PriceAccessoriesResult {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const lines: AccessoryLine[] = [];
  const issues: string[] = [];

  for (const [id, rawQty] of Object.entries(picked)) {
    const qty = Math.floor(Number(rawQty));
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const def = byId.get(id);
    if (!def) {
      issues.push('An accessory on this line is no longer available and was not charged.');
      continue;
    }

    let unitAmount: number;
    if (def.pricingMode === 'bulk') {
      const tier = accessoryTierFor(def.tiers, qty);
      if (!tier) {
        issues.push(`"${def.name}" has no bulk price for a quantity of ${qty}.`);
        continue;
      }
      unitAmount = tier.unitAmount;
    } else {
      if (def.unitPrice === null || !Number.isFinite(def.unitPrice)) {
        issues.push(`"${def.name}" has no unit price.`);
        continue;
      }
      unitAmount = def.unitPrice;
    }

    const amount = round2(unitAmount * qty);
    if (!Number.isFinite(amount)) {
      issues.push(`"${def.name}" produced a value that is not a number.`);
      continue;
    }
    lines.push({ accessoryId: id, name: def.name, quantity: qty, unitAmount, amount });
  }

  lines.sort((a, b) => a.name.localeCompare(b.name));
  const total = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  return { lines, total, issues };
}
