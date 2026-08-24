import { uuidv7 } from 'uuidv7';
import type { PrismaClient } from '@prisma/client';

// The Benison wholesale price list, seeded as a working made-to-order product.
//
// This is the reference example for everything the grid module exists to do,
// and every figure is transcribed from the supplier's own workbook rather than
// invented:
//
//   * two base variants that FORK the tree      aluminium frame vs wood frame
//   * a price grid with holes                   PUR banding is SPC-only
//   * a question bound per variant               thickness vs grade
//   * the same question with different options   board material
//   * an upgrade gated on an earlier answer      flat outside, 45 and 55 only
//   * an upgrade that restricts another question the widest width, 5 colours
//   * every pricing unit                         flat / per unit / set / m2
//   * a quantity break                           pamphlets at 1, 100, 200
//   * automatic size bands                       height and width steps
//
// It also carries two of the list's own defects on purpose, because pretending
// they are not there would hide them from whoever has to ask the supplier:
// the 55 mm PUR cells are ABSENT rather than marked unavailable, and heights
// between 2240 and 2440 fall through every band.
//
// Idempotent (docs/DATABASE.md §9): keyed by natural codes with `update: {}`.

const TEMPLATE_CODE = 'benison_door';
const PRODUCT_SLUG = 'benison-interior-door';
const HS_CODE = '4418.20'; // wooden doors and their frames

type ValueSeed = { code: string; name: string; numericValue?: number; configText?: string };
type GroupSeed = {
  code: string;
  name: string;
  inputKind: 'select' | 'number';
  unit?: string;
  values?: ValueSeed[];
};

const GROUPS: GroupSeed[] = [
  {
    code: 'ben_thickness',
    name: 'Thickness',
    inputKind: 'select',
    unit: 'mm',
    values: [
      { code: '40', name: '40 mm', numericValue: 40 },
      { code: '45', name: '45 mm', numericValue: 45 },
      { code: '55', name: '55 mm', numericValue: 55 },
    ],
  },
  {
    code: 'ben_grade',
    name: 'Grade',
    inputKind: 'select',
    values: [
      {
        code: 'std',
        name: '45 mm Standard',
        configText: 'Frame + 1 lock + 3x flush hinges, grid structural core board + wood keel',
      },
      {
        code: 'hc',
        name: '45 mm Haute Couture',
        configText: 'Frame + 1 lock + 3x 3D hinges, wood keel + graphite homogeneous board',
      },
    ],
  },
  {
    code: 'ben_edge_banding',
    name: 'Edge banding',
    inputKind: 'select',
    values: [
      { code: 'pur', name: 'PUR edge banding' },
      { code: 'alu_silent', name: 'Aluminum silent edge banding' },
    ],
  },
  {
    code: 'ben_board',
    name: 'Board material',
    inputKind: 'select',
    values: [
      { code: 'spc', name: 'SPC' },
      { code: 'wpc', name: 'WPC' },
      { code: 'fr', name: 'Fire retardant' },
    ],
  },
  { code: 'ben_width', name: 'Width', inputKind: 'number', unit: 'mm' },
  { code: 'ben_height', name: 'Height', inputKind: 'number', unit: 'mm' },
  {
    code: 'ben_color',
    name: 'Colour',
    inputKind: 'select',
    values: [
      { code: 'zeppelin_grey', name: 'Zeppelin Grey' },
      { code: 'pearl_white', name: 'Pearl White' },
      { code: 'misty_grey', name: 'Misty Grey' },
      { code: 'light_cloud_grey', name: 'Light Cloud Grey' },
      { code: 'platinum', name: 'Platinum' },
      { code: 'marsha_grey', name: 'Marsha Grey' },
      { code: 'milan_grey', name: 'Milan Grey' },
      { code: 'matte_black', name: 'Matte Black' },
    ],
  },
];

const ALU_CONFIG = 'Frame + 1 lock + 3x 2D hinges, wood keel + graphite board';

// null = the dash in the sheet (not sold). A key absent from this map has
// never been published at all, which the editor reports as an unfilled cell.
const ALU_CELLS: Record<string, number | null> = {
  '40|pur|spc': 65,
  '40|pur|wpc': null,
  '40|pur|fr': null,
  '40|alu_silent|spc': 80,
  '40|alu_silent|wpc': 80,
  '40|alu_silent|fr': 80,
  '45|pur|spc': 75,
  '45|pur|wpc': null,
  '45|pur|fr': null,
  '45|alu_silent|spc': 90,
  '45|alu_silent|wpc': 90,
  '45|alu_silent|fr': 90,
  // 55 mm PUR is deliberately absent — see the note at the top of this file.
  '55|alu_silent|spc': 100,
  '55|alu_silent|wpc': 100,
  '55|alu_silent|fr': 100,
};

const WOOD_CELLS: Record<string, number | null> = {
  'std|pur|fr': 75,
  'std|alu_silent|fr': 90,
  'hc|pur|fr': 90,
  'hc|alu_silent|fr': 105,
};

type UpgradeSeed = {
  code: string;
  label: string;
  detail?: string;
  section: string;
  variant?: 'alu_wpc' | 'wood';
  kind?: 'upgrade' | 'accessory';
  amount: number;
  unit?: 'flat' | 'per_unit' | 'per_set' | 'per_sqm' | 'per_piece';
  quantityCode?: string;
  defaultQty?: number;
  condition?: object;
  unavailableNote?: string;
  tiers?: { minQty: number; unitAmount: number }[];
  restrict?: { group: string; values: string[]; message: string };
};

const UPGRADES: UpgradeSeed[] = [
  // --- 2. Aluminum Frame — Upgrade Items ---------------------------------
  {
    code: 'alu_same_color',
    label: 'All same colour',
    detail: 'Frame, leaf, edge banding, lock, hinges x3 — matching door or wood-grain tones',
    section: 'Aluminum Frame — Upgrade Items',
    variant: 'alu_wpc',
    amount: 30,
  },
  {
    code: 'alu_flat_outside',
    label: 'Flat outside, inward opening',
    detail: 'Standard is an offset hinge; this upgrades it to a side concealed hinge',
    section: 'Aluminum Frame — Upgrade Items',
    variant: 'alu_wpc',
    amount: 15,
    condition: { group: 'ben_thickness', in: ['45', '55'] },
    unavailableNote: 'Only available on 45 mm and 55 mm',
  },
  {
    code: 'alu_side_hinge_std',
    label: 'Side concealed hinges — standard finish',
    detail: 'Marsha Grey, Milan Grey, Matte Black',
    section: 'Aluminum Frame — Upgrade Items',
    variant: 'alu_wpc',
    amount: 7,
    unit: 'per_unit',
    defaultQty: 3,
  },
  {
    code: 'alu_side_hinge_color',
    label: 'Side concealed hinges — colour-matched',
    detail: 'Custom colour matching',
    section: 'Aluminum Frame — Upgrade Items',
    variant: 'alu_wpc',
    amount: 11,
    unit: 'per_unit',
    defaultQty: 3,
  },

  // --- 4. Wood Frame — Upgrade Items -------------------------------------
  // Note "All same colour" costs half what it does on aluminium. That is the
  // clearest evidence the two variants are genuinely separate products.
  {
    code: 'wood_3d_hinge_std',
    label: '45 mm Standard to 3D hinges',
    detail: 'Standard finish (Marsha Grey, Milan Grey, Matte Black)',
    section: 'Wood Frame — Upgrade Items',
    variant: 'wood',
    amount: 7,
    unit: 'per_unit',
    defaultQty: 3,
    condition: { group: 'ben_grade', in: ['std'] },
    unavailableNote: 'Haute Couture already ships with 3D hinges',
  },
  {
    code: 'wood_3d_hinge_color',
    label: '45 mm Standard to 3D hinges — colour-matched',
    section: 'Wood Frame — Upgrade Items',
    variant: 'wood',
    amount: 11,
    unit: 'per_unit',
    defaultQty: 3,
    condition: { group: 'ben_grade', in: ['std'] },
    unavailableNote: 'Haute Couture already ships with 3D hinges',
  },
  {
    code: 'wood_same_color',
    label: 'All same colour',
    detail: 'Edge banding, lock, hinges x3',
    section: 'Wood Frame — Upgrade Items',
    variant: 'wood',
    amount: 15,
  },
  {
    code: 'wood_soundproof',
    label: 'Soundproof MFC filling',
    detail: 'Acoustic insulation upgrade',
    section: 'Wood Frame — Upgrade Items',
    variant: 'wood',
    amount: 15,
  },

  // --- 5. Craftsmanship & Decorative Options -----------------------------
  // Listed after both tables without saying which frame they belong to, so
  // they are seeded as shared. This is open question 9 for the supplier.
  {
    code: 'craft_nano',
    label: 'Nano agent',
    detail: 'Engraving nano filler',
    section: 'Craftsmanship',
    amount: 12,
  },
  {
    code: 'craft_strips',
    label: 'Metal strips',
    detail: 'Standard metal inlay strips',
    section: 'Craftsmanship',
    amount: 14,
  },
  {
    code: 'craft_strips_color',
    label: 'Coloured metal strips / aluminium grills',
    detail: 'Custom coloured decorative inlays',
    section: 'Craftsmanship',
    amount: 19,
  },
  {
    code: 'craft_glass_full',
    label: 'Glass opening — with glass',
    detail: 'Pre-cut glass opening included',
    section: 'Craftsmanship',
    amount: 21,
  },
  {
    code: 'craft_glass_cut',
    label: 'Glass opening — opening only',
    detail: 'Opening cut, glass not included',
    section: 'Craftsmanship',
    amount: 13,
  },
  {
    code: 'craft_honeycomb',
    label: 'Aluminium honeycomb connecting board',
    section: 'Craftsmanship',
    amount: 9,
    unit: 'per_set',
  },
  {
    code: 'craft_integrated',
    label: 'Upgraded integrated set',
    section: 'Craftsmanship',
    amount: 9,
    unit: 'per_set',
  },

  // --- 6. Other Items ----------------------------------------------------
  {
    code: 'other_lintel_small',
    label: 'Single-sided door lintel — up to 500 x 1500 mm',
    section: 'Other Items',
    amount: 12,
  },
  {
    code: 'other_lintel_large',
    label: 'Single-sided door lintel — over 500 x 1500 mm',
    section: 'Other Items',
    amount: 18,
  },
  {
    code: 'other_wallpanel_poly',
    label: 'Wallpanel — Polywood',
    section: 'Other Items',
    amount: 26,
    unit: 'per_sqm',
    quantityCode: 'area_m2',
  },
  {
    code: 'other_wallpanel_alu',
    label: 'Wallpanel — Aluminum',
    section: 'Other Items',
    amount: 34,
    unit: 'per_sqm',
    quantityCode: 'area_m2',
  },
  {
    code: 'other_grille',
    label: 'Wooden grille',
    section: 'Other Items',
    amount: 15,
    unit: 'per_piece',
  },

  // --- Additional Accessories -------------------------------------------
  {
    code: 'lock_seamless',
    label: 'Seamless lock',
    section: 'Locks',
    kind: 'accessory',
    amount: 22,
    unit: 'per_piece',
  },
  {
    code: 'lock_mis',
    label: 'Mis lock',
    section: 'Locks',
    kind: 'accessory',
    amount: 22,
    unit: 'per_piece',
  },
  {
    code: 'lock_lever',
    label: 'Lever lock',
    section: 'Locks',
    kind: 'accessory',
    amount: 22,
    unit: 'per_piece',
  },
  {
    code: 'lock_5a',
    label: '5A lock',
    section: 'Locks',
    kind: 'accessory',
    amount: 22,
    unit: 'per_piece',
  },
  {
    code: 'hinge_2d',
    label: 'Two-dimensional concealed hinge',
    detail: 'Any colour — the list quotes 3.00 either way',
    section: 'Hinges',
    kind: 'accessory',
    amount: 3,
    unit: 'per_piece',
    defaultQty: 3,
  },
  {
    code: 'hinge_3d_std',
    label: 'Three-dimensional concealed hinge — standard colours',
    section: 'Hinges',
    kind: 'accessory',
    amount: 8,
    unit: 'per_piece',
    defaultQty: 3,
  },
  {
    code: 'hinge_3d_other',
    label: 'Three-dimensional concealed hinge — other colours',
    section: 'Hinges',
    kind: 'accessory',
    amount: 12,
    unit: 'per_piece',
    defaultQty: 3,
  },
  {
    code: 'hinge_side_std',
    label: 'Side concealed hinge — standard colours',
    section: 'Hinges',
    kind: 'accessory',
    amount: 7,
    unit: 'per_piece',
    defaultQty: 3,
  },
  {
    code: 'hinge_side_other',
    label: 'Side concealed hinge — other colours',
    section: 'Hinges',
    kind: 'accessory',
    amount: 11,
    unit: 'per_piece',
    defaultQty: 3,
  },
  {
    code: 'hinge_flush',
    label: 'Flush hinge',
    detail: 'Only Marsha Grey and Matte Black',
    section: 'Hinges',
    kind: 'accessory',
    amount: 2,
    unit: 'per_piece',
    defaultQty: 3,
  },
  {
    code: 'marketing_pamphlet',
    label: 'Colour pamphlet',
    section: 'Marketing Materials',
    kind: 'accessory',
    amount: 30,
    unit: 'per_piece',
    tiers: [
      { minQty: 1, unitAmount: 30 },
      { minQty: 100, unitAmount: 15 },
      { minQty: 200, unitAmount: 10 },
    ],
  },
  {
    code: 'marketing_sample',
    label: 'Sample',
    section: 'Marketing Materials',
    kind: 'accessory',
    amount: 75,
    unit: 'per_piece',
  },
];

// Section 2 of the sheet prices size as steps above the standard opening.
// Half-open [min, max), because the published width bands both claim 1050.
type BandSeed = {
  code: string;
  label: string;
  group: string;
  min?: number;
  max?: number;
  amount: number;
};
const BANDS: BandSeed[] = [
  {
    code: 'size_h_2170',
    label: 'Height 2170–2240 mm',
    group: 'ben_height',
    min: 2170,
    max: 2240,
    amount: 12,
  },
  {
    code: 'size_h_2440',
    label: 'Height above 2440 mm',
    group: 'ben_height',
    min: 2440,
    amount: 23,
  },
  {
    code: 'size_w_950',
    label: 'Width 950–1050 mm',
    group: 'ben_width',
    min: 950,
    max: 1050,
    amount: 12,
  },
  {
    code: 'size_w_1050',
    label: 'Width 1050–1220 mm',
    group: 'ben_width',
    min: 1050,
    max: 1220,
    amount: 23,
  },
];

export async function seedBenison(prisma: PrismaClient): Promise<void> {
  // ---- option vocabulary ------------------------------------------------
  const groupId = new Map<string, string>();
  const valueId = new Map<string, string>(); // 'group:value'

  for (const [index, group] of GROUPS.entries()) {
    const row = await prisma.optionGroup.upsert({
      where: { code: group.code },
      update: {},
      create: {
        id: uuidv7(),
        code: group.code,
        inputKind: group.inputKind,
        unit: group.unit ?? null,
        sortOrder: 100 + index,
      },
    });
    groupId.set(group.code, row.id);

    await prisma.optionGroupTranslation.upsert({
      where: { groupId_localeCode: { groupId: row.id, localeCode: 'en' } },
      update: {},
      create: { id: uuidv7(), groupId: row.id, localeCode: 'en', name: group.name },
    });

    for (const [vIndex, value] of (group.values ?? []).entries()) {
      const valueRow = await prisma.optionValue.upsert({
        where: { groupId_code: { groupId: row.id, code: value.code } },
        update: {},
        create: {
          id: uuidv7(),
          groupId: row.id,
          code: value.code,
          numericValue: value.numericValue ?? null,
          sortOrder: vIndex,
        },
      });
      valueId.set(`${group.code}:${value.code}`, valueRow.id);

      await prisma.optionValueTranslation.upsert({
        where: { valueId_localeCode: { valueId: valueRow.id, localeCode: 'en' } },
        update: {},
        create: { id: uuidv7(), valueId: valueRow.id, localeCode: 'en', name: value.name },
      });
    }
  }

  // ---- template ---------------------------------------------------------
  const hsCode = await prisma.hsCode.findUnique({ where: { code: HS_CODE } });

  const template = await prisma.configTemplate.upsert({
    where: { code: TEMPLATE_CODE },
    update: {},
    create: {
      id: uuidv7(),
      code: TEMPLATE_CODE,
      name: 'Benison Interior Door',
      currency: 'USD',
      standardNote: 'Standard opening 2170 x 950 x 300 mm — every size band is a step above this',
      hsCodeId: hsCode?.id ?? null,
    },
  });

  // ---- variants ---------------------------------------------------------
  const variants = [
    {
      code: 'alu_wpc',
      name: 'Aluminum Frame + WPC Connecting Board',
      includedSpec: ALU_CONFIG,
      sortOrder: 1,
      axes: ['ben_thickness', 'ben_edge_banding', 'ben_board'],
      cells: ALU_CELLS,
    },
    {
      code: 'wood',
      name: 'Wood Frame',
      includedSpec: 'Varies by grade — see the configuration on each grade',
      sortOrder: 2,
      axes: ['ben_grade', 'ben_edge_banding', 'ben_board'],
      cells: WOOD_CELLS,
    },
  ];

  const variantId = new Map<string, string>();
  const optionId = new Map<string, string>(); // 'variant|group' -> template option id

  for (const variant of variants) {
    const row = await prisma.configVariant.upsert({
      where: { templateId_code: { templateId: template.id, code: variant.code } },
      update: {},
      create: {
        id: uuidv7(),
        templateId: template.id,
        code: variant.code,
        name: variant.name,
        includedSpec: variant.includedSpec,
        sortOrder: variant.sortOrder,
      },
    });
    variantId.set(variant.code, row.id);

    // Bind this branch's questions. `board_material` is bound to BOTH
    // variants with different value subsets, which is exactly what the
    // partial unique index on (template, variant, group) makes possible.
    for (const [index, groupCode] of variant.axes.entries()) {
      const gid = groupId.get(groupCode)!;
      const existing = await prisma.configTemplateOption.findFirst({
        where: { templateId: template.id, groupId: gid, variantId: row.id },
        select: { id: true },
      });
      const option =
        existing ??
        (await prisma.configTemplateOption.create({
          data: {
            id: uuidv7(),
            templateId: template.id,
            variantId: row.id,
            groupId: gid,
            sortOrder: index + 1,
            isRequired: true,
            configText: groupCode === 'ben_thickness' ? ALU_CONFIG : null,
          },
        }));
      optionId.set(`${variant.code}|${groupCode}`, option.id);

      // Which of the group's values this branch actually offers. The wood
      // frame is published in fire retardant only.
      const offered =
        groupCode === 'ben_board' && variant.code === 'wood'
          ? ['fr']
          : (GROUPS.find((g) => g.code === groupCode)?.values ?? []).map((v) => v.code);

      for (const [vIndex, code] of offered.entries()) {
        const vid = valueId.get(`${groupCode}:${code}`)!;
        const seedValue = GROUPS.find((g) => g.code === groupCode)?.values?.find(
          (v) => v.code === code,
        );
        await prisma.configTemplateOptionValue.upsert({
          where: { templateOptionId_valueId: { templateOptionId: option.id, valueId: vid } },
          update: {},
          create: {
            templateOptionId: option.id,
            valueId: vid,
            sortOrder: vIndex,
            configText: seedValue?.configText ?? null,
          },
        });
      }
    }

    // ---- the grid -------------------------------------------------------
    const grid = await prisma.configPriceGrid.upsert({
      where: { variantId: row.id },
      update: {},
      create: { id: uuidv7(), variantId: row.id, currency: 'USD' },
    });

    for (const [position, groupCode] of variant.axes.entries()) {
      const templateOptionId = optionId.get(`${variant.code}|${groupCode}`)!;
      const existingAxis = await prisma.configPriceGridAxis.findFirst({
        where: { gridId: grid.id, templateOptionId },
      });
      if (!existingAxis) {
        await prisma.configPriceGridAxis.create({
          data: { id: uuidv7(), gridId: grid.id, templateOptionId, position },
        });
      }
    }

    for (const [key, amount] of Object.entries(variant.cells)) {
      const parts = key.split('|');
      const coords = Object.fromEntries(variant.axes.map((axis, i) => [axis, parts[i]]));
      await prisma.configPriceCell.upsert({
        where: { gridId_key: { gridId: grid.id, key } },
        update: {},
        create: { id: uuidv7(), gridId: grid.id, key, coords, amount },
      });
    }
  }

  // ---- shared questions -------------------------------------------------
  // Width, height and colour are asked whichever frame is chosen.
  for (const [index, groupCode] of ['ben_width', 'ben_height', 'ben_color'].entries()) {
    const gid = groupId.get(groupCode)!;
    const existing = await prisma.configTemplateOption.findFirst({
      where: { templateId: template.id, groupId: gid, variantId: null },
      select: { id: true },
    });
    const option =
      existing ??
      (await prisma.configTemplateOption.create({
        data: {
          id: uuidv7(),
          templateId: template.id,
          variantId: null,
          groupId: gid,
          sortOrder: 10 + index,
          isRequired: false,
          ranges:
            groupCode === 'ben_width'
              ? [{ condition: null, min: 600, max: 1220, step: 10 }]
              : groupCode === 'ben_height'
                ? [{ condition: null, min: 1800, max: 2600, step: 10 }]
                : undefined,
        },
      }));
    optionId.set(`|${groupCode}`, option.id);

    for (const [vIndex, value] of (
      GROUPS.find((g) => g.code === groupCode)?.values ?? []
    ).entries()) {
      const vid = valueId.get(`${groupCode}:${value.code}`)!;
      await prisma.configTemplateOptionValue.upsert({
        where: { templateOptionId_valueId: { templateOptionId: option.id, valueId: vid } },
        update: {},
        create: { templateOptionId: option.id, valueId: vid, sortOrder: vIndex },
      });
    }
  }

  // ---- derived quantities ----------------------------------------------
  // Wall panels are priced per square metre, so the area has to exist.
  await prisma.configDerivedQuantity.upsert({
    where: { templateId_code: { templateId: template.id, code: 'area_m2' } },
    update: {},
    create: {
      id: uuidv7(),
      templateId: template.id,
      code: 'area_m2',
      formula: 'ben_width * ben_height / 1000000',
      unit: 'm2',
      sortOrder: 1,
    },
  });

  // ---- upgrades ---------------------------------------------------------
  for (const [index, upgrade] of UPGRADES.entries()) {
    const row = await prisma.configUpgrade.upsert({
      where: { templateId_code: { templateId: template.id, code: upgrade.code } },
      update: {},
      create: {
        id: uuidv7(),
        templateId: template.id,
        variantId: upgrade.variant ? (variantId.get(upgrade.variant) ?? null) : null,
        section: upgrade.section,
        code: upgrade.code,
        label: upgrade.label,
        detail: upgrade.detail ?? null,
        kind: upgrade.kind ?? 'upgrade',
        amount: upgrade.amount,
        unit: upgrade.unit ?? 'flat',
        quantityCode: upgrade.quantityCode ?? null,
        defaultQty: upgrade.defaultQty ?? 1,
        condition: upgrade.condition,
        unavailableNote: upgrade.unavailableNote ?? null,
        sortOrder: index,
      },
    });

    for (const tier of upgrade.tiers ?? []) {
      await prisma.configUpgradeTier.upsert({
        where: { upgradeId_minQty: { upgradeId: row.id, minQty: tier.minQty } },
        update: {},
        create: {
          id: uuidv7(),
          upgradeId: row.id,
          minQty: tier.minQty,
          unitAmount: tier.unitAmount,
        },
      });
    }
  }

  // ---- size bands, and the one that restricts colour --------------------
  for (const [index, seed] of BANDS.entries()) {
    const templateOptionId = optionId.get(`|${seed.group}`)!;
    await prisma.configBand.upsert({
      where: { templateId_code: { templateId: template.id, code: seed.code } },
      update: {},
      create: {
        id: uuidv7(),
        templateId: template.id,
        variantId: variantId.get('alu_wpc') ?? null,
        templateOptionId,
        code: seed.code,
        label: seed.label,
        minValue: seed.min ?? null,
        maxValue: seed.max ?? null,
        amount: seed.amount,
        sortOrder: index,
      },
    });
  }

  // The widest width is only made in five colours. Modelled as an upgrade
  // with a `restrict` effect rather than a band, because the restriction has
  // to fire from something a person chose.
  const widthUpgrade = await prisma.configUpgrade.upsert({
    where: { templateId_code: { templateId: template.id, code: 'alu_width_1050' } },
    update: {},
    create: {
      id: uuidv7(),
      templateId: template.id,
      variantId: variantId.get('alu_wpc') ?? null,
      section: 'Aluminum Frame — Upgrade Items',
      code: 'alu_width_1050',
      label: 'Size upgrade — width 1050–1220 mm',
      detail: 'Available in five colours only',
      amount: 23,
      unit: 'flat',
      sortOrder: 5,
    },
  });

  const existingEffect = await prisma.configUpgradeEffect.findFirst({
    where: { upgradeId: widthUpgrade.id, kind: 'restrict' },
  });
  if (!existingEffect) {
    await prisma.configUpgradeEffect.create({
      data: {
        id: uuidv7(),
        upgradeId: widthUpgrade.id,
        kind: 'restrict',
        templateOptionId: optionId.get('|ben_color')!,
        valueCodes: ['zeppelin_grey', 'pearl_white', 'misty_grey', 'light_cloud_grey', 'platinum'],
        message:
          'A door this wide is only made in Zeppelin Grey, Pearl White, Misty Grey, Light Cloud Grey or Platinum.',
      },
    });
  }

  // ---- the product the customer actually sees ---------------------------
  const source = await prisma.source.upsert({
    where: { code: 'benison' },
    update: {},
    create: { id: uuidv7(), code: 'benison', sortOrder: 10 },
  });

  await prisma.sourceTranslation.upsert({
    where: { sourceId_localeCode: { sourceId: source.id, localeCode: 'en' } },
    update: {},
    create: { id: uuidv7(), sourceId: source.id, localeCode: 'en', name: 'Benison' },
  });

  const product = await prisma.product.upsert({
    where: { slug: PRODUCT_SLUG },
    update: {},
    create: {
      id: uuidv7(),
      // No legacy id: this is made to order, not imported from a feed. The
      // CHECK on `products` permits that only because kind says so.
      kind: 'made_to_order',
      slug: PRODUCT_SLUG,
      sourceId: source.id,
      templateId: template.id,
      hsCodeId: hsCode?.id ?? null,
      price: 0, // meaningless for a configured product; the grid is the price
      currency: 'USD',
      isPublished: true,
      isAvailable: true,
    },
  });

  await prisma.productTranslation.upsert({
    where: { productId_localeCode: { productId: product.id, localeCode: 'en' } },
    update: {},
    create: {
      id: uuidv7(),
      productId: product.id,
      localeCode: 'en',
      name: 'Benison Interior Door',
      description:
        'Made-to-order interior door in an aluminium or wood frame, with a choice of thickness, edge banding, board material and finish. Configured and quoted by our team.',
    },
  });

  await prisma.productTranslation.upsert({
    where: { productId_localeCode: { productId: product.id, localeCode: 'ar' } },
    update: {},
    create: {
      id: uuidv7(),
      productId: product.id,
      localeCode: 'ar',
      name: 'باب داخلي بينيسون',
      description:
        'باب داخلي يُصنع حسب الطلب بإطار ألمنيوم أو خشب، مع اختيار السماكة ونوع الحواف ومادة اللوح والتشطيب. يقوم فريقنا بالتهيئة وتقديم عرض السعر.',
    },
  });
}
