import { priceAddons, type AddonLine, type AddonSelection } from './addons';
import { lookupGrid, selectedVariantCode, variantByCode, withVariant } from './grid';
import { lookupPriceTree } from './tree';
import { priceConfiguration, type PriceResult, type PriceSeed, type PriceSeedLine } from './price';
import { computeDerived } from './resolve';
import {
  bandsForVariant,
  priceUpgrades,
  resolveBands,
  unbandedMeasurements,
  upgradesForVariant,
  type BandLine,
  type UpgradeLine,
  type UpgradeSelection,
} from './upgrades';
import type { GridLookup, PricingRuleDef, Selection, TemplateDef } from './types';

// The whole price of one configured product, in one call.
//
// The composition order is the thing to get right, and it is not arbitrary:
//
//   base       the supplier's published cell
//   adder      automatic size bands, then the upgrades someone ticked
//   multiplier surcharges
//   margin     the company's margin
//   discount   anything taken off the marked-up price
//
// Bands and upgrades sit in `adder` rather than being added at the end so that
// margin is taken ON them. Adding them after the margin stage would quietly
// sell every upgrade at cost — on the Benison door that is 78 USD of upgrades
// escaping a 32% margin on a 90 USD base.

export type ProductPriceResult = PriceResult & {
  variantCode: string | null;
  grid: GridLookup;
  bandLines: BandLine[];
  upgradeLines: UpgradeLine[];
  /** Canvas add-ons charged onto the line (priced straight from the tree). */
  addonLines: AddonLine[];
  /** Measurements that fell through every band — a hole in the price list. */
  unbanded: string[];
  /** True when a base price was actually found. */
  isPriceable: boolean;
};

export type PriceProductInput = {
  template: TemplateDef;
  selection: Selection;
  /** Upgrade code -> quantity. Absent or 0 means not chosen. */
  picked?: UpgradeSelection;
  /** Canvas add-on id -> quantity. Absent or 0 means not chosen. */
  pickedAddons?: AddonSelection;
  quantity?: number;
  /** Product-scoped rules that override the template's by code. */
  extraRules?: PricingRuleDef[];
};

export { selectedVariantCode, withVariant };

export function priceProduct(input: PriceProductInput): ProductPriceResult {
  const {
    template,
    selection,
    picked = {},
    pickedAddons = {},
    quantity = 1,
    extraRules = [],
  } = input;

  const variantCode = selectedVariantCode(selection);
  const variant = variantByCode(template.variants ?? [], variantCode);
  // A variant priced by a decision tree uses it for the base; otherwise the
  // cartesian grid. Both return the same GridLookup, so the rest is identical.
  const grid =
    variant?.priceTree && variant.priceTree.length > 0
      ? lookupPriceTree(variant.priceTree, selection, variant.grid?.currency ?? template.currency)
      : lookupGrid(variant?.grid ?? null, selection);

  const { derived } = computeDerived(template, selection);

  const bands = bandsForVariant(template.bands ?? [], variantCode);
  const bandResult = resolveBands(bands, selection);

  const upgrades = upgradesForVariant(template.upgrades ?? [], variantCode);
  const upgradeResult = priceUpgrades(upgrades, picked, selection, derived, quantity);

  // Canvas add-ons priced straight from the tree. During the migration only the
  // FLAT, non-colour add-ons are charged here (colours are a question, sizes are
  // still bands, option-tree add-ons follow next); each is offered only on the
  // branches its canvas attachment hangs on.
  const addonDefs = template.extrasFromCanvas
    ? (variant?.addons ?? []).filter((a) => a.colorHex === null && a.nodes.length === 0)
    : [];
  const addonResult = priceAddons(
    addonDefs,
    pickedAddons,
    variant?.priceTree,
    selection,
    variant?.grid?.currency ?? template.currency,
  );

  const seed: PriceSeed = {};
  const issues: string[] = [...bandResult.issues, ...upgradeResult.issues, ...addonResult.issues];

  if (grid.state === 'sold' && grid.amount !== null) {
    const label = variant ? `${variant.name} — base` : 'Base';
    seed.base = [{ code: 'grid_base', label, amount: grid.amount, source: 'grid' }];
  } else if (grid.state === 'not_sold') {
    issues.push('This combination is not sold by the supplier, so it has no base price.');
  } else if (grid.state === 'not_entered') {
    issues.push(
      'No price has been entered for this combination yet — the grid is incomplete, not the door unavailable.',
    );
  } else if (grid.state === 'incomplete') {
    issues.push(`Still to answer: ${grid.missingAxes.join(', ')}.`);
  }

  const adders: PriceSeedLine[] = [];
  for (const band of bandResult.lines) {
    adders.push({
      code: `band_${band.code}`,
      label: band.label,
      amount: band.amount,
      source: 'band',
    });
  }
  for (const line of upgradeResult.lines) {
    adders.push({
      code: `upg_${line.code}`,
      label: line.quantity > 1 ? `${line.label} × ${line.quantity}` : line.label,
      amount: line.amount,
      source: 'upgrade',
    });
  }
  for (const line of addonResult.lines) {
    adders.push({
      code: `addon_${line.addonId}`,
      label: line.quantity > 1 ? `${line.name} × ${line.quantity}` : line.name,
      amount: line.amount,
      source: 'addon',
    });
  }
  if (adders.length) seed.adder = adders;

  const unbanded = unbandedMeasurements(bands, selection);
  for (const group of unbanded) {
    issues.push(
      `No size band covers the ${group} that was entered. The published list has a gap there — confirm the charge with the supplier rather than quoting nothing.`,
    );
  }

  const priced = priceConfiguration(template, selection, quantity, extraRules, seed);

  return {
    ...priced,
    // The grid carries the supplier's own currency, which is the authority for
    // anything actually bought; the template currency only covers its rules.
    currency: grid.currency ?? priced.currency,
    issues: [...issues, ...priced.issues],
    variantCode,
    grid,
    bandLines: bandResult.lines,
    upgradeLines: upgradeResult.lines,
    addonLines: addonResult.lines,
    unbanded,
    // `no_grid` is priceable. A template that has no grid is priced entirely
    // by its rules — which is every template that existed before grids did —
    // and treating a missing grid as a missing price would make all of them
    // permanently unquotable. Only a cell that is refused, unfilled or not yet
    // addressed actually withholds a price.
    isPriceable: grid.state === 'sold' || grid.state === 'no_grid',
  };
}
