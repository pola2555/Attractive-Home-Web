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
  PriceTreeNodeDef,
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

// Templates whose extras (upgrades, later sizes/accessories) are priced from the
// tree canvas rather than the legacy ConfigUpgrade/ConfigBand rows. A migration
// allowlist: a template is added here once its duplicate rows are retired, so a
// half-migrated product never shows both. Remove this gate once every template
// has moved over.
const CANVAS_EXTRAS_TEMPLATES = new Set<string>([
  'aluminum_frame',
  'kitchen_cabinet',
  'sliding_wardrobe',
  'tv_media_unit',
  'bathroom_vanity',
  'modular_bookshelf',
]);

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

// A colour node on the canvas carries a free-text name ("Marsha Grey"); the
// quote's colour option value carries a code ("marsha_grey"). This is the link
// between the two, so a colour's canvas attachments can decide the option
// value's availability.
function slugifyColour(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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
      // The decision-tree nodes: the base price (addonId = null) AND every
      // add-on's own option sub-tree (addonId set). Split apart in toTemplateDef.
      priceNodes: {
        orderBy: { sortOrder: 'asc' },
        include: { group: { select: { code: true } }, value: { select: { code: true } } },
      },
      // The canvas add-ons, loaded so the quote prices them straight from the
      // canvas — a single source of truth — reading each one's price and the
      // branches it is attached to, instead of a parallel table of rows.
      addons: {
        orderBy: { sortOrder: 'asc' },
        include: { attachments: { select: { baseNodeId: true } } },
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

  // A colour's availability is NOT hand-authored: it is read off the canvas,
  // from the base branches its colour node is attached to. For each colour node
  // we rebuild the root→node path of every branch it hangs on as a condition
  // (`thickness=45 AND edge=alu_silent`), OR them together, and gate the
  // matching colour option value by it. The value then shows exactly where the
  // canvas says the colour exists — one source of truth, the tree.
  const colourConditionByCode = new Map<string, Condition | null>();
  for (const variant of row.variants) {
    const baseNodes = variant.priceNodes.filter((n) => n.addonId === null);
    const nodeById = new Map(baseNodes.map((n) => [n.id, n]));
    const pathCondition = (nodeId: string): Condition | null => {
      const parts: Condition[] = [];
      let cur = nodeById.get(nodeId);
      let guard = 0;
      while (cur && guard++ <= nodeById.size) {
        parts.unshift({ in: [cur.value.code], group: cur.group.code });
        cur = cur.parentId ? nodeById.get(cur.parentId) : undefined;
      }
      if (parts.length === 0) return null;
      return parts.length === 1 ? parts[0] : { all: parts };
    };
    for (const addon of variant.addons) {
      if (!addon.colorHex) continue;
      const code = slugifyColour(addon.colorName ?? addon.name);
      let condition: Condition | null;
      if (addon.attachBase) {
        condition = null; // attached to the whole base price → always offered
      } else if (addon.attachments.length > 0) {
        const anchors = addon.attachments
          .map((a) => pathCondition(a.baseNodeId))
          .filter((c): c is Condition => c !== null);
        condition =
          anchors.length === 0 ? { any: [] } : anchors.length === 1 ? anchors[0] : { any: anchors };
      } else {
        condition = { any: [] }; // attached nowhere → never offered
      }
      // A colour offered on more than one variant is available on any of them.
      const existing = colourConditionByCode.get(code);
      if (existing === undefined) colourConditionByCode.set(code, condition);
      else if (existing === null || condition === null) colourConditionByCode.set(code, null);
      else colourConditionByCode.set(code, { any: [existing, condition] });
    }
  }

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
    values: option.values.map((join) => {
      // A colour value takes its availability from the canvas (above); any
      // other value keeps the condition stored on the row.
      const canvasColour = colourConditionByCode.get(join.value.code);
      return {
        id: join.value.id,
        code: join.value.code,
        name: join.value.translations[0]?.name ?? join.value.code,
        numericValue: num(join.value.numericValue),
        attributes: asAttributes(join.value.attributes),
        colorHex: join.value.color?.hex ?? null,
        productId: join.value.productId,
        sortOrder: join.sortOrder,
        condition: canvasColour !== undefined ? canvasColour : asCondition(join.condition),
        configText: join.configText,
        imageUrl: join.imageUrl,
      };
    }),
  }));

  const constraints: ConstraintDef[] = row.constraints.map((constraint) => ({
    id: constraint.id,
    code: constraint.code,
    kind: constraint.kind === 'require' ? 'require' : 'forbid',
    condition: asCondition(constraint.condition) ?? { all: [] },
    message: constraint.message,
  }));

  // A Json image column -> a clean list of URL strings; anything malformed -> [].
  const imageList = (json: unknown): string[] =>
    Array.isArray(json)
      ? json.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
      : [];

  const toTreeNode = (
    n: TemplateRow['variants'][number]['priceNodes'][number],
  ): PriceTreeNodeDef => ({
    id: n.id,
    parentId: n.parentId,
    groupCode: n.group.code,
    valueCode: n.value.code,
    amount: num(n.amount),
    sortOrder: n.sortOrder,
    priceUnit: n.priceUnit,
    images: imageList(n.images),
    multiSelect: n.multiSelect,
  });

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    currency: row.currency,
    hsCodeId: row.hsCodeId,
    extrasFromCanvas: CANVAS_EXTRAS_TEMPLATES.has(row.code),
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
      images: imageList(variant.images),
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
      // Base price nodes only; the add-on sub-trees ride on `addons` below.
      priceTree: variant.priceNodes.filter((n) => n.addonId === null).map(toTreeNode),
      addons: variant.addons.map((a) => ({
        id: a.id,
        name: a.name,
        amount: num(a.amount),
        priceUnit: a.priceUnit,
        colorHex: a.colorHex,
        attachBase: a.attachBase,
        attachedBaseNodeIds: a.attachments.map((x) => x.baseNodeId),
        nodes: variant.priceNodes.filter((n) => n.addonId === a.id).map(toTreeNode),
        sortOrder: a.sortOrder,
      })),
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
