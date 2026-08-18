import 'server-only';
import { uuidv7 } from 'uuidv7';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { LOCALES, type Locale } from '@/i18n/config';

// Generic admin for the ten identically-shaped facet lookups (docs/DATABASE.md
// §5). Each is (id, code UNIQUE, sort_order, is_active, +hex on colours) with a
// companion *_translations(name) table and a `products` relation for usage
// counts. A small typed delegate lets one code path drive all ten.

export const FACET_TYPES = [
  'types',
  'materials',
  'looks',
  'colors',
  'finishes',
  'collections',
  'brands',
  'sources',
  'applications',
  'performance',
] as const;
export type FacetType = (typeof FACET_TYPES)[number];

export function isFacetType(v: string | undefined): v is FacetType {
  return !!v && (FACET_TYPES as readonly string[]).includes(v);
}

type Translation = { localeCode: string; name: string };
type FacetValueRow = {
  id: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
  hex?: string | null;
  translations: Translation[];
  _count: { products: number };
};

interface FacetDelegate {
  findMany(args: {
    orderBy: Array<Record<string, 'asc' | 'desc'>>;
    include: Record<string, unknown>;
  }): Promise<FacetValueRow[]>;
  findUnique(args: { where: { id: string }; include: Record<string, unknown> }): Promise<FacetValueRow | null>;
  create(args: { data: Record<string, unknown> }): Promise<{ id: string; code: string }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  delete(args: { where: { id: string } }): Promise<{ code: string }>;
  count(): Promise<number>;
}
interface TranslationDelegate {
  deleteMany(args: { where: Record<string, unknown> }): Promise<unknown>;
  createMany(args: { data: Record<string, unknown>[] }): Promise<unknown>;
}

type Reg = {
  model: FacetDelegate;
  tModel: TranslationDelegate;
  fk: string;
  label: string;
  singular: string;
  hasHex: boolean;
};

const d = <T>(delegate: T) => delegate as unknown as FacetDelegate;
const td = <T>(delegate: T) => delegate as unknown as TranslationDelegate;

const REGISTRY: Record<FacetType, Reg> = {
  types: { model: d(prisma.productType), tModel: td(prisma.productTypeTranslation), fk: 'productTypeId', label: 'Types', singular: 'Type', hasHex: false },
  materials: { model: d(prisma.material), tModel: td(prisma.materialTranslation), fk: 'materialId', label: 'Materials', singular: 'Material', hasHex: false },
  looks: { model: d(prisma.look), tModel: td(prisma.lookTranslation), fk: 'lookId', label: 'Looks', singular: 'Look', hasHex: false },
  colors: { model: d(prisma.color), tModel: td(prisma.colorTranslation), fk: 'colorId', label: 'Colours', singular: 'Colour', hasHex: true },
  finishes: { model: d(prisma.finish), tModel: td(prisma.finishTranslation), fk: 'finishId', label: 'Finishes', singular: 'Finish', hasHex: false },
  collections: { model: d(prisma.collection), tModel: td(prisma.collectionTranslation), fk: 'collectionId', label: 'Collections', singular: 'Collection', hasHex: false },
  brands: { model: d(prisma.brand), tModel: td(prisma.brandTranslation), fk: 'brandId', label: 'Brands', singular: 'Brand', hasHex: false },
  sources: { model: d(prisma.source), tModel: td(prisma.sourceTranslation), fk: 'sourceId', label: 'Sources', singular: 'Source', hasHex: false },
  applications: { model: d(prisma.application), tModel: td(prisma.applicationTranslation), fk: 'applicationId', label: 'Applications', singular: 'Application', hasHex: false },
  performance: { model: d(prisma.performanceAttribute), tModel: td(prisma.performanceAttributeTranslation), fk: 'performanceAttributeId', label: 'Performance attributes', singular: 'Performance attribute', hasHex: false },
};

export const facetLabel = (t: FacetType) => REGISTRY[t].label;
export const facetSingular = (t: FacetType) => REGISTRY[t].singular;
export const facetHasHex = (t: FacetType) => REGISTRY[t].hasHex;

export type FacetValue = {
  id: string;
  code: string;
  name: string; // English name (or code) — for display
  names: Record<Locale, string>; // every locale — for inline editing
  sortOrder: number;
  isActive: boolean;
  hex: string | null;
  uses: number;
};

const listInclude = {
  translations: { select: { localeCode: true, name: true } },
  _count: { select: { products: true } },
};

export async function listFacetValues(type: FacetType): Promise<FacetValue[]> {
  const { model, hasHex } = REGISTRY[type];
  const rows = await model.findMany({
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    include: listInclude,
  });
  return rows.map((r) => {
    const names = {} as Record<Locale, string>;
    for (const l of LOCALES) names[l] = r.translations.find((t) => t.localeCode === l)?.name ?? '';
    return {
      id: r.id,
      code: r.code,
      name: names.en || r.code,
      names,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      hex: hasHex ? (r.hex ?? null) : null,
      uses: r._count.products,
    };
  });
}

// Reorder: move a value one slot up/down and re-number the whole list 0..n-1 in
// the new order. Re-numbering (rather than swapping two rows) makes reordering
// reliable even when the imported values all share sort_order 0.
export async function moveFacetValue(type: FacetType, id: string, direction: 'up' | 'down'): Promise<void> {
  const { model } = REGISTRY[type];
  const rows = await model.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }], include: listInclude });
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return;
  const ordered = [...rows];
  const [moved] = ordered.splice(idx, 1);
  ordered.splice(swapIdx, 0, moved);
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].sortOrder !== i) await model.update({ where: { id: ordered[i].id }, data: { sortOrder: i } });
  }
}

// Value counts for the overview (parallel).
export async function facetCounts(): Promise<Record<FacetType, number>> {
  const entries = await Promise.all(
    FACET_TYPES.map(async (t) => [t, await REGISTRY[t].model.count()] as const),
  );
  return Object.fromEntries(entries) as Record<FacetType, number>;
}

export type FacetValueEdit = {
  id: string;
  code: string;
  sortOrder: string;
  isActive: boolean;
  hex: string;
  names: Record<Locale, string>;
};

export async function getFacetValue(type: FacetType, id: string): Promise<FacetValueEdit | null> {
  const row = await REGISTRY[type].model.findUnique({ where: { id }, include: { translations: true } });
  if (!row) return null;
  const names = {} as Record<Locale, string>;
  for (const l of LOCALES) names[l] = row.translations.find((t) => t.localeCode === l)?.name ?? '';
  return {
    id: row.id,
    code: row.code,
    sortOrder: String(row.sortOrder),
    isActive: row.isActive,
    hex: row.hex ?? '',
    names,
  };
}

export type FacetValueInput = {
  code: string;
  sortOrder: number;
  isActive: boolean;
  hex: string | null;
  names: Record<Locale, string>;
};

function translationRows(names: Record<Locale, string>, extra: Record<string, unknown> = {}) {
  return LOCALES.filter((l) => names[l]?.trim()).map((l) => ({
    id: uuidv7(),
    localeCode: l,
    name: names[l].trim(),
    ...extra,
  }));
}

export async function createFacetValue(type: FacetType, data: FacetValueInput): Promise<string> {
  const { model, hasHex } = REGISTRY[type];
  const id = uuidv7();
  await model.create({
    data: {
      id,
      code: data.code,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
      ...(hasHex ? { hex: data.hex } : {}),
      translations: { create: translationRows(data.names) },
    },
  });
  return id;
}

export async function updateFacetValue(type: FacetType, id: string, data: FacetValueInput): Promise<void> {
  const { model, tModel, fk, hasHex } = REGISTRY[type];
  await model.update({
    where: { id },
    data: {
      code: data.code,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
      ...(hasHex ? { hex: data.hex } : {}),
    },
  });
  await tModel.deleteMany({ where: { [fk]: id } });
  const rows = translationRows(data.names, { [fk]: id });
  if (rows.length) await tModel.createMany({ data: rows });
}

export async function setFacetActive(type: FacetType, id: string, isActive: boolean): Promise<void> {
  await REGISTRY[type].model.update({ where: { id }, data: { isActive } });
}

// Returns the deleted value's code (for audit), or throws a tagged error if the
// value is still referenced by products (RESTRICT relations).
export async function deleteFacetValue(type: FacetType, id: string): Promise<string> {
  try {
    const row = await REGISTRY[type].model.delete({ where: { id } });
    return row.code;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new Error('IN_USE');
    }
    throw err;
  }
}
