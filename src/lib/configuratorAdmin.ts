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
} satisfies Prisma.ConfigTemplateInclude;

type TemplateRow = Prisma.ConfigTemplateGetPayload<{ include: typeof templateInclude }>;

function toTemplateDef(row: TemplateRow): TemplateDef {
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
