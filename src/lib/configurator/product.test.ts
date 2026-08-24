import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  aluDoorSelection,
  benisonTemplate,
  withColourRestriction,
  woodDoorSelection,
} from './benison.test-support';
import { cellKey, enumerateCells, gridCompleteness, lookupGrid } from './grid';
import { priceProduct, withVariant } from './product';
import { cascadeSelection, optionsForVariant, resolveConfiguration } from './resolve';
import { bandMatches, resolveBands, tierFor } from './upgrades';
import type { Selection } from './types';

// Every expected figure here is a cell from the supplier's published list, so
// these tests fail if the engine drifts OR if somebody edits the transcription.

describe('the price grid', () => {
  test('reads a published cell', () => {
    const result = priceProduct({
      template: benisonTemplate(),
      selection: aluDoorSelection(),
    });
    assert.equal(result.grid.state, 'sold');
    assert.equal(result.grid.amount, 90);
    assert.equal(result.unitCost, 90);
    assert.equal(result.currency, 'USD');
  });

  test('distinguishes "not sold" from "not entered"', () => {
    const template = benisonTemplate();
    const grid = template.variants![0].grid!;

    // 40 mm + PUR + WPC is stored as an explicit null: the dash in the sheet.
    const notSold = lookupGrid(grid, {
      thickness: { groupCode: 'thickness', valueCodes: ['40'], numericValue: 40 },
      edge_banding: { groupCode: 'edge_banding', valueCodes: ['pur'], numericValue: null },
      board_material: { groupCode: 'board_material', valueCodes: ['wpc'], numericValue: null },
    });
    assert.equal(notSold.state, 'not_sold');

    // 55 mm + PUR has no row in the published list at all. Conflating the two
    // would report a hole in our own data as a supplier refusal.
    const notEntered = lookupGrid(grid, {
      thickness: { groupCode: 'thickness', valueCodes: ['55'], numericValue: 55 },
      edge_banding: { groupCode: 'edge_banding', valueCodes: ['pur'], numericValue: null },
      board_material: { groupCode: 'board_material', valueCodes: ['spc'], numericValue: null },
    });
    assert.equal(notEntered.state, 'not_entered');
  });

  test('reports which answers are still missing', () => {
    const result = lookupGrid(benisonTemplate().variants![0].grid!, {
      thickness: { groupCode: 'thickness', valueCodes: ['45'], numericValue: 45 },
    });
    assert.equal(result.state, 'incomplete');
    assert.deepEqual(result.missingAxes, ['edge_banding', 'board_material']);
  });

  test('a zero-priced cell is a price, not a miss', () => {
    const lookup = lookupGrid(
      { id: 'g', currency: 'USD', axes: ['a'], cells: { free: 0 } },
      { a: { groupCode: 'a', valueCodes: ['free'], numericValue: null } },
    );
    assert.equal(lookup.state, 'sold');
    assert.equal(lookup.amount, 0);
  });

  test('a cell named like an Object prototype key is not a function', () => {
    // `cells['constructor']` on a plain object literal resolves through the
    // prototype chain to a real function, which a truthiness check would
    // happily treat as a price.
    const lookup = lookupGrid(
      { id: 'g', currency: 'USD', axes: ['a'], cells: {} },
      { a: { groupCode: 'a', valueCodes: ['constructor'], numericValue: null } },
    );
    assert.equal(lookup.state, 'not_entered');
    assert.equal(lookup.amount, null);
  });

  test('a NaN price is refused rather than quoted', () => {
    const lookup = lookupGrid(
      { id: 'g', currency: 'USD', axes: ['a'], cells: { x: Number.NaN } },
      { a: { groupCode: 'a', valueCodes: ['x'], numericValue: null } },
    );
    assert.equal(lookup.state, 'not_entered');
  });

  test('the key is built in axis order, not selection order', () => {
    const axes = ['thickness', 'edge_banding', 'board_material'];
    const forwards: Selection = {
      thickness: { groupCode: 'thickness', valueCodes: ['45'], numericValue: 45 },
      edge_banding: { groupCode: 'edge_banding', valueCodes: ['pur'], numericValue: null },
      board_material: { groupCode: 'board_material', valueCodes: ['spc'], numericValue: null },
    };
    const backwards: Selection = {
      board_material: forwards.board_material,
      edge_banding: forwards.edge_banding,
      thickness: forwards.thickness,
    };
    assert.equal(cellKey(axes, forwards), '45|pur|spc');
    assert.equal(cellKey(axes, backwards), '45|pur|spc');
  });

  test('counts what the editor still has to fill in', () => {
    const grid = benisonTemplate().variants![0].grid!;
    const stats = gridCompleteness(
      grid.axes,
      {
        thickness: ['40', '45', '55'],
        edge_banding: ['pur', 'alu_silent'],
        board_material: ['spc', 'wpc', 'fr'],
      },
      grid.cells,
    );
    // 3 thicknesses x 2 bandings x 3 boards. Of those: eleven carry a price,
    // four are the dashes in the PUR rows, and three are the 55 mm PUR cells
    // that have no row in the published list at all.
    assert.equal(stats.total, 18);
    assert.equal(stats.priced, 11);
    assert.equal(stats.notSold, 4);
    assert.equal(stats.notEntered, 3);
  });

  test('enumerates the full cartesian product for the editor grid', () => {
    const cells = enumerateCells(['a', 'b'], { a: ['1', '2'], b: ['x', 'y', 'z'] });
    assert.equal(cells.length, 6);
    assert.equal(cells[0].key, '1|x');
    assert.deepEqual(cells[0].coords, { a: '1', b: 'x' });
  });
});

describe('the variant fork', () => {
  test('each branch prices from its own grid', () => {
    const template = benisonTemplate();
    assert.equal(priceProduct({ template, selection: aluDoorSelection() }).unitCost, 90);
    assert.equal(priceProduct({ template, selection: woodDoorSelection() }).unitCost, 105);
  });

  test('a branch only shows its own questions', () => {
    const template = benisonTemplate();

    const alu = resolveConfiguration(template, aluDoorSelection());
    const aluGroups = alu.options.map((o) => o.groupCode);
    assert.ok(aluGroups.includes('thickness'));
    assert.ok(!aluGroups.includes('grade'));

    const wood = resolveConfiguration(template, woodDoorSelection());
    const woodGroups = wood.options.map((o) => o.groupCode);
    assert.ok(woodGroups.includes('grade'));
    assert.ok(!woodGroups.includes('thickness'));
  });

  test('the same question can carry different options per branch', () => {
    const template = benisonTemplate();

    const alu = resolveConfiguration(template, aluDoorSelection());
    const aluBoard = alu.options.find((o) => o.groupCode === 'board_material')!;
    assert.deepEqual(
      aluBoard.values.map((v) => v.code),
      ['spc', 'wpc', 'fr'],
    );

    const wood = resolveConfiguration(template, woodDoorSelection());
    const woodBoard = wood.options.find((o) => o.groupCode === 'board_material')!;
    assert.deepEqual(
      woodBoard.values.map((v) => v.code),
      ['fr'],
    );
  });

  test('a same-named upgrade can cost different amounts per branch', () => {
    // The proof the fork is real: +30 on aluminium, +15 on wood.
    const template = benisonTemplate();

    const alu = priceProduct({
      template,
      selection: aluDoorSelection(),
      picked: { same_color_alu: 1 },
    });
    const wood = priceProduct({
      template,
      selection: woodDoorSelection(),
      picked: { same_color_wood: 1 },
    });

    assert.equal(alu.unitCost, 120); // 90 + 30
    assert.equal(wood.unitCost, 120); // 105 + 15
    assert.equal(alu.upgradeLines[0].amount, 30);
    assert.equal(wood.upgradeLines[0].amount, 15);
  });

  test('an upgrade from the other branch is not offered', () => {
    const resolution = resolveConfiguration(benisonTemplate(), woodDoorSelection());
    const codes = resolution.upgrades.map((u) => u.code);
    assert.ok(codes.includes('same_color_wood'));
    assert.ok(!codes.includes('same_color_alu'));
    // Shared craftsmanship options appear on both.
    assert.ok(codes.includes('nano_agent'));
  });

  test('the cascade does not clear an answer the OTHER branch would reject', () => {
    // The regression this exists for: `board_material` is bound twice, with
    // three answers on the aluminium frame and one on the wood frame. An
    // unscoped cascade reached the wood binding, could not find "wpc" among
    // its answers, and silently wiped a perfectly valid aluminium selection —
    // leaving a required question blank with no explanation.
    const template = benisonTemplate();
    const after = cascadeSelection(template, aluDoorSelection());
    assert.deepEqual(after.board_material?.valueCodes, ['wpc']);
    assert.equal(priceProduct({ template, selection: after }).unitCost, 90);
  });

  test('a branch binding overrides a shared one for the same question', () => {
    const template = benisonTemplate();
    const options = optionsForVariant(template, 'wood');
    const boards = options.filter((o) => o.groupCode === 'board_material');
    assert.equal(boards.length, 1, 'one control per question, never two');
    assert.equal(boards[0].variantCode, 'wood');
  });

  test('no variant chosen is an incomplete configuration, not an error', () => {
    const resolution = resolveConfiguration(benisonTemplate(), {});
    assert.equal(resolution.variantCode, null);
    assert.ok(resolution.issues.some((i) => i.message.includes('base variant')));
    assert.equal(resolution.isComplete, false);
  });
});

describe('upgrade conditions', () => {
  test('an upgrade is withheld when its condition fails', () => {
    const template = benisonTemplate();
    const selection = withVariant(
      {
        thickness: { groupCode: 'thickness', valueCodes: ['40'], numericValue: 40 },
        edge_banding: { groupCode: 'edge_banding', valueCodes: ['alu_silent'], numericValue: null },
        board_material: { groupCode: 'board_material', valueCodes: ['spc'], numericValue: null },
      },
      'alu_wpc',
    );

    const resolution = resolveConfiguration(template, selection);
    const flat = resolution.upgrades.find((u) => u.code === 'flat_outside')!;
    assert.equal(flat.availability, 'no');
    // Still on screen, with a reason — hiding it sends a salesperson hunting.
    assert.equal(flat.unavailableNote, 'Only available on 45 mm and 55 mm');
  });

  test('the same upgrade is offered at 45 mm', () => {
    const resolution = resolveConfiguration(benisonTemplate(), aluDoorSelection());
    const flat = resolution.upgrades.find((u) => u.code === 'flat_outside')!;
    assert.equal(flat.availability, 'yes');
  });

  test('an unavailable upgrade is not charged even if it arrives ticked', () => {
    // A stale form post, or a re-price after the rules were edited.
    const selection = withVariant(
      {
        thickness: { groupCode: 'thickness', valueCodes: ['40'], numericValue: 40 },
        edge_banding: { groupCode: 'edge_banding', valueCodes: ['alu_silent'], numericValue: null },
        board_material: { groupCode: 'board_material', valueCodes: ['spc'], numericValue: null },
      },
      'alu_wpc',
    );
    const result = priceProduct({
      template: benisonTemplate(),
      selection,
      picked: { flat_outside: 1 },
    });
    assert.equal(result.unitCost, 80); // the base alone, not 95
    assert.ok(result.issues.some((i) => i.includes('no longer available')));
  });
});

describe('upgrade units', () => {
  test('per-unit multiplies by the chosen quantity', () => {
    const result = priceProduct({
      template: benisonTemplate(),
      selection: aluDoorSelection(),
      picked: { side_hinge_std: 3 },
    });
    assert.equal(result.upgradeLines[0].amount, 21); // 7 x 3
    assert.equal(result.unitCost, 111); // 90 + 21
  });

  test('flat ignores the quantity box entirely', () => {
    const result = priceProduct({
      template: benisonTemplate(),
      selection: aluDoorSelection(),
      picked: { same_color_alu: 5 },
    });
    assert.equal(result.upgradeLines[0].amount, 30);
  });

  test('per square metre uses a derived quantity', () => {
    const selection: Selection = {
      ...aluDoorSelection(),
      width: { groupCode: 'width', valueCodes: [], numericValue: 900 },
      height: { groupCode: 'height', valueCodes: [], numericValue: 2000 },
    };
    const result = priceProduct({
      template: benisonTemplate(),
      selection,
      picked: { wallpanel_alu: 1 },
    });
    const line = result.upgradeLines.find((l) => l.code === 'wallpanel_alu')!;
    assert.equal(line.quantityValue, 1.8); // 900 x 2000 / 1e6
    assert.equal(line.amount, 61.2); // 34 x 1.8
  });

  test('per square metre refuses rather than charging zero', () => {
    // Without width and height the area cannot be computed. Charging 0 for a
    // wall panel is a wrong answer that looks like a right one.
    const result = priceProduct({
      template: benisonTemplate(),
      selection: aluDoorSelection(),
      picked: { wallpanel_alu: 1 },
    });
    assert.equal(result.upgradeLines.length, 0);
    assert.ok(result.issues.some((i) => i.includes('area_m2')));
  });

  test('quantity breaks pick the highest tier at or below the quantity', () => {
    const tiers = [
      { minQty: 1, unitAmount: 30 },
      { minQty: 100, unitAmount: 15 },
      { minQty: 200, unitAmount: 10 },
    ];
    assert.equal(tierFor(tiers, 1)!.unitAmount, 30);
    assert.equal(tierFor(tiers, 99)!.unitAmount, 30);
    assert.equal(tierFor(tiers, 100)!.unitAmount, 15);
    assert.equal(tierFor(tiers, 150)!.unitAmount, 15); // not interpolated
    assert.equal(tierFor(tiers, 250)!.unitAmount, 10);
  });

  test('a tiered accessory is priced at its tier', () => {
    const result = priceProduct({
      template: benisonTemplate(),
      selection: aluDoorSelection(),
      picked: { pamphlet: 100 },
    });
    const line = result.upgradeLines.find((l) => l.code === 'pamphlet')!;
    assert.equal(line.unitAmount, 15);
    assert.equal(line.amount, 1500);
  });
});

describe('size bands', () => {
  test('a measurement inside a band adds its step', () => {
    const selection: Selection = {
      ...aluDoorSelection(),
      height: { groupCode: 'height', valueCodes: [], numericValue: 2200 },
    };
    const result = priceProduct({ template: benisonTemplate(), selection });
    assert.equal(result.bandLines.length, 1);
    assert.equal(result.bandLines[0].amount, 12);
    assert.equal(result.unitCost, 102); // 90 + 12
  });

  test('bands are half-open, so an exact boundary lands in one band only', () => {
    // The published list overlaps at 1050: width 950-1050 and 1050-1220 both
    // claim it. Charging both would bill the width twice.
    const selection: Selection = {
      ...aluDoorSelection(),
      width: { groupCode: 'width', valueCodes: [], numericValue: 1050 },
    };
    const result = priceProduct({ template: benisonTemplate(), selection });
    assert.equal(result.bandLines.length, 1);
    assert.equal(result.bandLines[0].code, 'w_1050');
    assert.equal(result.bandLines[0].amount, 23);
  });

  test('at most one band applies per measurement', () => {
    const bands = benisonTemplate().bands!;
    const selection: Selection = {
      width: { groupCode: 'width', valueCodes: [], numericValue: 1000 },
      height: { groupCode: 'height', valueCodes: [], numericValue: 2200 },
    };
    const result = resolveBands(bands, selection);
    assert.equal(result.lines.length, 2); // one per measurement, not four
    assert.equal(result.total, 24);
  });

  test('a gap in the published bands is reported, never charged as zero', () => {
    // 2240-2440 mm is uncovered in the supplier's own list. Quoting nothing
    // for it would be a guess at the customer's expense.
    const selection: Selection = {
      ...aluDoorSelection(),
      height: { groupCode: 'height', valueCodes: [], numericValue: 2300 },
    };
    const result = priceProduct({ template: benisonTemplate(), selection });
    assert.deepEqual(result.unbanded, ['height']);
    assert.ok(result.issues.some((i) => i.includes('No size band covers')));
    assert.equal(result.unitCost, 90); // unchanged, and flagged
  });

  test('bandMatches handles open ends', () => {
    const open = {
      id: 'b',
      code: 'open',
      label: 'above 2440',
      groupCode: 'height',
      variantCode: null,
      min: 2440,
      max: null,
      amount: 23,
      sortOrder: 0,
    };
    assert.equal(bandMatches(open, 3000), true);
    assert.equal(bandMatches(open, 2440), true);
    assert.equal(bandMatches(open, 2000), false);
    // A measurement that never resolved must not match a band by accident.
    assert.equal(bandMatches(open, Number.NaN), false);
  });
});

describe('upgrade effects', () => {
  test('an upgrade can restrict another question', () => {
    const template = withColourRestriction(benisonTemplate());
    const before = resolveConfiguration(template, aluDoorSelection(), 1, {});
    const colourBefore = before.options.find((o) => o.groupCode === 'door_color')!;
    assert.equal(colourBefore.values.filter((v) => v.availability === 'yes').length, 7);

    const after = resolveConfiguration(template, aluDoorSelection(), 1, { w_1050_upgrade: 1 });
    const colourAfter = after.options.find((o) => o.groupCode === 'door_color')!;
    assert.equal(colourAfter.values.filter((v) => v.availability === 'yes').length, 5);
    assert.equal(colourAfter.values.find((v) => v.code === 'marsha_grey')!.availability, 'no');
  });

  test('choosing a now-restricted colour explains which upgrade did it', () => {
    const template = withColourRestriction(benisonTemplate());
    const selection: Selection = {
      ...aluDoorSelection(),
      door_color: { groupCode: 'door_color', valueCodes: ['marsha_grey'], numericValue: null },
    };
    const resolution = resolveConfiguration(template, selection, 1, { w_1050_upgrade: 1 });
    assert.ok(
      resolution.issues.some((i) => i.message === 'A door this wide is only made in five colours.'),
    );
  });
});

describe('the whole build-up', () => {
  test('a real quote, checkable against the supplier sheet', () => {
    // 45 mm, aluminium silent banding, WPC board, four upgrades, 950-1050 wide.
    //   base                              90.00
    //   all same colour                  +30.00
    //   flat outside, inward opening     +15.00
    //   side concealed hinges 7 x 3      +21.00
    //   width band 950-1050              +12.00
    //                                   =168.00
    const selection: Selection = {
      ...aluDoorSelection(),
      width: { groupCode: 'width', valueCodes: [], numericValue: 1000 },
    };
    const result = priceProduct({
      template: benisonTemplate(),
      selection,
      picked: { same_color_alu: 1, flat_outside: 1, side_hinge_std: 3 },
    });

    assert.equal(result.grid.amount, 90);
    assert.equal(result.unitCost, 168);
    assert.equal(result.isPriceable, true);
    assert.deepEqual(result.issues, []);
  });

  test('margin is taken on the upgrades, not only on the base', () => {
    // Upgrades sit in the adder stage precisely so a later percentage sees
    // them. Adding them after the margin stage would sell them at cost.
    const template = benisonTemplate();
    const withMargin = {
      ...template,
      rules: [
        {
          id: 'r-margin',
          code: 'margin',
          condition: null,
          stage: 'margin' as const,
          priority: 10,
          basis: 'percent' as const,
          quantityCode: null,
          applyPer: 'unit' as const,
          amount: null,
          rate: 32,
          currency: null,
        },
      ],
    };

    const result = priceProduct({
      template: withMargin,
      selection: aluDoorSelection(),
      picked: { same_color_alu: 1 },
    });
    // (90 + 30) x 1.32 = 158.40, not 90 x 1.32 + 30 = 148.80
    assert.equal(result.unitCost, 158.4);
  });

  test('a template with no grid at all is still priceable', () => {
    // Every template that predates grids prices purely from its rules. Reading
    // "no grid" as "no price" would make all of them permanently unquotable —
    // which is exactly what it did until the older browser specs caught it.
    const template = benisonTemplate();
    const gridless = {
      ...template,
      variants: [],
      rules: [
        {
          id: 'r-base',
          code: 'flat_base',
          condition: null,
          stage: 'base' as const,
          priority: 10,
          basis: 'flat' as const,
          quantityCode: null,
          applyPer: 'unit' as const,
          amount: 250,
          rate: null,
          currency: 'USD',
        },
      ],
    };
    const result = priceProduct({ template: gridless, selection: {} });
    assert.equal(result.grid.state, 'no_grid');
    assert.equal(result.isPriceable, true);
    assert.equal(result.unitCost, 250);
  });

  test('an unsold combination refuses to produce a price', () => {
    const selection = withVariant(
      {
        thickness: { groupCode: 'thickness', valueCodes: ['40'], numericValue: 40 },
        edge_banding: { groupCode: 'edge_banding', valueCodes: ['pur'], numericValue: null },
        board_material: { groupCode: 'board_material', valueCodes: ['wpc'], numericValue: null },
      },
      'alu_wpc',
    );
    const result = priceProduct({ template: benisonTemplate(), selection });
    assert.equal(result.isPriceable, false);
    assert.equal(result.unitCost, 0);
    assert.ok(result.issues.some((i) => i.includes('not sold')));
  });

  test('quantity multiplies the unit, and line charges stay flat', () => {
    const result = priceProduct({
      template: benisonTemplate(),
      selection: aluDoorSelection(),
      quantity: 12,
    });
    assert.equal(result.unitCost, 90);
    assert.equal(result.lineTotal, 1080);
  });
});
