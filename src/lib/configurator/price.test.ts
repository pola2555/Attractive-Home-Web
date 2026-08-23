import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { doorTemplate, oakDoorSelection, select } from './fixtures.test-support';
import { priceConfiguration, pricingInputsHash } from './price';
import type { PricingRuleDef, Selection, TemplateDef } from './types';

const template = doorTemplate();

describe('golden sample — solid oak door, 2100 x 900 x 45 mm', () => {
  // The single highest-value test in the module. Every number below is derived
  // by hand, so any drift in stage ordering, percent bases or rounding fails
  // here rather than in a customer quote.
  //
  //   area          2100 * 900 / 1e6              = 1.89 m2
  //   base          42 * 1.89                     =  79.38
  //   oak adder     65 * 1.89                     = 122.85   -> 202.23
  //   margin        35% of 202.23 (stage base)    =  70.7805 -> 273.0105
  //   unit cost     round half-up                 = 273.01
  //   setup fee     flat 220, once per LINE       = 220.00
  const result = priceConfiguration(template, oakDoorSelection(), 1);

  it('prices one unit at 273.01', () => {
    assert.equal(result.unitCost, 273.01);
  });

  it('charges the setup fee once per line, outside the unit cost', () => {
    assert.equal(result.lineExtras, 220);
    assert.equal(result.lineTotal, 493.01);
  });

  it('prices in the template currency', () => {
    assert.equal(result.currency, 'USD');
  });

  it('reports no issues for a complete selection', () => {
    assert.deepEqual(result.issues, []);
  });

  it('records every rule that fired, with its contribution', () => {
    const byCode = Object.fromEntries(result.breakdown.map((b) => [b.ruleCode, b.contribution]));
    assert.deepEqual(byCode, {
      panel_base: 79.38,
      material_oak: 122.85,
      setup_fee: 220,
      standard_margin: 70.78,
    });
  });

  it('does not fire rules whose conditions do not match', () => {
    const codes = result.breakdown.map((b) => b.ruleCode);
    assert.equal(codes.includes('material_walnut'), false);
    assert.equal(codes.includes('glazing_double'), false);
    assert.equal(codes.includes('volume_discount_50'), false);
  });
});

describe('apply_per', () => {
  it('charges a per-line fee once regardless of quantity', () => {
    // The bug this prevents: 220 x 12 = 2,640 on a one-off tooling charge.
    const one = priceConfiguration(template, oakDoorSelection(), 1);
    const twelve = priceConfiguration(template, oakDoorSelection(), 12);
    assert.equal(one.lineExtras, 220);
    assert.equal(twelve.lineExtras, 220);
  });

  it('scales only the unit cost with quantity', () => {
    const twelve = priceConfiguration(template, oakDoorSelection(), 12);
    assert.equal(twelve.lineTotal, round2(twelve.unitCost * 12 + 220));
  });

  it('routes a per-quote rule out of the line entirely', () => {
    const withQuoteRule: TemplateDef = {
      ...template,
      rules: [
        ...template.rules,
        rule('doc_fee', 'adder', 95, 'flat', { amount: 90, applyPer: 'quote' }),
      ],
    };
    const result = priceConfiguration(withQuoteRule, oakDoorSelection(), 4);
    assert.deepEqual(result.quoteExtras, [{ ruleCode: 'doc_fee', amount: 90 }]);
    assert.equal(result.lineExtras, 220, 'the quote fee must not leak into the line');
  });
});

describe('the __qty tier', () => {
  it('does not discount below the threshold', () => {
    assert.equal(priceConfiguration(template, oakDoorSelection(), 49).unitCost, 273.01);
  });

  it('discounts from 50 units, off the marked-up price', () => {
    // 273.0105 - 8% = 251.16966 -> 251.17
    const result = priceConfiguration(template, oakDoorSelection(), 50);
    assert.equal(result.unitCost, 251.17);
    assert.equal(result.lineTotal, round2(251.17 * 50 + 220));
  });
});

describe('stage semantics', () => {
  it('applies a percentage to the stage base, not to a running total', () => {
    // Two adders in the same stage, then a margin. If the margin took a running
    // total it would compound differently depending on rule order.
    const selection = oakDoorSelection();
    const forward: TemplateDef = { ...template, rules: [...template.rules] };
    const reversed: TemplateDef = { ...template, rules: [...template.rules].reverse() };
    assert.equal(
      priceConfiguration(forward, selection, 1).unitCost,
      priceConfiguration(reversed, selection, 1).unitCost,
    );
  });

  it('is unaffected by priority ties within a stage', () => {
    const tied: TemplateDef = {
      ...template,
      rules: template.rules.map((r) => ({ ...r, priority: 100 })),
    };
    assert.equal(priceConfiguration(tied, oakDoorSelection(), 1).unitCost, 273.01);
  });

  it('runs margin before discount, so a discount comes off the sell price', () => {
    const result = priceConfiguration(template, oakDoorSelection(), 50);
    const stages = result.breakdown.map((b) => b.stage);
    assert.ok(stages.indexOf('margin') < stages.indexOf('discount'));
  });
});

describe('conditional adders', () => {
  it('charges the walnut rate when walnut is chosen', () => {
    const walnut: Selection = {
      ...oakDoorSelection(),
      door_material: select('door_material', 'solid_walnut'),
    };
    const result = priceConfiguration(template, walnut, 1);
    const codes = result.breakdown.map((b) => b.ruleCode);
    assert.ok(codes.includes('material_walnut'));
    assert.equal(codes.includes('material_oak'), false);
  });

  it('adds the double-glazing rate only on a glazed door', () => {
    const glazed: Selection = {
      ...oakDoorSelection(),
      door_type: select('door_type', 'glazed'),
      glazing: select('glazing', 'double'),
    };
    const result = priceConfiguration(template, glazed, 1);
    const line = result.breakdown.find((b) => b.ruleCode === 'glazing_double');
    assert.equal(line?.contribution, 56.7); // 30 * 1.89
  });

  it('adds a flat surcharge for a custom colour', () => {
    const custom: Selection = {
      ...oakDoorSelection(),
      finish_color: select('finish_color', 'custom_ral'),
    };
    const result = priceConfiguration(template, custom, 1);
    assert.equal(result.breakdown.find((b) => b.ruleCode === 'custom_ral')?.contribution, 45);
  });
});

describe('product-scoped overrides', () => {
  it('lets a product-scoped rule replace the template rule of the same code', () => {
    const override = rule('panel_base', 'base', 10, 'per_quantity', {
      quantityCode: 'area_m2',
      rate: 60,
    });
    const result = priceConfiguration(template, oakDoorSelection(), 1, [override]);
    assert.equal(result.breakdown.find((b) => b.ruleCode === 'panel_base')?.contribution, 113.4);
  });
});

describe('failure reporting', () => {
  it('refuses to price a rule whose quantity has no value, rather than charging zero', () => {
    const incomplete: Selection = { ...oakDoorSelection() };
    delete incomplete.width;
    const result = priceConfiguration(template, incomplete, 1);
    assert.ok(result.issues.some((i) => i.includes('area_m2')));
    assert.equal(
      result.breakdown.some((b) => b.ruleCode === 'panel_base'),
      false,
    );
  });

  it('reports a misconfigured rule instead of guessing', () => {
    const broken: TemplateDef = {
      ...template,
      rules: [rule('no_amount', 'base', 10, 'flat', {})],
    };
    const result = priceConfiguration(broken, oakDoorSelection(), 1);
    assert.ok(result.issues.some((i) => i.includes('no_amount')));
    assert.equal(result.unitCost, 0);
  });

  it('ignores a non-unit scope on a percentage and says so', () => {
    const odd: TemplateDef = {
      ...template,
      rules: [
        rule('base_only', 'base', 10, 'flat', { amount: 100 }),
        rule('pct', 'margin', 10, 'percent', { rate: 10, applyPer: 'line' }),
      ],
    };
    const result = priceConfiguration(odd, oakDoorSelection(), 1);
    assert.ok(result.issues.some((i) => i.includes('only applies per unit')));
    assert.equal(result.unitCost, 110);
  });
});

describe('pricingInputsHash', () => {
  it('is stable regardless of the order rules arrive in', () => {
    assert.equal(
      pricingInputsHash(template.rules),
      pricingInputsHash([...template.rules].reverse()),
    );
  });

  it('changes when a rate changes, which is what raises the stale banner', () => {
    const changed = template.rules.map((r) => (r.code === 'panel_base' ? { ...r, rate: 43 } : r));
    assert.notEqual(pricingInputsHash(template.rules), pricingInputsHash(changed));
  });

  it('changes when a condition changes', () => {
    const changed = template.rules.map((r) =>
      r.code === 'volume_discount_50'
        ? { ...r, condition: { group: '__qty', op: '>=' as const, value: 25 } }
        : r,
    );
    assert.notEqual(pricingInputsHash(template.rules), pricingInputsHash(changed));
  });
});

function rule(
  code: string,
  stage: PricingRuleDef['stage'],
  priority: number,
  basis: PricingRuleDef['basis'],
  extra: Partial<PricingRuleDef>,
): PricingRuleDef {
  return {
    id: `r-${code}`,
    code,
    condition: null,
    stage,
    priority,
    basis,
    quantityCode: null,
    applyPer: 'unit',
    amount: null,
    rate: null,
    currency: 'USD',
    ...extra,
  };
}

function round2(value: number): number {
  return Math.round(value * 100 + Number.EPSILON) / 100;
}
