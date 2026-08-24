import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeLanded, computeLandedBand, convert } from './compute';
import type { ComponentInput, LandedInput, LandedItemInput } from './types';

const fxRates = { USD: 3.6725, CNY: 0.5163, AED: 1 };

function component(over: Partial<ComponentInput> = {}): ComponentInput {
  return {
    kind: 'goods',
    label: 'Goods',
    amount: 10_000,
    amountLow: null,
    amountHigh: null,
    currency: 'AED',
    inCustomsBase: true,
    isRecoverable: false,
    isLocked: false,
    ...over,
  };
}

function item(over: Partial<LandedItemInput> = {}): LandedItemInput {
  return {
    id: 'i1',
    quantity: 10,
    goodsValue: 10_000,
    dutyPercent: 5,
    vatPercent: 5,
    hsCode: '4418.20',
    ...over,
  };
}

function input(over: Partial<LandedInput> = {}): LandedInput {
  return {
    quoteCurrency: 'AED',
    fxRates,
    components: [component()],
    items: [item()],
    contingencyPercent: 10,
    vatRecoverable: true,
    ...over,
  };
}

describe('the customs base', () => {
  it('charges duty on CIF: goods plus freight plus insurance', () => {
    const result = computeLanded(
      input({
        components: [
          component({ kind: 'goods', amount: 10_000 }),
          component({ kind: 'freight', label: 'Sea freight', amount: 2_000 }),
          component({ kind: 'insurance', label: 'Marine insurance', amount: 60 }),
        ],
      }),
      'expected',
    );
    assert.equal(result.cifValue, 12_060);
    assert.equal(result.dutyTotal, 603); // 5% of 12,060
  });

  it('excludes post-import charges from the customs base', () => {
    // The bug this prevents: handling and storage inflating BOTH duty and VAT.
    const result = computeLanded(
      input({
        components: [
          component({ kind: 'goods', amount: 10_000 }),
          component({ kind: 'handling', label: 'Handling', amount: 500, inCustomsBase: false }),
          component({ kind: 'inland', label: 'Delivery', amount: 300, inCustomsBase: false }),
        ],
      }),
      'expected',
    );
    assert.equal(result.cifValue, 10_000);
    assert.equal(result.dutyTotal, 500); // 5% of 10,000 — not of 10,800
  });

  it('charges VAT on CIF plus duty, not on CIF alone', () => {
    const result = computeLanded(input(), 'expected');
    // CIF 10,000 -> duty 500 -> VAT 5% of 10,500 = 525
    assert.equal(result.dutyTotal, 500);
    assert.equal(result.vatTotal, 525);
  });
});

describe('duty per HS code per item', () => {
  it('applies a different rate to each HS code in one shipment', () => {
    // A mixed container is the normal case; one shipment-level duty line
    // cannot express it.
    const result = computeLanded(
      input({
        components: [component({ kind: 'goods', amount: 20_000 })],
        items: [
          item({ id: 'doors', goodsValue: 10_000, dutyPercent: 5, hsCode: '4418.20' }),
          item({ id: 'exempt', goodsValue: 10_000, dutyPercent: 0, hsCode: '9999.99' }),
        ],
      }),
      'expected',
    );
    assert.equal(result.items.find((i) => i.id === 'doors')?.duty, 500);
    assert.equal(result.items.find((i) => i.id === 'exempt')?.duty, 0);
    assert.equal(result.dutyTotal, 500);
  });

  it('apportions freight across items by value, and includes it in each CIF', () => {
    const result = computeLanded(
      input({
        components: [
          component({ kind: 'goods', amount: 20_000 }),
          component({ kind: 'freight', label: 'Freight', amount: 3_000 }),
        ],
        items: [item({ id: 'a', goodsValue: 15_000 }), item({ id: 'b', goodsValue: 5_000 })],
      }),
      'expected',
    );
    const a = result.items.find((i) => i.id === 'a');
    const b = result.items.find((i) => i.id === 'b');
    assert.equal(a?.apportionedFreight, 2_250); // 75% of 3,000
    assert.equal(b?.apportionedFreight, 750);
    assert.equal(a?.cifValue, 17_250);
    assert.equal(b?.cifValue, 5_750);
  });

  it('answers "what does this one door cost" via landedUnitCost', () => {
    const result = computeLanded(
      input({
        components: [
          component({ kind: 'goods', amount: 10_000 }),
          component({ kind: 'freight', label: 'Freight', amount: 1_000 }),
        ],
        items: [item({ quantity: 10, goodsValue: 10_000 })],
      }),
      'expected',
    );
    // CIF 11,000 + duty 550 = 11,550 over 10 units. VAT is recoverable here.
    assert.equal(result.items[0].landedUnitCost, 1_155);
  });

  it('flags an item with no HS code instead of quietly defaulting it', () => {
    const result = computeLanded(input({ items: [item({ hsCode: null })] }), 'expected');
    assert.ok(result.issues.some((i) => i.includes('no HS code')));
  });
});

describe('recoverable VAT', () => {
  it('keeps reverse-charged VAT out of landed cost but in cash outlay', () => {
    // A VAT-registered importer reverse-charges import VAT on the return.
    // Booking it as cost would overstate every quote by 5%.
    const result = computeLanded(input({ vatRecoverable: true }), 'expected');
    assert.equal(result.landedCost, 10_500); // goods + duty
    assert.equal(result.cashOutlay, 11_025); // + VAT
  });

  it('includes VAT in both when it is a genuine cost', () => {
    const result = computeLanded(input({ vatRecoverable: false }), 'expected');
    assert.equal(result.landedCost, 11_025);
    assert.equal(result.cashOutlay, 11_025);
  });
});

describe('scenarios are computed end to end, never summed per component', () => {
  it('recomputes duty from each scenario own CIF', () => {
    // The core correctness rule. Duty at 5% of a low CIF is a different number
    // from 5% of an expected CIF; a stored per-component "low duty" cannot be
    // right for both.
    const band = computeLandedBand(
      input({
        components: [
          component({ kind: 'goods', amount: 10_000, amountLow: 9_000, amountHigh: 12_000 }),
        ],
        contingencyPercent: 0,
      }),
    );
    assert.equal(band.low.cifValue, 9_000);
    assert.equal(band.low.dutyTotal, 450);
    assert.equal(band.expected.dutyTotal, 500);
    assert.equal(band.high.cifValue, 12_000);
    assert.equal(band.high.dutyTotal, 600);
  });

  it('produces a monotonic band', () => {
    const band = computeLandedBand(input());
    assert.ok(band.low.landedCost <= band.expected.landedCost);
    assert.ok(band.expected.landedCost <= band.high.landedCost);
  });

  it('uses the contingency only where a provider gave no explicit band', () => {
    const band = computeLandedBand(
      input({
        components: [
          component({ kind: 'goods', amount: 10_000, amountLow: 9_800, amountHigh: 10_100 }),
          component({ kind: 'freight', label: 'Freight', amount: 1_000 }),
        ],
        contingencyPercent: 10,
      }),
    );
    // Goods keep their explicit band; freight widens by the 10% contingency.
    assert.equal(band.low.cifValue, 9_800 + 900);
    assert.equal(band.high.cifValue, 10_100 + 1_100);
  });

  it('gives a locked component no band at all, because an invoice is a fact', () => {
    const band = computeLandedBand(
      input({
        components: [component({ kind: 'goods', amount: 10_000, isLocked: true })],
        contingencyPercent: 25,
      }),
    );
    assert.equal(band.low.cifValue, 10_000);
    assert.equal(band.high.cifValue, 10_000);
  });

  it('narrows the band as estimates become actuals', () => {
    const estimate = computeLandedBand(
      input({
        components: [
          component({ kind: 'goods', amount: 10_000 }),
          component({ kind: 'freight', label: 'Freight', amount: 2_000 }),
        ],
      }),
    );
    const locked = computeLandedBand(
      input({
        components: [
          component({ kind: 'goods', amount: 10_000, isLocked: true }),
          component({ kind: 'freight', label: 'Freight', amount: 2_000, isLocked: true }),
        ],
      }),
    );
    const spread = (b: ReturnType<typeof computeLandedBand>) =>
      b.high.landedCost - b.low.landedCost;
    assert.ok(spread(locked) < spread(estimate));
    assert.equal(spread(locked), 0);
  });
});

describe('actual customs invoices override the calculation', () => {
  it('ignores an unlocked duty line, because duty is already computed', () => {
    // Double-billing guard: an estimate of a number the calculator derives must
    // not also be summed as an ordinary charge.
    const result = computeLanded(
      input({
        components: [
          component({ kind: 'goods', amount: 10_000 }),
          component({
            kind: 'customs_duty',
            label: 'Estimated duty',
            amount: 9_999,
            inCustomsBase: false,
          }),
        ],
      }),
      'expected',
    );
    assert.equal(result.dutyTotal, 500);
    assert.equal(result.landedCost, 10_500);
  });

  it('takes a LOCKED duty line as the truth', () => {
    const result = computeLanded(
      input({
        components: [
          component({ kind: 'goods', amount: 10_000 }),
          component({
            kind: 'customs_duty',
            label: 'Mirsal-2 duty',
            amount: 612.4,
            inCustomsBase: false,
            isLocked: true,
          }),
        ],
      }),
      'expected',
    );
    assert.equal(result.dutyTotal, 612.4);
    assert.ok(result.issues.some((i) => i.includes('locked actual')));
  });

  it('rescales the per-item split so lines still add up to the header', () => {
    const result = computeLanded(
      input({
        components: [
          component({ kind: 'goods', amount: 20_000 }),
          component({
            kind: 'customs_duty',
            label: 'Actual duty',
            amount: 1_200,
            inCustomsBase: false,
            isLocked: true,
          }),
        ],
        items: [item({ id: 'a', goodsValue: 15_000 }), item({ id: 'b', goodsValue: 5_000 })],
      }),
      'expected',
    );
    const summed = result.items.reduce((total, i) => total + i.duty, 0);
    assert.equal(round2(summed), 1_200);
    assert.equal(result.items.find((i) => i.id === 'a')?.duty, 900); // 75%
  });
});

describe('currency conversion', () => {
  it('converts a supplier cost into the quote currency', () => {
    const result = computeLanded(
      input({
        components: [component({ kind: 'goods', amount: 1_000, currency: 'USD' })],
        items: [item({ goodsValue: 3_672.5 })],
      }),
      'expected',
    );
    assert.equal(result.cifValue, 3_672.5);
  });

  it('reports a missing rate instead of silently treating it as 1:1', () => {
    const result = computeLanded(
      input({ components: [component({ currency: 'JPY' })] }),
      'expected',
    );
    assert.ok(result.issues.some((i) => i.includes('No FX rate for JPY')));
  });

  it('is an identity when the currencies match', () => {
    assert.deepEqual(convert(100, 'AED', 'AED', fxRates), { value: 100, ok: true });
  });
});

describe('rounding', () => {
  it('keeps the displayed lines consistent with the stored total', () => {
    const result = computeLanded(
      input({
        components: [
          component({ kind: 'goods', amount: 3_333.33 }),
          component({ kind: 'freight', label: 'Freight', amount: 1_111.11 }),
        ],
        items: [item({ goodsValue: 3_333.33 })],
      }),
      'expected',
    );
    const summed = result.lines.reduce((total, line) => total + line.amount, 0);
    assert.equal(Math.round(summed * 100) / 100, result.cifValue);
  });
});

function round2(value: number): number {
  return Math.round(value * 100 + Number.EPSILON) / 100;
}
