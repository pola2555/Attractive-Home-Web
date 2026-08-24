import type {
  BandDef,
  OptionDef,
  OptionValueDef,
  Selection,
  TemplateDef,
  UpgradeDef,
  VariantDef,
} from './types';

// The Benison wholesale price list, transcribed as a plain object.
//
// This is a GOLDEN SAMPLE, not an invented fixture: every figure below is a
// cell from the supplier's own workbook. If the engine ever stops reproducing
// these numbers, either the engine broke or the price list changed, and both
// are things somebody needs to be told about.
//
// Source: ATTRACTIVE HOME PRICE LIST BENISON.xlsx, sheets "Basic Price" and
// "Additional Accessories".

function value(code: string, name: string, extra: Partial<OptionValueDef> = {}): OptionValueDef {
  return {
    id: `v-${code}`,
    code,
    name,
    numericValue: null,
    attributes: null,
    colorHex: null,
    productId: null,
    sortOrder: 0,
    condition: null,
    ...extra,
  };
}

function option(
  groupCode: string,
  name: string,
  sortOrder: number,
  extra: Partial<OptionDef> = {},
): OptionDef {
  return {
    id: `o-${groupCode}-${extra.variantCode ?? 'all'}`,
    groupCode,
    name,
    helpText: null,
    inputKind: 'select',
    unit: null,
    sortOrder,
    isRequired: true,
    defaultValueCode: null,
    condition: null,
    ranges: [],
    values: [],
    variantCode: null,
    ...extra,
  };
}

function upgrade(
  code: string,
  label: string,
  amount: number,
  extra: Partial<UpgradeDef> = {},
): UpgradeDef {
  return {
    id: `u-${code}`,
    code,
    label,
    detail: null,
    section: null,
    kind: 'upgrade',
    variantCode: null,
    amount,
    unit: 'flat',
    quantityCode: null,
    defaultQty: 1,
    minQty: 1,
    maxQty: null,
    productId: null,
    condition: null,
    unavailableNote: null,
    tiers: [],
    effects: [],
    sortOrder: 0,
    ...extra,
  };
}

function band(
  code: string,
  label: string,
  groupCode: string,
  min: number | null,
  max: number | null,
  amount: number,
  sortOrder: number,
): BandDef {
  return {
    id: `b-${code}`,
    code,
    label,
    groupCode,
    variantCode: 'alu_wpc',
    min,
    max,
    amount,
    sortOrder,
  };
}

// ---------------------------------------------------------------------------
// Variants and their grids
// ---------------------------------------------------------------------------

const aluVariant: VariantDef = {
  id: 'var-alu',
  code: 'alu_wpc',
  name: 'Aluminum Frame + WPC Connecting Board',
  includedSpec: 'Frame + 1 lock + 3x 2D hinges, wood keel + graphite board',
  imageUrl: null,
  sortOrder: 1,
  grid: {
    id: 'grid-alu',
    currency: 'USD',
    axes: ['thickness', 'edge_banding', 'board_material'],
    cells: {
      // 40 mm — PUR is sold in SPC only.
      '40|pur|spc': 65,
      '40|pur|wpc': null,
      '40|pur|fr': null,
      '40|alu_silent|spc': 80,
      '40|alu_silent|wpc': 80,
      '40|alu_silent|fr': 80,
      // 45 mm — same shape, ten dollars up.
      '45|pur|spc': 75,
      '45|pur|wpc': null,
      '45|pur|fr': null,
      '45|alu_silent|spc': 90,
      '45|alu_silent|wpc': 90,
      '45|alu_silent|fr': 90,
      // 55 mm — no PUR row exists in the published list at all, so those three
      // cells are deliberately ABSENT rather than null. That distinction is
      // the open question raised with the client.
      '55|alu_silent|spc': 100,
      '55|alu_silent|wpc': 100,
      '55|alu_silent|fr': 100,
    },
  },
};

const woodVariant: VariantDef = {
  id: 'var-wood',
  code: 'wood',
  name: 'Wood Frame',
  includedSpec: null,
  imageUrl: null,
  sortOrder: 2,
  grid: {
    id: 'grid-wood',
    currency: 'USD',
    axes: ['grade', 'edge_banding', 'board_material'],
    cells: {
      'std|pur|fr': 75,
      'std|alu_silent|fr': 90,
      'hc|pur|fr': 90,
      'hc|alu_silent|fr': 105,
    },
  },
};

export function benisonTemplate(): TemplateDef {
  return {
    id: 'tpl-benison',
    code: 'benison_door',
    name: 'Benison Interior Door',
    currency: 'USD',
    hsCodeId: null,
    standardNote: 'Standard opening 2170 x 950 x 300 mm',
    variants: [aluVariant, woodVariant],

    options: [
      // Branch-specific: the aluminium frame is sold by thickness, the wood
      // frame by grade. Neither question exists on the other branch.
      option('thickness', 'Thickness', 1, {
        variantCode: 'alu_wpc',
        configText: 'Frame + 1 lock + 3x 2D hinges, wood keel + graphite board',
        values: [
          value('40', '40 mm', { numericValue: 40, sortOrder: 1 }),
          value('45', '45 mm', { numericValue: 45, sortOrder: 2 }),
          value('55', '55 mm', { numericValue: 55, sortOrder: 3 }),
        ],
      }),
      option('grade', 'Grade', 1, {
        variantCode: 'wood',
        values: [
          value('std', '45 mm Standard', {
            sortOrder: 1,
            configText: 'Frame + 1 lock + 3x flush hinges, grid structural core board + wood keel',
          }),
          value('hc', '45 mm Haute Couture', {
            sortOrder: 2,
            configText: 'Frame + 1 lock + 3x 3D hinges, wood keel + graphite homogeneous board',
          }),
        ],
      }),

      // Shared: both branches offer the same two edge bandings, so the
      // question is bound once with no variant.
      option('edge_banding', 'Edge banding', 2, {
        values: [
          value('pur', 'PUR edge banding', { sortOrder: 1 }),
          value('alu_silent', 'Aluminum silent edge banding', { sortOrder: 2 }),
        ],
      }),

      // Bound twice, once per branch, with DIFFERENT value sets: the wood
      // frame is published in fire retardant only.
      option('board_material', 'Board material', 3, {
        variantCode: 'alu_wpc',
        values: [
          value('spc', 'SPC', { sortOrder: 1 }),
          value('wpc', 'WPC', { sortOrder: 2 }),
          value('fr', 'Fire retardant', { sortOrder: 3 }),
        ],
      }),
      option('board_material', 'Board material', 3, {
        variantCode: 'wood',
        values: [value('fr', 'Fire retardant', { sortOrder: 1 })],
      }),

      option('width', 'Width', 4, {
        inputKind: 'number',
        unit: 'mm',
        isRequired: false,
        ranges: [{ condition: null, min: 600, max: 1220, step: 10 }],
      }),
      option('height', 'Height', 5, {
        inputKind: 'number',
        unit: 'mm',
        isRequired: false,
        ranges: [{ condition: null, min: 1800, max: 2600, step: 10 }],
      }),

      option('door_color', 'Colour', 6, {
        isRequired: false,
        values: [
          value('zeppelin_grey', 'Zeppelin Grey', { sortOrder: 1 }),
          value('pearl_white', 'Pearl White', { sortOrder: 2 }),
          value('misty_grey', 'Misty Grey', { sortOrder: 3 }),
          value('light_cloud_grey', 'Light Cloud Grey', { sortOrder: 4 }),
          value('platinum', 'Platinum', { sortOrder: 5 }),
          value('marsha_grey', 'Marsha Grey', { sortOrder: 6 }),
          value('matte_black', 'Matte Black', { sortOrder: 7 }),
        ],
      }),
    ],

    constraints: [],
    derivedQuantities: [
      { code: 'area_m2', formula: 'width * height / 1000000', unit: 'm2', sortOrder: 1 },
    ],
    rules: [],

    upgrades: [
      // Aluminium branch — sheet section 2.
      upgrade('same_color_alu', 'All same colour', 30, {
        variantCode: 'alu_wpc',
        section: 'Upgrade Items',
        detail: 'Frame, leaf, edge banding, lock, hinges x3',
        sortOrder: 1,
      }),
      upgrade('flat_outside', 'Flat outside, inward opening', 15, {
        variantCode: 'alu_wpc',
        section: 'Upgrade Items',
        detail: 'Standard offset hinge becomes side concealed',
        condition: { group: 'thickness', in: ['45', '55'] },
        unavailableNote: 'Only available on 45 mm and 55 mm',
        sortOrder: 2,
      }),
      upgrade('side_hinge_std', 'Side concealed hinges — standard finish', 7, {
        variantCode: 'alu_wpc',
        section: 'Upgrade Items',
        unit: 'per_unit',
        defaultQty: 3,
        sortOrder: 3,
      }),
      upgrade('side_hinge_color', 'Side concealed hinges — colour-matched', 11, {
        variantCode: 'alu_wpc',
        section: 'Upgrade Items',
        unit: 'per_unit',
        defaultQty: 3,
        sortOrder: 4,
      }),

      // Wood branch — sheet section 4. Note the price difference on the
      // same-named "All same colour": +15 here against +30 above.
      upgrade('hinge_3d_std', '45 mm Standard -> 3D hinges', 7, {
        variantCode: 'wood',
        section: 'Upgrade Items',
        unit: 'per_unit',
        defaultQty: 3,
        condition: { group: 'grade', in: ['std'] },
        unavailableNote: 'Haute Couture already ships with 3D hinges',
        sortOrder: 1,
      }),
      upgrade('same_color_wood', 'All same colour', 15, {
        variantCode: 'wood',
        section: 'Upgrade Items',
        sortOrder: 2,
      }),
      upgrade('soundproof', 'Soundproof MFC filling', 15, {
        variantCode: 'wood',
        section: 'Upgrade Items',
        sortOrder: 3,
      }),

      // Shared craftsmanship options — sheet section 5.
      upgrade('nano_agent', 'Nano agent', 12, { section: 'Craftsmanship', sortOrder: 10 }),
      upgrade('glass_with', 'Glass opening — with glass', 21, {
        section: 'Craftsmanship',
        sortOrder: 11,
      }),
      upgrade('honeycomb', 'Aluminium honeycomb connecting board', 9, {
        section: 'Craftsmanship',
        unit: 'per_set',
        sortOrder: 12,
      }),

      // Per square metre — sheet section 6.
      upgrade('wallpanel_alu', 'Wallpanel — Aluminum', 34, {
        section: 'Other Items',
        unit: 'per_sqm',
        quantityCode: 'area_m2',
        sortOrder: 20,
      }),

      // Accessories, with a quantity break — "Additional Accessories" sheet.
      upgrade('pamphlet', 'Colour pamphlet', 30, {
        section: 'Marketing',
        kind: 'accessory',
        unit: 'per_piece',
        tiers: [
          { minQty: 1, unitAmount: 30 },
          { minQty: 100, unitAmount: 15 },
          { minQty: 200, unitAmount: 10 },
        ],
        sortOrder: 30,
      }),
    ],

    bands: [
      // Sheet section 2. Half-open, so exactly 1050 mm lands in one band only.
      band('h_2170', 'Size — height 2170-2240 mm', 'height', 2170, 2240, 12, 1),
      band('h_2440', 'Size — height above 2440 mm', 'height', 2440, null, 23, 2),
      band('w_950', 'Size — width 950-1050 mm', 'width', 950, 1050, 12, 3),
      band('w_1050', 'Size — width 1050-1220 mm', 'width', 1050, 1220, 23, 4),
    ],
  };
}

/**
 * The widest width band is only offered in five colours, so it RESTRICTS the
 * colour question. Applied as a helper rather than baked into the fixture so a
 * test can show the same template behaving differently with and without it.
 */
export function withColourRestriction(template: TemplateDef): TemplateDef {
  return {
    ...template,
    upgrades: [
      ...(template.upgrades ?? []),
      upgrade('w_1050_upgrade', 'Size — width 1050-1220 mm', 23, {
        variantCode: 'alu_wpc',
        section: 'Upgrade Items',
        effects: [
          {
            kind: 'restrict',
            groupCode: 'door_color',
            valueCodes: [
              'zeppelin_grey',
              'pearl_white',
              'misty_grey',
              'light_cloud_grey',
              'platinum',
            ],
            message: 'A door this wide is only made in five colours.',
          },
        ],
        sortOrder: 5,
      }),
    ],
  };
}

/** 45 mm, aluminium silent banding, WPC board — a real, sold combination. */
export function aluDoorSelection(): Selection {
  return {
    __variant: { groupCode: '__variant', valueCodes: ['alu_wpc'], numericValue: null },
    thickness: { groupCode: 'thickness', valueCodes: ['45'], numericValue: 45 },
    edge_banding: { groupCode: 'edge_banding', valueCodes: ['alu_silent'], numericValue: null },
    board_material: { groupCode: 'board_material', valueCodes: ['wpc'], numericValue: null },
  };
}

/** 45 mm Haute Couture with aluminium silent banding — 105.00 in the list. */
export function woodDoorSelection(): Selection {
  return {
    __variant: { groupCode: '__variant', valueCodes: ['wood'], numericValue: null },
    grade: { groupCode: 'grade', valueCodes: ['hc'], numericValue: null },
    edge_banding: { groupCode: 'edge_banding', valueCodes: ['alu_silent'], numericValue: null },
    board_material: { groupCode: 'board_material', valueCodes: ['fr'], numericValue: null },
  };
}
