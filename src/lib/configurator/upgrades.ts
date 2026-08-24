import { evaluateCondition } from './condition';
import type {
  BandDef,
  Selection,
  Truth,
  UpgradeDef,
  UpgradeEffectDef,
  UpgradeTierDef,
  UpgradeUnit,
} from './types';

// Upgrades (ticked by a person) and bands (applied automatically from a
// number). Both are conditional money hanging off a configuration, and both
// are deliberately NOT pricing rules:
//
//   * an upgrade is SELECTABLE, and a pricing rule is not. Modelling it as a
//     boolean option group instead would mean nineteen product-specific rows
//     in a GLOBALLY unique vocabulary table — `benison_flat_outside` and its
//     kin — for one supplier's door.
//   * a band is three fields (from, to, amount). Expressed as a rule it
//     becomes a nested `all` condition that the editor then has to parse back
//     apart to render the row it was typed into.

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/** An upgrade offered on one branch is invisible on the others. */
export function upgradesForVariant(
  upgrades: UpgradeDef[],
  variantCode: string | null,
): UpgradeDef[] {
  return upgrades
    .filter((u) => u.variantCode === null || u.variantCode === variantCode)
    .slice()
    .sort((a, b) =>
      a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.code.localeCompare(b.code),
    );
}

export function upgradeAvailability(
  upgrade: UpgradeDef,
  selection: Selection,
  quantity: number,
): Truth {
  return evaluateCondition(upgrade.condition, { selection, quantity });
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * The tier that applies at `quantity`: the highest `minQty` at or below it.
 * A pamphlet is 30.00 for one, 15.00 each at 100 and 10.00 each at 200 — so
 * ordering 150 is priced at the 100 tier, not interpolated between them.
 */
export function tierFor(tiers: UpgradeTierDef[], quantity: number): UpgradeTierDef | null {
  let best: UpgradeTierDef | null = null;
  for (const tier of tiers) {
    if (tier.minQty <= quantity && (best === null || tier.minQty > best.minQty)) best = tier;
  }
  return best;
}

export type UpgradeSelection = {
  /** Upgrade code -> how many. A code present with qty 0 counts as unticked. */
  [code: string]: number;
};

export type UpgradeLine = {
  code: string;
  label: string;
  unit: UpgradeUnit;
  /** The per-unit figure actually used, after any quantity tier. */
  unitAmount: number;
  quantity: number;
  /** Derived quantity that scaled it, for `per_sqm` and friends. */
  quantityCode: string | null;
  quantityValue: number | null;
  amount: number;
  issues: string[];
};

function unitQuantity(
  upgrade: UpgradeDef,
  chosenQty: number,
  derived: Record<string, number | null>,
): { quantity: number; value: number | null; issue: string | null } {
  switch (upgrade.unit) {
    case 'flat':
      // A flat upgrade is charged once no matter what is typed in the box.
      return { quantity: 1, value: null, issue: null };

    case 'per_unit':
    case 'per_piece':
    case 'per_set':
      return { quantity: chosenQty, value: null, issue: null };

    case 'per_sqm': {
      const code = upgrade.quantityCode;
      if (!code) {
        return {
          quantity: 0,
          value: null,
          issue: `"${upgrade.code}" is priced per m² but names no quantity to multiply.`,
        };
      }
      const value = derived[code];
      if (value === null || value === undefined || !Number.isFinite(value)) {
        // Never fall back to 0: a free upgrade is a wrong answer that looks
        // like a right one, and nobody checks a line that reads 0.00.
        return {
          quantity: 0,
          value: null,
          issue: `"${upgrade.code}" needs ${code}, which could not be calculated.`,
        };
      }
      return { quantity: chosenQty * value, value, issue: null };
    }

    default:
      return { quantity: 0, value: null, issue: `Unknown unit on "${upgrade.code}".` };
  }
}

function round2(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100;
}

export function priceUpgrades(
  upgrades: UpgradeDef[],
  picked: UpgradeSelection,
  selection: Selection,
  derived: Record<string, number | null>,
  quantity: number,
): { lines: UpgradeLine[]; total: number; issues: string[] } {
  const lines: UpgradeLine[] = [];
  const issues: string[] = [];

  for (const upgrade of upgrades) {
    const chosen = picked[upgrade.code];
    if (!chosen || chosen <= 0) continue;

    // A ticked upgrade whose condition has since stopped holding must not be
    // charged. The UI clears these on cascade, but a stale form post or a
    // re-price against edited rules can still arrive here.
    if (upgradeAvailability(upgrade, selection, quantity) !== 'yes') {
      issues.push(
        `"${upgrade.label}" is no longer available for this configuration and was not charged.`,
      );
      continue;
    }

    const clamped = Math.max(
      upgrade.minQty,
      upgrade.maxQty === null ? chosen : Math.min(chosen, upgrade.maxQty),
    );
    if (clamped !== chosen) {
      issues.push(`"${upgrade.label}" quantity adjusted to ${clamped} to fit its allowed range.`);
    }

    const tier = tierFor(upgrade.tiers, clamped);
    const unitAmount = tier ? tier.unitAmount : upgrade.amount;

    const { quantity: qty, value, issue } = unitQuantity(upgrade, clamped, derived);
    if (issue) {
      issues.push(issue);
      continue;
    }

    const amount = round2(unitAmount * qty);
    if (!Number.isFinite(amount)) {
      issues.push(`"${upgrade.label}" produced a value that is not a number.`);
      continue;
    }

    lines.push({
      code: upgrade.code,
      label: upgrade.label,
      unit: upgrade.unit,
      unitAmount,
      quantity: clamped,
      quantityCode: upgrade.unit === 'per_sqm' ? upgrade.quantityCode : null,
      quantityValue: value,
      amount,
      issues: [],
    });
  }

  const total = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  return { lines, total, issues };
}

// ---------------------------------------------------------------------------
// Bands
// ---------------------------------------------------------------------------

export function bandsForVariant(bands: BandDef[], variantCode: string | null): BandDef[] {
  return bands
    .filter((b) => b.variantCode === null || b.variantCode === variantCode)
    .slice()
    .sort((a, b) =>
      a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.code.localeCompare(b.code),
    );
}

/**
 * Half-open [min, max). The published list overlaps at its own boundaries —
 * width 950–1050 and 1050–1220 both claim exactly 1050 — and a door that
 * matches two bands would otherwise be charged twice for its width.
 */
export function bandMatches(band: BandDef, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (band.min !== null && value < band.min) return false;
  if (band.max !== null && value >= band.max) return false;
  return true;
}

export type BandLine = {
  code: string;
  label: string;
  groupCode: string;
  value: number;
  amount: number;
};

/**
 * At most ONE band per question. Two bands on the same measurement are
 * alternative descriptions of one door, not two charges, so the first match in
 * sort order wins and the rest are ignored.
 */
export function resolveBands(
  bands: BandDef[],
  selection: Selection,
): { lines: BandLine[]; total: number; issues: string[] } {
  const lines: BandLine[] = [];
  const issues: string[] = [];
  const claimed = new Set<string>();

  for (const band of bands) {
    if (claimed.has(band.groupCode)) continue;

    const value = selection[band.groupCode]?.numericValue;
    if (value === null || value === undefined) continue;
    if (!bandMatches(band, value)) continue;

    if (!Number.isFinite(band.amount)) {
      issues.push(`Band "${band.label}" has an amount that is not a number.`);
      continue;
    }

    claimed.add(band.groupCode);
    lines.push({
      code: band.code,
      label: band.label,
      groupCode: band.groupCode,
      value,
      amount: band.amount,
    });
  }

  const total = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  return { lines, total, issues };
}

/**
 * A measurement that falls through every band on its question. The supplier's
 * own list leaves height 2240–2440 uncovered, so this is a real hole rather
 * than a hypothetical one, and quoting 0 for it would be a guess at the
 * customer's expense.
 */
export function unbandedMeasurements(bands: BandDef[], selection: Selection): string[] {
  const groups = new Set(bands.map((b) => b.groupCode));
  const gaps: string[] = [];

  for (const group of groups) {
    const value = selection[group]?.numericValue;
    if (value === null || value === undefined) continue;
    const covered = bands.some((b) => b.groupCode === group && bandMatches(b, value));
    if (!covered) gaps.push(group);
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Effects — an upgrade reaching back into another question
// ---------------------------------------------------------------------------

export type ActiveEffect = UpgradeEffectDef & { upgradeCode: string; upgradeLabel: string };

export function activeEffects(
  upgrades: UpgradeDef[],
  picked: UpgradeSelection,
  selection: Selection,
  quantity: number,
): ActiveEffect[] {
  const out: ActiveEffect[] = [];
  for (const upgrade of upgrades) {
    const chosen = picked[upgrade.code];
    if (!chosen || chosen <= 0) continue;
    if (upgradeAvailability(upgrade, selection, quantity) !== 'yes') continue;
    for (const effect of upgrade.effects) {
      out.push({ ...effect, upgradeCode: upgrade.code, upgradeLabel: upgrade.label });
    }
  }
  return out;
}

/**
 * Which values of `groupCode` survive the active effects. Restrictions
 * INTERSECT: two upgrades that each narrow the colour list leave only the
 * colours both allow, because satisfying one at the expense of the other would
 * produce a door the factory has already said it will not build.
 */
export function allowedValues(
  effects: ActiveEffect[],
  groupCode: string,
  candidates: string[],
): string[] {
  let allowed = candidates;
  for (const effect of effects) {
    if (effect.groupCode !== groupCode) continue;
    if (effect.kind === 'restrict') {
      allowed = allowed.filter((code) => effect.valueCodes.includes(code));
    } else if (effect.kind === 'set') {
      allowed = allowed.filter((code) => effect.valueCodes.includes(code));
    }
  }
  return allowed;
}
