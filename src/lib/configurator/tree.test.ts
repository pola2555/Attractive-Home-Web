import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lookupPriceTree } from './tree';
import { priceProduct, withVariant } from './product';
import type { PriceTreeNodeDef, Selection, TemplateDef } from './types';

// The aluminium door's base, as a decision tree:
//   Thickness 40/45/55 -> Material alu/pur (priced) -> Colour (just a choice)
// The colour under a material carries no price — it only picks a look; the price
// sits on the material and the colour inherits it. Two real irregularities a
// grid cannot express cleanly: 55 mm offers ONLY aluminium, and PUR offers fewer
// colours than aluminium. A branch that is simply not offered is left out.
let auto = 0;
function node(
  parentId: string | null,
  groupCode: string,
  valueCode: string,
  amount: number | null = null,
): PriceTreeNodeDef {
  return { id: `n${auto++}`, parentId, groupCode, valueCode, amount, sortOrder: 0 };
}

function buildTree(): PriceTreeNodeDef[] {
  const nodes: PriceTreeNodeDef[] = [];
  const push = <T extends PriceTreeNodeDef>(n: T) => {
    nodes.push(n);
    return n;
  };
  for (const t of ['40', '45']) {
    const thick = push(node(null, 'thickness', t)); // just a choice, no price
    const alu = push(node(thick.id, 'material', 'alu', t === '40' ? 80 : 90)); // price sits here
    push(node(alu.id, 'color', 'marsha')); // colours are choices → inherit the material price
    push(node(alu.id, 'color', 'milan'));
    push(node(alu.id, 'color', 'matte', t === '40' ? 85 : null)); // 40 mm matte overrides to 85
    const pur = push(node(thick.id, 'material', 'pur', t === '40' ? 65 : 75));
    push(node(pur.id, 'color', 'marsha')); // PUR offers only two colours
    push(node(pur.id, 'color', 'milan'));
  }
  // 55 mm: aluminium only, all colours at 100.
  const t55 = push(node(null, 'thickness', '55'));
  const alu55 = push(node(t55.id, 'material', 'alu', 100));
  for (const c of ['marsha', 'milan', 'matte']) push(node(alu55.id, 'color', c));
  return nodes;
}

function sel(map: Record<string, string>): Selection {
  const out: Selection = {};
  for (const [g, v] of Object.entries(map)) {
    out[g] = { groupCode: g, valueCodes: [v], numericValue: null };
  }
  return out;
}

describe('the base-price decision tree', () => {
  const nodes = buildTree();

  it('a colour is just a choice — the price is inherited from the material', () => {
    const r = lookupPriceTree(nodes, sel({ thickness: '40', material: 'alu', color: 'marsha' }), 'USD');
    assert.equal(r.state, 'sold');
    assert.equal(r.amount, 80);
    assert.equal(r.key, '40|alu|marsha');
  });

  it('a deeper declared price overrides the inherited one', () => {
    const r = lookupPriceTree(nodes, sel({ thickness: '40', material: 'alu', color: 'matte' }), 'USD');
    assert.equal(r.state, 'sold');
    assert.equal(r.amount, 85);
  });

  it('a null at a deeper node still inherits the price above it', () => {
    // 45 mm matte is left blank → it inherits the 45 mm aluminium price.
    const r = lookupPriceTree(nodes, sel({ thickness: '45', material: 'alu', color: 'matte' }), 'USD');
    assert.equal(r.state, 'sold');
    assert.equal(r.amount, 90);
  });

  it('reads a different branch to a different price', () => {
    const r = lookupPriceTree(nodes, sel({ thickness: '45', material: 'pur', color: 'milan' }), 'USD');
    assert.equal(r.state, 'sold');
    assert.equal(r.amount, 75);
  });

  it('treats a value a branch never offers as not sold', () => {
    // 55 mm has no PUR node, and PUR has no matte colour.
    assert.equal(lookupPriceTree(nodes, sel({ thickness: '55', material: 'pur' }), 'USD').state, 'not_sold');
    assert.equal(
      lookupPriceTree(nodes, sel({ thickness: '40', material: 'pur', color: 'matte' }), 'USD').state,
      'not_sold',
    );
  });

  it('lets branches ask to different depths — 55 still reaches its price', () => {
    const r = lookupPriceTree(nodes, sel({ thickness: '55', material: 'alu', color: 'matte' }), 'USD');
    assert.equal(r.state, 'sold');
    assert.equal(r.amount, 100);
  });

  it('is incomplete, naming the next question, until the branch is answered', () => {
    const r0 = lookupPriceTree(nodes, sel({}), 'USD');
    assert.equal(r0.state, 'incomplete');
    assert.deepEqual(r0.missingAxes, ['thickness']);

    const r1 = lookupPriceTree(nodes, sel({ thickness: '40' }), 'USD');
    assert.equal(r1.state, 'incomplete');
    assert.deepEqual(r1.missingAxes, ['material']);

    const r2 = lookupPriceTree(nodes, sel({ thickness: '40', material: 'alu' }), 'USD');
    assert.equal(r2.state, 'incomplete');
    assert.deepEqual(r2.missingAxes, ['color']);
  });

  it('a fully-chosen path that was never priced is not_entered', () => {
    const unpriced: PriceTreeNodeDef[] = [];
    const thick = unpriced[unpriced.push(node(null, 'thickness', '40')) - 1];
    unpriced.push(node(thick.id, 'material', 'alu')); // leaf, no price anywhere
    const r = lookupPriceTree(unpriced, sel({ thickness: '40', material: 'alu' }), 'USD');
    assert.equal(r.state, 'not_entered');
    assert.equal(r.amount, null);
  });

  it('an empty tree reports no_grid, so the caller can fall back', () => {
    assert.equal(lookupPriceTree([], sel({}), 'USD').state, 'no_grid');
  });

  it('prices a whole product from the tree, base seeded into the base stage', () => {
    const template: TemplateDef = {
      id: 't',
      code: 't',
      name: 'Door',
      currency: 'USD',
      hsCodeId: null,
      options: [],
      constraints: [],
      derivedQuantities: [],
      rules: [],
      variants: [
        {
          id: 'v1',
          code: 'v1',
          name: 'Aluminium',
          includedSpec: null,
          imageUrl: null,
          sortOrder: 0,
          grid: null,
          priceTree: nodes,
        },
      ],
    };
    const selection = withVariant(
      sel({ thickness: '40', material: 'alu', color: 'marsha' }),
      'v1',
    );
    const priced = priceProduct({ template, selection });
    assert.equal(priced.grid.state, 'sold');
    assert.equal(priced.unitCost, 80);
    assert.equal(priced.isPriceable, true);
    assert.equal(priced.currency, 'USD');
  });
});
