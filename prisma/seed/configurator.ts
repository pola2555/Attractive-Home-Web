import { uuidv7 } from 'uuidv7';
import type { PrismaClient, Prisma } from '@prisma/client';

// A worked "door" template. This is not decoration — it is the reference
// example the whole module is verified against, and it deliberately exercises
// every feature exactly once so a regression in any of them shows up here:
//
//   * a group hidden by a condition        glazing, only on a glazed door
//   * a value gated by an earlier choice   walnut stain, only on solid timber
//   * a conditional numeric range          max width narrows on thin doors
//   * a 3-way constraint                   no per-value condition can express it
//   * chained derived quantities           area -> volume -> weight
//   * every pricing stage                  base / adder / margin / discount
//   * apply_per: 'line'                    a setup fee charged once, not per unit
//   * a __qty tier                         volume discount at 50+
//
// Idempotent (docs/DATABASE.md §9): keyed by natural codes with `update: {}`,
// so re-running never clobbers a rule the team has since tuned.

type GroupSeed = {
  code: string;
  inputKind: string;
  unit?: string;
  name: string;
  helpText?: string;
  values?: {
    code: string;
    name: string;
    numericValue?: number;
    attributes?: Prisma.InputJsonValue;
    colorCode?: string;
  }[];
};

const GROUPS: GroupSeed[] = [
  {
    code: 'door_type',
    inputKind: 'select',
    name: 'Door type',
    values: [
      { code: 'solid', name: 'Solid' },
      { code: 'glazed', name: 'Glazed' },
      { code: 'louvered', name: 'Louvered' },
    ],
  },
  {
    code: 'door_material',
    inputKind: 'select',
    name: 'Material',
    helpText: 'Density drives the derived weight, which drives freight.',
    values: [
      { code: 'mdf', name: 'MDF', attributes: { density: 750 } },
      { code: 'solid_oak', name: 'Solid oak', attributes: { density: 700 } },
      { code: 'solid_walnut', name: 'Solid walnut', attributes: { density: 660 } },
      { code: 'aluminium', name: 'Aluminium', attributes: { density: 2700 } },
    ],
  },
  {
    code: 'thickness',
    inputKind: 'number',
    unit: 'mm',
    name: 'Thickness',
  },
  { code: 'height', inputKind: 'number', unit: 'mm', name: 'Height' },
  { code: 'width', inputKind: 'number', unit: 'mm', name: 'Width' },
  {
    code: 'finish_color',
    inputKind: 'select',
    name: 'Finish / colour',
    values: [
      { code: 'natural', name: 'Natural' },
      { code: 'walnut_stain', name: 'Walnut stain' },
      { code: 'white', name: 'White', colorCode: 'white' },
      { code: 'black', name: 'Black', colorCode: 'black' },
      { code: 'custom_ral', name: 'Custom RAL' },
    ],
  },
  {
    code: 'glazing',
    inputKind: 'select',
    name: 'Glazing',
    values: [
      { code: 'single', name: 'Single glazed' },
      { code: 'double', name: 'Double glazed' },
      { code: 'frosted', name: 'Frosted' },
    ],
  },
  {
    code: 'accessories',
    inputKind: 'multi_select',
    name: 'Accessories',
    helpText: 'Quantity per accessory is captured on the item.',
    values: [
      { code: 'hinge', name: 'Concealed hinge' },
      { code: 'handle', name: 'Lever handle' },
      { code: 'closer', name: 'Door closer' },
      { code: 'seal_kit', name: 'Acoustic seal kit' },
    ],
  },
];

// Sourced from China, so the template prices in USD. Every rule on a template
// shares its currency (see ConfigTemplate.currency) and FX lands once, at
// quote-item level.
const TEMPLATE = { code: 'door', name: 'Door (configurable)', currency: 'USD' };

export async function seedConfigurator(prisma: PrismaClient): Promise<void> {
  // ---- vocabulary -------------------------------------------------------
  const groupIdByCode = new Map<string, string>();
  const valueIdByKey = new Map<string, string>(); // 'group:value' -> id

  for (const [index, group] of GROUPS.entries()) {
    const row = await prisma.optionGroup.upsert({
      where: { code: group.code },
      update: {},
      create: {
        id: uuidv7(),
        code: group.code,
        inputKind: group.inputKind,
        unit: group.unit ?? null,
        sortOrder: index,
      },
    });
    groupIdByCode.set(group.code, row.id);

    await prisma.optionGroupTranslation.upsert({
      where: { groupId_localeCode: { groupId: row.id, localeCode: 'en' } },
      update: {},
      create: {
        id: uuidv7(),
        groupId: row.id,
        localeCode: 'en',
        name: group.name,
        helpText: group.helpText ?? null,
      },
    });

    for (const [vIndex, value] of (group.values ?? []).entries()) {
      // Reuse the existing colours vocabulary rather than forking a second one
      // that drifts. Absent (a fresh database before the catalog import) simply
      // means no link — never a failed seed.
      const color = value.colorCode
        ? await prisma.color.findUnique({ where: { code: value.colorCode } })
        : null;

      const valueRow = await prisma.optionValue.upsert({
        where: { groupId_code: { groupId: row.id, code: value.code } },
        update: {},
        create: {
          id: uuidv7(),
          groupId: row.id,
          code: value.code,
          numericValue: value.numericValue ?? null,
          attributes: value.attributes,
          colorId: color?.id ?? null,
          sortOrder: vIndex,
        },
      });
      valueIdByKey.set(`${group.code}:${value.code}`, valueRow.id);

      await prisma.optionValueTranslation.upsert({
        where: { valueId_localeCode: { valueId: valueRow.id, localeCode: 'en' } },
        update: {},
        create: { id: uuidv7(), valueId: valueRow.id, localeCode: 'en', name: value.name },
      });
    }
  }

  // ---- template ---------------------------------------------------------
  const template = await prisma.configTemplate.upsert({
    where: { code: TEMPLATE.code },
    update: {},
    create: { id: uuidv7(), ...TEMPLATE },
  });

  // sort_order is the DAG: a condition or formula may only look BACKWARDS, so
  // material can gate colour but colour can never gate material.
  const OPTIONS: {
    group: string;
    sortOrder: number;
    isRequired: boolean;
    condition?: Prisma.InputJsonValue;
    ranges?: Prisma.InputJsonValue;
  }[] = [
    { group: 'door_type', sortOrder: 1, isRequired: true },
    { group: 'door_material', sortOrder: 2, isRequired: true },
    {
      group: 'thickness',
      sortOrder: 3,
      isRequired: true,
      // Aluminium sections start thicker than timber.
      ranges: [
        { condition: { group: 'door_material', in: ['aluminium'] }, min: 40, max: 80, step: 5 },
        { condition: null, min: 30, max: 60, step: 5 },
      ],
    },
    {
      group: 'height',
      sortOrder: 4,
      isRequired: true,
      ranges: [{ condition: null, min: 1800, max: 2400, step: 10 }],
    },
    {
      group: 'width',
      sortOrder: 5,
      isRequired: true,
      // A thin leaf cannot span as wide. A `number` group has no option_values
      // rows, so this conditional range is the ONLY place this rule can live.
      ranges: [
        { condition: { group: 'thickness', op: '<', value: 45 }, min: 600, max: 1200, step: 10 },
        { condition: null, min: 600, max: 1400, step: 10 },
      ],
    },
    { group: 'finish_color', sortOrder: 6, isRequired: true },
    {
      group: 'glazing',
      sortOrder: 7,
      isRequired: true,
      // Hides the GROUP. Hiding only its values would leave an empty required
      // select that can never be satisfied.
      condition: { group: 'door_type', in: ['glazed'] },
    },
    { group: 'accessories', sortOrder: 8, isRequired: false },
  ];

  const templateOptionIdByGroup = new Map<string, string>();
  for (const option of OPTIONS) {
    const groupId = groupIdByCode.get(option.group);
    if (!groupId) throw new Error(`Unknown option group in template seed: ${option.group}`);
    const row = await prisma.configTemplateOption.upsert({
      where: { templateId_groupId: { templateId: template.id, groupId } },
      update: {},
      create: {
        id: uuidv7(),
        templateId: template.id,
        groupId,
        sortOrder: option.sortOrder,
        isRequired: option.isRequired,
        condition: option.condition,
        ranges: option.ranges,
      },
    });
    templateOptionIdByGroup.set(option.group, row.id);
  }

  // Which values each select offers, and under what condition. NULL condition
  // = always available; this is the tree.
  const OFFERED: { group: string; value: string; condition?: Prisma.InputJsonValue }[] = [
    ...['solid', 'glazed', 'louvered'].map((v) => ({ group: 'door_type', value: v })),
    ...['mdf', 'solid_oak', 'solid_walnut', 'aluminium'].map((v) => ({
      group: 'door_material',
      value: v,
    })),
    { group: 'finish_color', value: 'natural' },
    {
      group: 'finish_color',
      value: 'walnut_stain',
      // A stain only makes sense on real timber.
      condition: { group: 'door_material', in: ['solid_oak', 'solid_walnut'] },
    },
    { group: 'finish_color', value: 'white' },
    { group: 'finish_color', value: 'black' },
    { group: 'finish_color', value: 'custom_ral' },
    ...['single', 'double', 'frosted'].map((v) => ({ group: 'glazing', value: v })),
    ...['hinge', 'handle', 'closer', 'seal_kit'].map((v) => ({ group: 'accessories', value: v })),
  ];

  for (const [index, offered] of OFFERED.entries()) {
    const templateOptionId = templateOptionIdByGroup.get(offered.group);
    const valueId = valueIdByKey.get(`${offered.group}:${offered.value}`);
    if (!templateOptionId || !valueId) {
      throw new Error(`Unknown offered value in template seed: ${offered.group}:${offered.value}`);
    }
    await prisma.configTemplateOptionValue.upsert({
      where: { templateOptionId_valueId: { templateOptionId, valueId } },
      update: {},
      create: { templateOptionId, valueId, sortOrder: index, condition: offered.condition },
    });
  }

  // ---- constraints ------------------------------------------------------
  // Three-way: thickness, width and material are each individually fine. There
  // is no single value to hang a condition on, and picking one arbitrarily
  // would make the UI behave differently depending on click order.
  await prisma.configTemplateConstraint.upsert({
    where: { templateId_code: { templateId: template.id, code: 'mdf_wide_thick' } },
    update: {},
    create: {
      id: uuidv7(),
      templateId: template.id,
      code: 'mdf_wide_thick',
      kind: 'forbid',
      condition: {
        all: [
          { group: 'door_material', in: ['mdf'] },
          { group: 'width', op: '>', value: 1200 },
          { group: 'thickness', op: '>=', value: 45 },
        ],
      },
      message:
        'MDF is not available above 1200 mm wide at 45 mm or thicker — the leaf warps. Specify solid timber or reduce the width.',
    },
  });

  // ---- derived quantities ----------------------------------------------
  // Chained: each may only reference groups and EARLIER quantities. Attributes
  // are exposed to formulas as `<group>_<attribute>`, hence door_material_density.
  const DERIVED = [
    { code: 'area_m2', formula: 'height * width / 1000000', unit: 'm2', sortOrder: 1 },
    { code: 'volume_m3', formula: 'area_m2 * thickness / 1000', unit: 'm3', sortOrder: 2 },
    { code: 'weight_kg', formula: 'volume_m3 * door_material_density', unit: 'kg', sortOrder: 3 },
  ];
  for (const derived of DERIVED) {
    await prisma.configDerivedQuantity.upsert({
      where: { templateId_code: { templateId: template.id, code: derived.code } },
      update: {},
      create: { id: uuidv7(), templateId: template.id, ...derived },
    });
  }

  // ---- pricing rules ----------------------------------------------------
  // Signed rates, no hidden sign convention: a discount stores a negative rate.
  // `stage` orders evaluation and fixes what a percent applies to; `priority`
  // only breaks ties within a stage.
  const RULES: Omit<Prisma.PricingRuleCreateInput, 'id' | 'template'>[] = [
    {
      code: 'panel_base',
      stage: 'base',
      priority: 10,
      basis: 'per_quantity',
      quantityCode: 'area_m2',
      rate: 42,
      currency: 'USD',
      note: 'Base panel cost per m²',
    },
    {
      code: 'material_oak',
      stage: 'adder',
      priority: 10,
      basis: 'per_quantity',
      quantityCode: 'area_m2',
      rate: 65,
      currency: 'USD',
      condition: { group: 'door_material', in: ['solid_oak'] },
    },
    {
      code: 'material_walnut',
      stage: 'adder',
      priority: 10,
      basis: 'per_quantity',
      quantityCode: 'area_m2',
      rate: 88,
      currency: 'USD',
      condition: { group: 'door_material', in: ['solid_walnut'] },
    },
    {
      code: 'material_aluminium',
      stage: 'adder',
      priority: 10,
      basis: 'per_quantity',
      quantityCode: 'area_m2',
      rate: 55,
      currency: 'USD',
      condition: { group: 'door_material', in: ['aluminium'] },
    },
    {
      code: 'glazing_double',
      stage: 'adder',
      priority: 20,
      basis: 'per_quantity',
      quantityCode: 'area_m2',
      rate: 30,
      currency: 'USD',
      condition: { group: 'glazing', in: ['double'] },
    },
    {
      code: 'custom_ral',
      stage: 'adder',
      priority: 30,
      basis: 'flat',
      amount: 45,
      currency: 'USD',
      condition: { group: 'finish_color', in: ['custom_ral'] },
    },
    {
      code: 'setup_fee',
      stage: 'adder',
      priority: 90,
      basis: 'flat',
      amount: 220,
      currency: 'USD',
      // Once per line. On 12 doors this is USD 220, not USD 2,640.
      applyPer: 'line',
      note: 'One-off tooling / setup per line',
    },
    {
      code: 'volume_discount_50',
      stage: 'discount',
      priority: 10,
      basis: 'percent',
      rate: -8,
      // Only expressible because '__qty' is in the condition scope.
      condition: { group: '__qty', op: '>=', value: 50 },
      note: 'Volume discount from 50 units',
    },
    {
      code: 'standard_margin',
      stage: 'margin',
      priority: 10,
      basis: 'percent',
      rate: 35,
      note: 'Standard margin',
    },
  ];

  let rulesCreated = 0;
  for (const rule of RULES) {
    const existing = await prisma.pricingRule.findFirst({
      where: { templateId: template.id, code: rule.code },
    });
    if (existing) continue;
    await prisma.pricingRule.create({
      data: { id: uuidv7(), ...rule, template: { connect: { id: template.id } } },
    });
    rulesCreated += 1;
  }

  console.log(
    `  configurator: ${GROUPS.length} option groups, template '${TEMPLATE.code}' with ${OPTIONS.length} options, ${DERIVED.length} derived, ${rulesCreated} new rules`,
  );
}
