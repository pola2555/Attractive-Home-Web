import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerQuote, formatMoney } from './customerQuote';

const item = (over: Partial<Parameters<typeof buildCustomerQuote>[0][number]> = {}) => ({
  nameSnapshot: 'Door',
  codeSnapshot: null,
  quantity: '2',
  selectionLabel: '45mm, Oak',
  unitCost: '100.00',
  costCurrency: 'AED',
  priceBreakdown: {
    addons: [{ name: 'Hinges', quantity: 3 }],
    accessories: { lines: [{ name: 'Lock', quantity: 2 }], total: 50 },
  },
  ...over,
});

describe('buildCustomerQuote', () => {
  it('prices a line as unit x qty plus accessories and lists add-ons', () => {
    const v = buildCustomerQuote([item()], 'AED', null);
    assert.equal(v.lines[0].lineTotal, 250);
    assert.deepEqual(v.lines[0].addons, [{ name: 'Hinges', quantity: 3 }]);
    assert.deepEqual(v.totals, [{ currency: 'AED', amount: 250 }]);
  });

  it('converts foreign lines with the snapshotted rate', () => {
    const v = buildCustomerQuote(
      [item({ costCurrency: 'USD', priceBreakdown: null })],
      'AED',
      { USD: 3.6725 },
    );
    assert.equal(v.lines[0].currency, 'AED');
    assert.ok(Math.abs((v.lines[0].lineTotal ?? 0) - 734.5) < 1e-9);
  });

  it('never mixes currencies when there is no rate', () => {
    const v = buildCustomerQuote(
      [item({ priceBreakdown: null }), item({ costCurrency: 'CNY', priceBreakdown: null })],
      'AED',
      null,
    );
    assert.deepEqual(v.totals.map((t) => t.currency).sort(), ['AED', 'CNY']);
  });

  it('leaves unpriced lines out of the total', () => {
    const v = buildCustomerQuote([item({ unitCost: null })], 'AED', null);
    assert.equal(v.lines[0].lineTotal, null);
    assert.deepEqual(v.totals, []);
  });
});

describe('formatMoney', () => {
  it('formats with thousands separators and two decimals', () => {
    assert.equal(formatMoney(1234.5, 'AED'), 'AED 1,234.50');
  });
});
