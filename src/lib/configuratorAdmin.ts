import 'server-only';
import { cache } from 'react';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import type {
  Condition,
  ConstraintDef,
  InputKind,
  NumericRange,
  OptionDef,
  PricingRuleDef,
  PricingStage,
  PricingBasis,
  ApplyPer,
  TemplateDef,
  UpgradeUnit,
} from './configurator/types';

// The bridge between Prisma rows and the pure engine in src/lib/configurator/.
//
// Everything crossing this boundary is normalised: Decimal becomes number, JSON
// becomes a typed Condition, and a missing translation falls back to the code.
// The engine never sees a Decimal, which is what lets it run in a plain
// `node --test` process with no database.
//
// The dashboard is English-only (it is excluded from the locale proxy), so
// labels resolve against 'en' with the raw code as the last resort.

const ADMIN_LOCALE = 'en';

function num(value: { toNumber(): number } | null | undefined): number | null {
  return value === null || value === undefined ? null : value.toNumber();
}

// JSON columns are `unknown` as far as the type system is concerned. Rather
// than trusting them, the engine treats a malformed condition as `pending`,
// which blocks rather than mispricing — so a shallow cast here is safe and a
// full runtime validation on every read would be wasted work.
function asCondition(value: unknown): Condition | null {
  return value && typeof value === 'object' ? (value as Condition) : null;
}

function asRanges(value: unknown): NumericRange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const row = raw as Record<string, unknown>;
    return [
      {
        condition: asCondition(row.condition),
        min: typeof row.min === 'number' ? row.min : null,
        max: typeof row.max === 'number' ? row.max : null,
        step: typeof row.step === 'number' ? row.step : null,
      },
    ];
  });
}

function asAttributes(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
  }
  return Object.keys(out).length ? out : null;
}

const templateInclude = {
  options: {
    orderBy: { sortOrder: 'asc' },
    include: {
      group: { include: { translations: { where: { localeCode: ADMIN_LOCALE } } } },
      defaultValue: { select: { code: true } },
      values: {
        orderBy: { sortOrder: 'asc' },
        include: {
          value: {
            include: {
              translations: { where: { localeCode: ADMIN_LOCALE } },
              color: { select: { hex: true } },
            },
          },
        },
      },
    },
  },
  constraints: { where: { isActive: true } },
  derivedQuantities: { orderBy: { sortOrder: 'asc' } },
  pricingRules: { where: { isActive: true } },
  variants: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      grid: {
        include: {
          // Axis ORDER is load-bearing: the cell key is built from it, and
          // reading the axes back in any other order silently misses every
          // cell in the grid.
          axes: {
            orderBy: { position: 'asc' },
            include: { templateOption: { include: { group: { select: { code: true } } } } },
          },
          cells: true,
        },
      },
    },
  },
  upgrades: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      variant: { select: { code: true } },
      tiers: { orderBy: { minQty: 'asc' } },
      effects: { include: { templateOption: { include: { group: { select: { code: true } } } } } },
    },
  },
  bands: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      variant: { select: { code: true } },
      templateOption: { include: { group: { select: { code: true } } } },
    },
  },
} satisfies Prisma.ConfigTemplateInclude;

type TemplateRow = Prisma.ConfigTemplateGetPayload<{ include: typeof templateInclude }>;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toTemplateDef(row: TemplateRow): TemplateDef {
  // Options carry a variant ID; the engine works in codes so it can be tested
  // and reasoned about without a database.
  const variantCodeById = new Map(row.variants.map((v) => [v.id, v.code]));

  const options: OptionDef[] = row.options.map((option) => ({
    id: option.id,
    groupCode: option.group.code,
    name: option.group.translations[0]?.name ?? option.group.code,
    helpText: option.group.translations[0]?.helpText ?? null,
    inputKind: option.group.inputKind as InputKind,
    unit: option.group.unit,
    sortOrder: option.sortOrder,
    isRequired: option.isRequired,
    defaultValueCode: option.defaultValue?.code ?? null,
    condition: asCondition(option.condition),
    ranges: asRanges(option.ranges),
    variantCode: variantCodeById.get(option.variantId ?? '') ?? null,
    configText: option.configText,
    values: option.values.map((join) => ({
      id: join.value.id,
      code: join.value.code,
      name: join.value.translations[0]?.name ?? join.value.code,
      numericValue: num(join.value.numericValue),
      attributes: asAttributes(join.value.attributes),
      colorHex: join.value.color?.hex ?? null,
      productId: join.value.productId,
      sortOrder: join.sortOrder,
      condition: asCondition(join.condition),
      configText: join.configText,
      imageUrl: join.imageUrl,
    })),
  }));

  const constraints: ConstraintDef[] = row.constraints.map((constraint) => ({
    id: constraint.id,
    code: constraint.code,
    kind: constraint.kind === 'require' ? 'require' : 'forbid',
    condition: asCondition(constraint.condition) ?? { all: [] },
    message: constraint.message,
  }));

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    currency: row.currency,
    hsCodeId: row.hsCodeId,
    options,
    constraints,
    derivedQuantities: row.derivedQuantities.map((q) => ({
      code: q.code,
      formula: q.formula,
      unit: q.unit,
      sortOrder: q.sortOrder,
    })),
    rules: row.pricingRules.map(toPricingRule),
    standardNote: row.standardNote,

    variants: row.variants.map((variant) => ({
      id: variant.id,
      code: variant.code,
      name: variant.name,
      includedSpec: variant.includedSpec,
      imageUrl: variant.imageUrl,
      sortOrder: variant.sortOrder,
      grid: variant.grid
        ? {
            id: variant.grid.id,
            currency: variant.grid.currency,
            axes: variant.grid.axes.map((axis) => axis.templateOption.group.code),
            // A cell with a NULL amount stays in the map as null — that is the
            // supplier's dash, and it is not the same fact as a missing key.
            cells: Object.fromEntries(
              variant.grid.cells.map((cell) => [cell.key, num(cell.amount)]),
            ),
          }
        : null,
    })),

    upgrades: row.upgrades.map((upgrade) => ({
      id: upgrade.id,
      code: upgrade.code,
      label: upgrade.label,
      detail: upgrade.detail,
      section: upgrade.section,
      kind: upgrade.kind === 'accessory' ? ('accessory' as const) : ('upgrade' as const),
      variantCode: upgrade.variant?.code ?? null,
      amount: upgrade.amount.toNumber(),
      unit: upgrade.unit as UpgradeUnit,
      quantityCode: upgrade.quantityCode,
      defaultQty: upgrade.defaultQty,
      minQty: upgrade.minQty,
      maxQty: upgrade.maxQty,
      productId: upgrade.productId,
      condition: asCondition(upgrade.condition),
      unavailableNote: upgrade.unavailableNote,
      tiers: upgrade.tiers.map((tier) => ({
        minQty: tier.minQty,
        unitAmount: tier.unitAmount.toNumber(),
      })),
      effects: upgrade.effects.map((effect) => ({
        kind:
          effect.kind === 'set'
            ? ('set' as const)
            : effect.kind === 'note'
              ? ('note' as const)
              : ('restrict' as const),
        groupCode: effect.templateOption?.group.code ?? null,
        valueCodes: asStringArray(effect.valueCodes),
        message: effect.message,
      })),
      sortOrder: upgrade.sortOrder,
    })),

    bands: row.bands.map((band) => ({
      id: band.id,
      code: band.code,
      label: band.label,
      groupCode: band.templateOption.group.code,
      variantCode: band.variant?.code ?? null,
      min: num(band.minValue),
      max: num(band.maxValue),
      amount: band.amount.toNumber(),
      sortOrder: band.sortOrder,
    })),
  };
}

export function toPricingRule(rule: {
  id: string;
  code: string;
  condition: unknown;
  stage: string;
  priority: number;
  basis: string;
  quantityCode: string | null;
  applyPer: string;
  amount: { toNumber(): number } | null;
  rate: { toNumber(): number } | null;
  currency: string | null;
}): PricingRuleDef {
  return {
    id: rule.id,
    code: rule.code,
    condition: asCondition(rule.condition),
    stage: rule.stage as PricingStage,
    priority: rule.priority,
    basis: rule.basis as PricingBasis,
    quantityCode: rule.quantityCode,
    applyPer: rule.applyPer as ApplyPer,
    amount: num(rule.amount),
    rate: num(rule.rate),
    currency: rule.currency,
  };
}

// Per-request cached: the quote assembly page resolves and prices on every
// keystroke, and re-reading the whole template graph each time would be silly.
export const getTemplate = cache(async (templateId: string): Promise<TemplateDef | null> => {
  const row = await prisma.configTemplate.findUnique({
    where: { id: templateId },
    include: templateInclude,
  });
  return row ? toTemplateDef(row) : null;
});

export const getTemplateByCode = cache(async (code: string): Promise<TemplateDef | null> => {
  const row = await prisma.configTemplate.findUnique({
    where: { code },
    include: templateInclude,
  });
  return row ? toTemplateDef(row) : null;
});

// Product-scoped rules layered over the template's. The engine applies these
// last, so a rule sharing a code with a template rule replaces it.
export async function getProductRules(productId: string): Promise<PricingRuleDef[]> {
  const rules = await prisma.pricingRule.findMany({
    where: { productId, isActive: true },
  });
  return rules.map(toPricingRule);
}

export type TemplateListRow = {
  id: string;
  code: string;
  name: string;
  currency: string;
  isActive: boolean;
  optionCount: number;
  ruleCount: number;
  productCount: number;
  updatedAt: Date;
};

export async function listTemplates(): Promise<TemplateListRow[]> {
  const rows = await prisma.configTemplate.findMany({
    orderBy: { code: 'asc' },
    include: {
      _count: { select: { options: true, pricingRules: true, products: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    currency: row.currency,
    isActive: row.isActive,
    optionCount: row._count.options,
    ruleCount: row._count.pricingRules,
    productCount: row._count.products,
    updatedAt: row.updatedAt,
  }));
}

export type OptionGroupRow = {
  id: string;
  code: string;
  name: string;
  inputKind: string;
  unit: string | null;
  sortOrder: number;
  isActive: boolean;
  valueCount: number;
  updatedAt: Date;
};

export async function listOptionGroups(): Promise<OptionGroupRow[]> {
  const rows = await prisma.optionGroup.findMany({
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    include: {
      translations: { where: { localeCode: ADMIN_LOCALE } },
      _count: { select: { values: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.translations[0]?.name ?? row.code,
    inputKind: row.inputKind,
    unit: row.unit,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    valueCount: row._count.values,
    updatedAt: row.updatedAt,
  }));
}

export type OptionValueRow = {
  id: string;
  code: string;
  name: string;
  numericValue: number | null;
  attributes: Record<string, number> | null;
  colorHex: string | null;
  productCode: string | null;
  sortOrder: number;
  isActive: boolean;
};

export async function getOptionGroupWithValues(groupId: string) {
  const row = await prisma.optionGroup.findUnique({
    where: { id: groupId },
    include: {
      translations: { where: { localeCode: ADMIN_LOCALE } },
      values: {
        orderBy: { sortOrder: 'asc' },
        include: {
          translations: { where: { localeCode: ADMIN_LOCALE } },
          color: { select: { hex: true } },
          product: { select: { code: true } },
        },
      },
    },
  });
  if (!row) return null;
  const values: OptionValueRow[] = row.values.map((value) => ({
    id: value.id,
    code: value.code,
    name: value.translations[0]?.name ?? value.code,
    numericValue: num(value.numericValue),
    attributes: asAttributes(value.attributes),
    colorHex: value.color?.hex ?? null,
    productCode: value.product?.code ?? null,
    sortOrder: value.sortOrder,
    isActive: value.isActive,
  }));
  return {
    id: row.id,
    code: row.code,
    name: row.translations[0]?.name ?? row.code,
    inputKind: row.inputKind,
    unit: row.unit,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    updatedAt: row.updatedAt,
    values,
  };
}
