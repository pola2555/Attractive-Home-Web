import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  lookupPriceTree,
  treeSelectedImages,
  treeOptionAvailability,
  multiSelectGroupCodes,
} from './tree';
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

// A selection where a level may hold several picked values (a multi-select level).
function selMulti(map: Record<string, string[]>): Selection {
  const out: Selection = {};
  for (const [g, codes] of Object.entries(map)) {
    out[g] = { groupCode: g, valueCodes: codes, numericValue: null };
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

describe('images along the chosen path', () => {
  // thickness (image) -> material (alu has an image, pur has none) -> colour.
  function imgTree(): PriceTreeNodeDef[] {
    const nodes: PriceTreeNodeDef[] = [];
    const thick = { ...node(null, 'thickness', '40'), images: ['t.jpg'] };
    nodes.push(thick);
    const alu = { ...node(thick.id, 'material', 'alu', 80), images: ['alu-1.jpg', 'alu-2.jpg'] };
    nodes.push(alu);
    nodes.push(node(alu.id, 'color', 'marsha')); // no images on the colour
    const pur = node(thick.id, 'material', 'pur', 65); // no images on pur
    nodes.push(pur);
    return nodes;
  }
  const nodes = imgTree();

  it('maps each answered level to the chosen node’s images', () => {
    const r = treeSelectedImages(nodes, sel({ thickness: '40', material: 'alu', color: 'marsha' }));
    assert.deepEqual(r.get('thickness'), ['t.jpg']);
    assert.deepEqual(r.get('material'), ['alu-1.jpg', 'alu-2.jpg']);
    // The colour carries no images, so it gets no entry rather than an empty one.
    assert.equal(r.has('color'), false);
  });

  it('only reaches as far as the selection goes', () => {
    const r = treeSelectedImages(nodes, sel({ thickness: '40' }));
    assert.deepEqual(r.get('thickness'), ['t.jpg']);
    assert.equal(r.has('material'), false);
  });

  it('a chosen node with no images contributes nothing', () => {
    const r = treeSelectedImages(nodes, sel({ thickness: '40', material: 'pur' }));
    assert.deepEqual(r.get('thickness'), ['t.jpg']);
    assert.equal(r.has('material'), false);
  });

  it('an empty tree yields an empty map', () => {
    assert.equal(treeSelectedImages([], sel({})).size, 0);
  });
});

describe('multi-select levels sum their picked branches', () => {
  // A root MULTI level of independently-priced modules (each a priced leaf).
  const modules: PriceTreeNodeDef[] = [
    { ...node(null, 'module', 'shoe', 90), multiSelect: true },
    { ...node(null, 'module', 'drawer', 140), multiSelect: true },
    { ...node(null, 'module', 'glass', 180), multiSelect: true },
  ];

  it('sums the price of every picked module', () => {
    const r = lookupPriceTree(modules, selMulti({ module: ['shoe', 'drawer'] }), 'USD');
    assert.equal(r.state, 'sold');
    assert.equal(r.amount, 230);
  });

  it('one pick on a multi level is just that price', () => {
    const r = lookupPriceTree(modules, selMulti({ module: ['glass'] }), 'USD');
    assert.equal(r.state, 'sold');
    assert.equal(r.amount, 180);
  });

  it('nothing picked is incomplete, naming the level', () => {
    const r = lookupPriceTree(modules, selMulti({ module: [] }), 'USD');
    assert.equal(r.state, 'incomplete');
    assert.deepEqual(r.missingAxes, ['module']);
  });

  it('a value the level never offers is not sold', () => {
    const r = lookupPriceTree(modules, selMulti({ module: ['shoe', 'nope'] }), 'USD');
    assert.equal(r.state, 'not_sold');
  });

  it('multiSelectGroupCodes names the multi levels and nothing else', () => {
    assert.deepEqual([...multiSelectGroupCodes(modules)], ['module']);
    assert.equal(multiSelectGroupCodes(buildTree()).size, 0);
  });

  // A root MULTI level whose branches continue to a SHARED next question: each
  // picked branch is priced down the shared answer and the totals are summed.
  function nestedTree(): PriceTreeNodeDef[] {
    const nodes: PriceTreeNodeDef[] = [];
    const ply = { ...node(null, 'material', 'ply'), multiSelect: true };
    const walnut = { ...node(null, 'material', 'walnut'), multiSelect: true };
    nodes.push(ply, walnut);
    nodes.push(node(ply.id, 'tiers', 't3', 100), node(ply.id, 'tiers', 't5', 130));
    nodes.push(node(walnut.id, 'tiers', 't3', 200), node(walnut.id, 'tiers', 't5', 260));
    return nodes;
  }
  const nested = nestedTree();

  it('sums each picked branch down the shared follow-up answer', () => {
    const r = lookupPriceTree(nested, selMulti({ material: ['ply', 'walnut'], tiers: ['t5'] }), 'USD');
    assert.equal(r.state, 'sold');
    assert.equal(r.amount, 390); // 130 + 260
  });

  it('offers a shared follow-up only where every picked branch allows it', () => {
    // ply offers {t3,t5}; a walnut with only {t3} would intersect to {t3}.
    const partial: PriceTreeNodeDef[] = [
      { ...node(null, 'material', 'ply'), multiSelect: true },
      { ...node(null, 'material', 'oak'), multiSelect: true },
    ];
    const plyId = partial[0].id;
    const oakId = partial[1].id;
    partial.push(node(plyId, 'tiers', 't3', 100), node(plyId, 'tiers', 't5', 130));
    partial.push(node(oakId, 'tiers', 't3', 150)); // oak has no t5
    const avail = treeOptionAvailability(partial, selMulti({ material: ['ply', 'oak'] }));
    const tiers = avail.get('tiers');
    assert.ok(tiers instanceof Set);
    assert.deepEqual([...(tiers as Set<string>)].sort(), ['t3']);
  });
});
