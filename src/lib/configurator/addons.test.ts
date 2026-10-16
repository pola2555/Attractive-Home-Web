import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addonOffered, addonsForSelection, pathNodeIds, priceAddons } from './addons';
import type { AddonDef, PriceTreeNodeDef, Selection } from './types';

// The aluminium door's base, trimmed to what the add-ons hang on:
//   thickness 40/45/55 -> edge pur/alu_silent -> board
// with real node ids so an add-on can attach to a specific branch.
function base(): PriceTreeNodeDef[] {
  return [
    { id: 't40', parentId: null, groupCode: 'thickness', valueCode: '40', amount: null, sortOrder: 0 },
    { id: 't45', parentId: null, groupCode: 'thickness', valueCode: '45', amount: null, sortOrder: 1 },
    { id: 't55', parentId: null, groupCode: 'thickness', valueCode: '55', amount: null, sortOrder: 2 },
    { id: 'e45p', parentId: 't45', groupCode: 'edge', valueCode: 'pur', amount: null, sortOrder: 0 },
    { id: 'e45a', parentId: 't45', groupCode: 'edge', valueCode: 'alu_silent', amount: null, sortOrder: 1 },
    { id: 'b45aw', parentId: 'e45a', groupCode: 'board', valueCode: 'wpc', amount: 90, sortOrder: 0 },
  ];
}

function sel(obj: Record<string, string>): Selection {
  const out: Selection = {};
  for (const [groupCode, code] of Object.entries(obj)) {
    out[groupCode] = { groupCode, valueCodes: [code], valueIds: [], numericValue: null };
  }
  return out;
}

const allSameColour: AddonDef = {
  id: 'a_same',
  name: 'All same colour',
  amount: 30,
  priceUnit: null,
  colorHex: null,
  attachBase: true,
  attachedBaseNodeIds: [],
  nodes: [],
  sortOrder: 0,
};

// Attached to the 45 and 55 branches only (the Excel's "flat outside").
const flatOutside: AddonDef = {
  id: 'a_flat',
  name: 'Flat outside, inward opening',
  amount: 15,
  priceUnit: null,
  colorHex: null,
  attachBase: false,
  attachedBaseNodeIds: ['t45', 't55'],
  nodes: [],
  sortOrder: 1,
};

// An option-tree add-on: one sub-question (hinge finish) priced by its leaves.
const sideHinges: AddonDef = {
  id: 'a_hinge',
  name: 'Side concealed hinges',
  amount: null,
  priceUnit: 'per_unit',
  colorHex: null,
  attachBase: true,
  attachedBaseNodeIds: [],
  nodes: [
    { id: 'h_std', parentId: null, groupCode: 'hinge_finish', valueCode: 'std', amount: 7, sortOrder: 0 },
    { id: 'h_col', parentId: null, groupCode: 'hinge_finish', valueCode: 'color', amount: 11, sortOrder: 1 },
  ],
  sortOrder: 2,
};

const addons = [allSameColour, flatOutside, sideHinges];

describe('add-on availability from the canvas', () => {
  it('a path collects the nodes the selection descends through', () => {
    const ids = pathNodeIds(base(), sel({ thickness: '45', edge: 'alu_silent', board: 'wpc' }));
    assert.deepEqual([...ids].sort(), ['b45aw', 'e45a', 't45']);
  });

  it('an attach-base add-on is offered even before anything is chosen', () => {
    assert.equal(addonOffered(allSameColour, pathNodeIds(base(), {})), true);
  });

  it('a branch add-on is offered only on the branches it hangs on', () => {
    assert.equal(addonOffered(flatOutside, pathNodeIds(base(), sel({ thickness: '45' }))), true);
    assert.equal(addonOffered(flatOutside, pathNodeIds(base(), sel({ thickness: '40' }))), false);
  });

  it('lists exactly the offered add-ons for a selection', () => {
    const on45 = addonsForSelection(addons, base(), sel({ thickness: '45' })).map((a) => a.id);
    assert.deepEqual(on45, ['a_same', 'a_flat', 'a_hinge']);
    const on40 = addonsForSelection(addons, base(), sel({ thickness: '40' })).map((a) => a.id);
    assert.deepEqual(on40, ['a_same', 'a_hinge']); // flat-outside not offered on 40
  });
});

describe('add-on pricing from the canvas', () => {
  it('prices a flat add-on once, regardless of quantity', () => {
    const r = priceAddons(addons, { a_same: 5 }, base(), sel({ thickness: '45' }), 'USD');
    assert.equal(r.total, 30);
    assert.equal(r.lines[0].quantity, 1);
    assert.equal(r.issues.length, 0);
  });

  it('refuses to charge an add-on the branch does not offer', () => {
    const r = priceAddons(addons, { a_flat: 1 }, base(), sel({ thickness: '40' }), 'USD');
    assert.equal(r.total, 0);
    assert.equal(r.lines.length, 0);
    assert.match(r.issues[0], /not available/);
  });

  it('prices an option-tree add-on from its chosen leaf, times the quantity', () => {
    const std = priceAddons(addons, { a_hinge: 3 }, base(), sel({ thickness: '45', hinge_finish: 'std' }), 'USD');
    assert.equal(std.total, 21); // 7 x 3
    const col = priceAddons(addons, { a_hinge: 2 }, base(), sel({ thickness: '45', hinge_finish: 'color' }), 'USD');
    assert.equal(col.total, 22); // 11 x 2
  });

  it('flags a tree add-on whose sub-question is unanswered', () => {
    const r = priceAddons(addons, { a_hinge: 1 }, base(), sel({ thickness: '45' }), 'USD');
    assert.equal(r.lines.length, 0);
    assert.match(r.issues[0], /needs a choice/);
  });

  it('sums several add-ons', () => {
    const r = priceAddons(
      addons,
      { a_same: 1, a_flat: 1, a_hinge: 1 },
      base(),
      sel({ thickness: '45', hinge_finish: 'std' }),
      'USD',
    );
    assert.equal(r.total, 52); // 30 + 15 + 7
    assert.equal(r.lines.length, 3);
  });
});
