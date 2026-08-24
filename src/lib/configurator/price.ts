import { evaluateCondition, type ConditionScope } from './condition';
import { buildFormulaScope, computeDerived } from './resolve';
import {
  PRICING_STAGES,
  QUANTITY_VAR,
  type ApplyPer,
  type PricingBasis,
  type PricingRuleDef,
  type PricingStage,
  type Selection,
  type TemplateDef,
} from './types';

// The pricing engine.
//
// Rules evaluate by (stage, priority, code) — a TOTAL order. `priority` alone
// is not unique, and "whatever Postgres returned first" is not an acceptable
// input to a price.
//
// A `percent` rule applies to the subtotal at the END OF THE PREVIOUS STAGE,
// never to a running total inside its own stage. Two consequences, both
// deliberate:
//   * `flat` and `per_quantity` become commutative within a stage, so priority
//     ties stop being able to change the answer at all;
//   * "10% hardware surcharge", "35% margin" and "8% volume discount" stop
//     being the same operation. Percent-of-running-total silently makes the
//     answer depend on the order someone happened to author the rules in.
//
// Stage order is the declaration order in PRICING_STAGES:
//   base -> adder -> multiplier -> margin -> discount
// so a discount comes off the marked-up price, which is what a customer-facing
// discount means.

export type PriceBreakdownLine = {
  ruleCode: string;
  stage: PricingStage;
  basis: PricingBasis;
  applyPer: ApplyPer;
  quantityCode: string | null;
  quantityValue: number | null;
  rate: number | null;
  amount: number | null;
  /** Signed, in the template currency. */
  contribution: number;
  /**
   * Where the money came from. A salesperson reading a build-up needs to know
   * whether a figure is the supplier's published cell, an automatic size step,
   * something they ticked, or a margin the company applied.
   */
  source?: 'rule' | 'grid' | 'band' | 'upgrade';
  /** Human label for seeded lines; rules are identified by their code. */
  label?: string;
};

/**
 * Figures injected into a stage before its rules run.
 *
 * The grid price and the upgrades a person ticked are not rules, but they have
 * to take part in the SAME staged arithmetic — otherwise a 32% margin would be
 * taken on an empty base and the upgrades would escape it entirely. Seeding
 * them keeps one pricing path, so `percent`-of-previous-stage keeps meaning
 * exactly what it meant before any of this existed.
 */
export type PriceSeedLine = {
  code: string;
  label: string;
  amount: number;
  source: 'grid' | 'band' | 'upgrade';
  /** Charged once per line rather than per unit — a survey fee, say. */
  perLine?: boolean;
};

export type PriceSeed = Partial<Record<PricingStage, PriceSeedLine[]>>;

export type PriceResult = {
  currency: string;
  /** Cost of one unit after every stage. */
  unitCost: number;
  /** Charges that apply once per line, regardless of quantity. */
  lineExtras: number;
  /** Charges that apply once per quote; the caller deduplicates by rule code. */
  quoteExtras: { ruleCode: string; amount: number }[];
  /** unitCost * quantity + lineExtras. */
  lineTotal: number;
  breakdown: PriceBreakdownLine[];
  issues: string[];
};

function round2(value: number): number {
  // Half-up on the absolute value, so -0.005 and 0.005 round symmetrically
  // rather than toward positive infinity the way Math.round does.
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100;
}

function compareRules(a: PricingRuleDef, b: PricingRuleDef): number {
  const stageDelta = PRICING_STAGES.indexOf(a.stage) - PRICING_STAGES.indexOf(b.stage);
  if (stageDelta !== 0) return stageDelta;
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.code.localeCompare(b.code);
}

export function priceConfiguration(
  template: TemplateDef,
  selection: Selection,
  quantity = 1,
  extraRules: PricingRuleDef[] = [],
  seed: PriceSeed = {},
): PriceResult {
  const issues: string[] = [];
  const breakdown: PriceBreakdownLine[] = [];

  const { derived } = computeDerived(template, selection);
  const quantityScope: Record<string, number> = {
    ...buildFormulaScope(template, selection, derived),
    [QUANTITY_VAR]: quantity,
  };
  const conditionScope: ConditionScope = { selection, quantity };

  // Product-scoped rules override template-scoped ones with the same code:
  // the product is the more specific scope, so it wins.
  const byCode = new Map<string, PricingRuleDef>();
  for (const rule of template.rules) byCode.set(rule.code, rule);
  for (const rule of extraRules) byCode.set(rule.code, rule);
  const rules = [...byCode.values()].sort(compareRules);

  let unitSubtotal = 0;
  let lineExtras = 0;
  const quoteExtras: { ruleCode: string; amount: number }[] = [];

  for (const stage of PRICING_STAGES) {
    const stageRules = rules.filter((rule) => rule.stage === stage);
    const stageSeed = seed[stage] ?? [];
    if (stageRules.length === 0 && stageSeed.length === 0) continue;

    // Frozen before the stage runs — this is what makes the stage order the
    // only thing that matters, and rule order within a stage irrelevant.
    const stageBase = unitSubtotal;
    let stageDelta = 0;

    // Seeded figures land first, but because a percentage reads `stageBase`
    // rather than the running total, "first" costs nothing: within a stage the
    // arithmetic stays commutative whichever way round they are added.
    for (const line of stageSeed) {
      if (!Number.isFinite(line.amount)) {
        issues.push(`"${line.label}" produced a value that is not a number.`);
        continue;
      }
      breakdown.push({
        ruleCode: line.code,
        stage,
        basis: 'flat',
        applyPer: line.perLine ? 'line' : 'unit',
        quantityCode: null,
        quantityValue: null,
        rate: null,
        amount: line.amount,
        contribution: round2(line.amount),
        source: line.source,
        label: line.label,
      });
      if (line.perLine) lineExtras += line.amount;
      else stageDelta += line.amount;
    }

    for (const rule of stageRules) {
      if (evaluateCondition(rule.condition, conditionScope) !== 'yes') continue;

      let contribution = 0;
      let quantityValue: number | null = null;

      if (rule.basis === 'flat') {
        if (rule.amount === null) {
          issues.push(`Rule "${rule.code}" is flat but has no amount.`);
          continue;
        }
        contribution = rule.amount;
      } else if (rule.basis === 'percent') {
        if (rule.rate === null) {
          issues.push(`Rule "${rule.code}" is a percentage but has no rate.`);
          continue;
        }
        if (rule.applyPer !== 'unit') {
          // A percentage of a per-line or per-quote charge has no well-defined
          // base. Refusing is better than inventing one.
          issues.push(
            `Rule "${rule.code}" is a percentage, which only applies per unit — ignoring its "${rule.applyPer}" scope.`,
          );
        }
        contribution = (stageBase * rule.rate) / 100;
      } else {
        if (rule.rate === null) {
          issues.push(`Rule "${rule.code}" is per-quantity but has no rate.`);
          continue;
        }
        if (!rule.quantityCode) {
          issues.push(`Rule "${rule.code}" is per-quantity but names no quantity.`);
          continue;
        }
        const resolved = quantityScope[rule.quantityCode];
        if (resolved === undefined || !Number.isFinite(resolved)) {
          // Most often a derived quantity whose formula failed. Charging zero
          // silently would under-price the line, so say so instead.
          issues.push(`Rule "${rule.code}" needs "${rule.quantityCode}", which has no value yet.`);
          continue;
        }
        quantityValue = resolved;
        contribution = rule.rate * resolved;
      }

      breakdown.push({
        ruleCode: rule.code,
        stage: rule.stage,
        basis: rule.basis,
        applyPer: rule.applyPer,
        quantityCode: rule.quantityCode,
        quantityValue,
        rate: rule.rate,
        amount: rule.amount,
        contribution: round2(contribution),
        source: 'rule',
      });

      // A one-off tooling charge on 12 doors is charged once, not twelve times.
      if (rule.applyPer === 'line' && rule.basis !== 'percent') {
        lineExtras += contribution;
      } else if (rule.applyPer === 'quote' && rule.basis !== 'percent') {
        quoteExtras.push({ ruleCode: rule.code, amount: round2(contribution) });
      } else {
        stageDelta += contribution;
      }
    }

    unitSubtotal += stageDelta;
  }

  const unitCost = round2(unitSubtotal);
  const roundedLineExtras = round2(lineExtras);

  return {
    currency: template.currency,
    unitCost,
    lineExtras: roundedLineExtras,
    quoteExtras,
    lineTotal: round2(unitCost * quantity + roundedLineExtras),
    breakdown,
    issues,
  };
}

// A cheap fingerprint of the rules that were actually applied. Stored on the
// quote item; a mismatch on load raises a "pricing changed since this was
// priced" banner. Deliberately NOT a rule-versioning table: it answers "is this
// stale?" without the cost of making every rule edit immutable.
export function pricingInputsHash(rules: PricingRuleDef[]): string {
  const canonical = [...rules]
    .sort(compareRules)
    .map((rule) =>
      [
        rule.code,
        rule.stage,
        rule.priority,
        rule.basis,
        rule.quantityCode ?? '',
        rule.applyPer,
        rule.amount ?? '',
        rule.rate ?? '',
        rule.currency ?? '',
        JSON.stringify(rule.condition ?? null),
      ].join('|'),
    )
    .join('\n');

  // FNV-1a — no crypto import, so this module stays usable on the client.
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
