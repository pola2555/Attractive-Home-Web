import {
  CIF_KINDS,
  SCENARIOS,
  type ComponentInput,
  type LandedInput,
  type LandedItemResult,
  type LandedLine,
  type LandedResult,
  type Scenario,
} from './types';

// The landed-cost calculator.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: a range is computed PER SCENARIO,
// end-to-end, never by summing per-component minimums.
//
// Summing them is the intuitive thing to do and it is wrong. `sum(low)` over
// ten components describes a shipment where every independent variable landed
// at its floor simultaneously — a number with essentially zero probability that
// a salesperson can quote and lose money on. Worse, some components are
// anti-correlated (a longer transit costs less in freight and more in storage),
// so the naive band is wider than reality in one direction and impossible in
// the other. And percentages must be recomputed from THEIR OWN scenario's base:
// duty at 5% of a low CIF is not the same number as 5% of an expected CIF.
//
// The three modes are likewise compared side by side, never blended: the
// "maximum" of an air quote plus the "maximum" of sea port storage is a
// shipment that does not exist.

function round2(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100;
}

export function convert(
  amount: number,
  from: string,
  to: string,
  fxRates: Record<string, number>,
): { value: number; ok: boolean } {
  if (from === to) return { value: amount, ok: true };
  const fromRate = from === to ? 1 : fxRates[from];
  const toRate = to === 'AED' ? 1 : fxRates[to];
  if (!fromRate || !toRate) return { value: amount, ok: false };
  // Rates are quoted as units of AED per 1 foreign unit, so convert via AED.
  return { value: (amount * fromRate) / toRate, ok: true };
}

// A locked component is an invoice: it has no band. Everything else uses its
// explicit low/high when the provider supplied one, and falls back to the
// contingency percentage when it did not — which is what makes contingency
// meaningful without double-counting an already-ranged estimate.
function scenarioAmount(
  component: ComponentInput,
  scenario: Scenario,
  contingencyPercent: number,
): number {
  if (component.isLocked || scenario === 'expected') return component.amount;
  const spread = component.amount * (contingencyPercent / 100);
  if (scenario === 'low') return component.amountLow ?? component.amount - spread;
  return component.amountHigh ?? component.amount + spread;
}

export function computeLanded(input: LandedInput, scenario: Scenario): LandedResult {
  const issues: string[] = [];
  const currency = input.quoteCurrency;

  // ---- 1. Normalise every component into the quote currency ---------------
  const lines: LandedLine[] = [];
  for (const component of input.components) {
    const raw = scenarioAmount(component, scenario, input.contingencyPercent);
    const converted = convert(raw, component.currency, currency, input.fxRates);
    if (!converted.ok) {
      issues.push(
        `No FX rate for ${component.currency} -> ${currency}; "${component.label}" was left unconverted.`,
      );
    }
    lines.push({
      kind: component.kind,
      label: component.label,
      amount: round2(converted.value),
      currency,
      inCustomsBase: component.inCustomsBase,
      isRecoverable: component.isRecoverable,
      isLocked: component.isLocked,
    });
  }

  // ---- 2. Split the ledger at the customs base ----------------------------
  // Duty is charged on CIF. Handling, inland and port storage happen AFTER
  // import and must stay out, or they inflate duty and VAT together.
  const cifLines = lines.filter((line) => line.inCustomsBase);
  const postImportLines = lines.filter((line) => !line.inCustomsBase);

  const goodsFromLines = cifLines
    .filter((line) => line.kind === 'goods')
    .reduce((sum, line) => sum + line.amount, 0);
  const freightAndInsurance = cifLines
    .filter((line) => line.kind !== 'goods')
    .reduce((sum, line) => sum + line.amount, 0);
  const postImportTotal = postImportLines.reduce((sum, line) => sum + line.amount, 0);

  // ---- 3. Apportion freight + insurance across the items ------------------
  // By value. Weight would be defensible too, but it has to be ONE of them and
  // written down: value is what a customs declaration uses.
  const itemsGoodsValue = input.items.reduce((sum, item) => sum + item.goodsValue, 0);

  if (itemsGoodsValue === 0 && input.items.length > 0) {
    issues.push('Items have no goods value, so freight could not be apportioned across them.');
  }

  // Item goods values describe the SAME goods as the `goods` cost component, so
  // they have to move with it. Without this scale factor the low scenario would
  // report a 9,000 CIF at shipment level while charging duty on each item's
  // unscaled 10,000 — the per-item and shipment-level answers would disagree in
  // every scenario except `expected`.
  const goodsScale =
    itemsGoodsValue > 0 && goodsFromLines > 0 ? goodsFromLines / itemsGoodsValue : 1;

  // ---- 4. Duty PER HS CODE PER ITEM ---------------------------------------
  // A mixed container carries several duty rates, which is the normal case. One
  // shipment-level duty line simply cannot express it, and without per-item
  // duty there is no answer to "what do I sell this door for".
  const items: LandedItemResult[] = [];
  let dutyTotal = 0;
  let vatTotal = 0;

  for (const item of input.items) {
    // Relative share is unaffected by the uniform scale, so it uses the raw
    // values; the item's own contribution to CIF is the scaled one.
    const share = itemsGoodsValue > 0 ? item.goodsValue / itemsGoodsValue : 0;
    const scaledGoods = item.goodsValue * goodsScale;
    const apportionedFreight = freightAndInsurance * share;
    const cifValue = scaledGoods + apportionedFreight;
    const duty = (cifValue * item.dutyPercent) / 100;
    // VAT sits on CIF + duty, not on CIF alone.
    const vat = ((cifValue + duty) * item.vatPercent) / 100;
    const otherCharges = postImportTotal * share;

    if (!item.hsCode) {
      issues.push(
        `Item ${item.id} has no HS code — duty defaulted to ${item.dutyPercent}%. Confirm before sending.`,
      );
    }

    dutyTotal += duty;
    vatTotal += vat;

    const landedTotal = cifValue + duty + otherCharges + (input.vatRecoverable ? 0 : vat);

    items.push({
      id: item.id,
      quantity: item.quantity,
      goodsValue: round2(scaledGoods),
      apportionedFreight: round2(apportionedFreight),
      cifValue: round2(cifValue),
      duty: round2(duty),
      vat: round2(vat),
      otherCharges: round2(otherCharges),
      landedTotal: round2(landedTotal),
      landedUnitCost: item.quantity > 0 ? round2(landedTotal / item.quantity) : 0,
    });
  }

  const cifValue = goodsFromLines + freightAndInsurance;

  // ---- 5. Roll up ---------------------------------------------------------
  // Landed cost is what the goods cost the business. Cash outlay is what leaves
  // the bank. They differ by exactly the recoverable VAT: a VAT-registered
  // importer reverse-charges import VAT on the return, so treating it as cost
  // would overstate every quote by 5%.
  const landedCost = cifValue + postImportTotal + dutyTotal + (input.vatRecoverable ? 0 : vatTotal);
  const cashOutlay = cifValue + postImportTotal + dutyTotal + vatTotal;

  return {
    scenario,
    currency,
    cifValue: round2(cifValue),
    dutyTotal: round2(dutyTotal),
    vatTotal: round2(vatTotal),
    landedCost: round2(landedCost),
    cashOutlay: round2(cashOutlay),
    lines,
    items,
    issues,
  };
}

export type LandedBand = Record<Scenario, LandedResult>;

/** All three scenarios, each evaluated end-to-end. */
export function computeLandedBand(input: LandedInput): LandedBand {
  return {
    low: computeLanded(input, 'low'),
    expected: computeLanded(input, 'expected'),
    high: computeLanded(input, 'high'),
  } as LandedBand;
}

export { SCENARIOS, CIF_KINDS };
