import type { Selection, TemplateDef } from './types';

// The seeded "door" template, mirrored as a plain object so the engine tests
// run with no database. It is kept in step with prisma/seed/configurator.ts by
// the golden-sample test: if the seed changes shape, that test fails loudly
// rather than the two drifting apart quietly.

export function doorTemplate(): TemplateDef {
  return {
    id: 'tpl-door',
    code: 'door',
    name: 'Door (configurable)',
    currency: 'USD',
    options: [
      {
        id: 'o-type',
        groupCode: 'door_type',
        name: 'Door type',
        helpText: null,
        inputKind: 'select',
        unit: null,
        sortOrder: 1,
        isRequired: true,
        defaultValueCode: null,
        condition: null,
        ranges: [],
        values: [value('solid', 'Solid'), value('glazed', 'Glazed'), value('louvered', 'Louvered')],
      },
      {
        id: 'o-material',
        groupCode: 'door_material',
        name: 'Material',
        helpText: null,
        inputKind: 'select',
        unit: null,
        sortOrder: 2,
        isRequired: true,
        defaultValueCode: null,
        condition: null,
        ranges: [],
        values: [
          value('mdf', 'MDF', { attributes: { density: 750 } }),
          value('solid_oak', 'Solid oak', { attributes: { density: 700 } }),
          value('solid_walnut', 'Solid walnut', { attributes: { density: 660 } }),
          value('aluminium', 'Aluminium', { attributes: { density: 2700 } }),
        ],
      },
      {
        id: 'o-thickness',
        groupCode: 'thickness',
        name: 'Thickness',
        helpText: null,
        inputKind: 'number',
        unit: 'mm',
        sortOrder: 3,
        isRequired: true,
        defaultValueCode: null,
        condition: null,
        ranges: [
          {
            condition: { group: 'door_material', in: ['aluminium'] },
            min: 40,
            max: 80,
            step: 5,
          },
          { condition: null, min: 30, max: 60, step: 5 },
        ],
        values: [],
      },
      {
        id: 'o-height',
        groupCode: 'height',
        name: 'Height',
        helpText: null,
        inputKind: 'number',
        unit: 'mm',
        sortOrder: 4,
        isRequired: true,
        defaultValueCode: null,
        condition: null,
        ranges: [{ condition: null, min: 1800, max: 2400, step: 10 }],
        values: [],
      },
      {
        id: 'o-width',
        groupCode: 'width',
        name: 'Width',
        helpText: null,
        inputKind: 'number',
        unit: 'mm',
        sortOrder: 5,
        isRequired: true,
        defaultValueCode: null,
        condition: null,
        ranges: [
          { condition: { group: 'thickness', op: '<', value: 45 }, min: 600, max: 1200, step: 10 },
          { condition: null, min: 600, max: 1400, step: 10 },
        ],
        values: [],
      },
      {
        id: 'o-color',
        groupCode: 'finish_color',
        name: 'Finish / colour',
        helpText: null,
        inputKind: 'select',
        unit: null,
        sortOrder: 6,
        isRequired: true,
        defaultValueCode: null,
        condition: null,
        ranges: [],
        values: [
          value('natural', 'Natural'),
          value('walnut_stain', 'Walnut stain', {
            condition: { group: 'door_material', in: ['solid_oak', 'solid_walnut'] },
          }),
          value('white', 'White'),
          value('black', 'Black'),
          value('custom_ral', 'Custom RAL'),
        ],
      },
      {
        id: 'o-glazing',
        groupCode: 'glazing',
        name: 'Glazing',
        helpText: null,
        inputKind: 'select',
        unit: null,
        sortOrder: 7,
        isRequired: true,
        defaultValueCode: null,
        condition: { group: 'door_type', in: ['glazed'] },
        ranges: [],
        values: [
          value('single', 'Single glazed'),
          value('double', 'Double glazed'),
          value('frosted', 'Frosted'),
        ],
      },
      {
        id: 'o-accessories',
        groupCode: 'accessories',
        name: 'Accessories',
        helpText: null,
        inputKind: 'multi_select',
        unit: null,
        sortOrder: 8,
        isRequired: false,
        defaultValueCode: null,
        condition: null,
        ranges: [],
        values: [
          value('hinge', 'Concealed hinge'),
          value('handle', 'Lever handle'),
          value('closer', 'Door closer'),
          value('seal_kit', 'Acoustic seal kit'),
        ],
      },
    ],
    constraints: [
      {
        id: 'c-mdf',
        code: 'mdf_wide_thick',
        kind: 'forbid',
        condition: {
          all: [
            { group: 'door_material', in: ['mdf'] },
            { group: 'width', op: '>', value: 1200 },
            { group: 'thickness', op: '>=', value: 45 },
          ],
        },
        message: 'MDF is not available above 1200 mm wide at 45 mm or thicker.',
      },
    ],
    derivedQuantities: [
      { code: 'area_m2', formula: 'height * width / 1000000', unit: 'm2', sortOrder: 1 },
      { code: 'volume_m3', formula: 'area_m2 * thickness / 1000', unit: 'm3', sortOrder: 2 },
      {
        code: 'weight_kg',
        formula: 'volume_m3 * door_material_density',
        unit: 'kg',
        sortOrder: 3,
      },
    ],
    rules: [
      rule('panel_base', 'base', 10, 'per_quantity', { quantityCode: 'area_m2', rate: 42 }),
      rule('material_oak', 'adder', 10, 'per_quantity', {
        quantityCode: 'area_m2',
        rate: 65,
        condition: { group: 'door_material', in: ['solid_oak'] },
      }),
      rule('material_walnut', 'adder', 10, 'per_quantity', {
        quantityCode: 'area_m2',
        rate: 88,
        condition: { group: 'door_material', in: ['solid_walnut'] },
      }),
      rule('material_aluminium', 'adder', 10, 'per_quantity', {
        quantityCode: 'area_m2',
        rate: 55,
        condition: { group: 'door_material', in: ['aluminium'] },
      }),
      rule('glazing_double', 'adder', 20, 'per_quantity', {
        quantityCode: 'area_m2',
        rate: 30,
        condition: { group: 'glazing', in: ['double'] },
      }),
      rule('custom_ral', 'adder', 30, 'flat', {
        amount: 45,
        condition: { group: 'finish_color', in: ['custom_ral'] },
      }),
      rule('setup_fee', 'adder', 90, 'flat', { amount: 220, applyPer: 'line' }),
      rule('volume_discount_50', 'discount', 10, 'percent', {
        rate: -8,
        condition: { group: '__qty', op: '>=', value: 50 },
      }),
      rule('standard_margin', 'margin', 10, 'percent', { rate: 35 }),
    ],
  };
}

function value(
  code: string,
  name: string,
  extra: Partial<TemplateDef['options'][number]['values'][number]> = {},
): TemplateDef['options'][number]['values'][number] {
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

function rule(
  code: string,
  stage: TemplateDef['rules'][number]['stage'],
  priority: number,
  basis: TemplateDef['rules'][number]['basis'],
  extra: Partial<TemplateDef['rules'][number]> = {},
): TemplateDef['rules'][number] {
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

/** A complete, valid solid-oak door: 2100 x 900 x 45 mm. */
export function oakDoorSelection(): Selection {
  return {
    door_type: { groupCode: 'door_type', valueCodes: ['solid'], numericValue: null },
    door_material: { groupCode: 'door_material', valueCodes: ['solid_oak'], numericValue: null },
    thickness: { groupCode: 'thickness', valueCodes: [], numericValue: 45 },
    height: { groupCode: 'height', valueCodes: [], numericValue: 2100 },
    width: { groupCode: 'width', valueCodes: [], numericValue: 900 },
    finish_color: { groupCode: 'finish_color', valueCodes: ['natural'], numericValue: null },
  };
}

export function select(groupCode: string, ...valueCodes: string[]) {
  return { groupCode, valueCodes, numericValue: null };
}

export function number(groupCode: string, numericValue: number) {
  return { groupCode, valueCodes: [], numericValue };
}
