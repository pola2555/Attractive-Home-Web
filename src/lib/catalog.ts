import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { localeFilter } from './translate';

// Catalog querying — docs/DATABASE.md §5.
// Search: `code ILIKE '%q%' OR EXISTS(pt.name ILIKE '%q%')` — both
// trigram-indexed. Contextual facet counts: apply the active filters
// (excluding the facet's own) and GROUP BY per facet FK; join tables for the
// multi-valued facets.

export const CATALOG_PAGE_SIZE = 48; // default page size
export const PER_PAGE_OPTIONS = [48, 96, 150] as const;
export type CatalogSort = 'featured' | 'az';

// The nine sidebar facets of the old catalog UI. `size` filters the free-text
// size_label column (deliberately NOT a lookup — §5).
export const FACET_KEYS = [
  'type',
  'material',
  'look',
  'color',
  'application',
  'size',
  'collection',
  'brand',
  'source',
] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

// Each facet holds a SET of selected values: multiple values within one facet
// are OR'd (union); different facets are AND'd (intersection).
export type CatalogFilters = Partial<Record<FacetKey, string[]>> & {
  q?: string;
  page: number;
  sort: CatalogSort;
  perPage: number;
};

export function parseCatalogFilters(
  searchParams: Record<string, string | string[] | undefined>,
): CatalogFilters {
  const first = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  // A facet param may repeat (?type=a&type=b) or be comma-joined (?type=a,b).
  const many = (v: string | string[] | undefined): string[] => {
    const raw = Array.isArray(v) ? v : v != null ? [v] : [];
    const flat = raw
      .flatMap((s) => String(s).split(','))
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set(flat)).slice(0, 40); // dedupe + cap
  };

  const sort: CatalogSort = first(searchParams.sort) === 'az' ? 'az' : 'featured';
  const perPageRaw = Number(first(searchParams.perPage));
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(perPageRaw)
    ? perPageRaw
    : CATALOG_PAGE_SIZE;

  const filters: CatalogFilters = {
    page: Math.max(1, Number(first(searchParams.page)) || 1),
    sort,
    perPage,
  };
  const q = first(searchParams.q);
  if (q) filters.q = q.slice(0, 100);
  for (const key of FACET_KEYS) {
    const values = many(searchParams[key]);
    if (values.length) filters[key] = values;
  }
  return filters;
}

// Prisma WHERE for facet counts + the default (featured) listing.
// NOTE: `whereSql` below must mirror this — it's the raw-SQL twin used only for
// the name-sorted listing (Prisma can't ORDER BY a to-many translation field).
export function catalogWhere(
  filters: CatalogFilters,
  exclude?: FacetKey,
): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];
  if (filters.q) {
    and.push({
      OR: [
        { code: { contains: filters.q, mode: 'insensitive' } },
        { translations: { some: { name: { contains: filters.q, mode: 'insensitive' } } } },
      ],
    });
  }
  // Values within one facet are OR'd via `IN`; the facets are AND'd together.
  const facet = (key: FacetKey, clause: Prisma.ProductWhereInput) => {
    if (filters[key]?.length && exclude !== key) and.push(clause);
  };
  facet('type', { type: { code: { in: filters.type } } });
  facet('material', { material: { code: { in: filters.material } } });
  facet('look', { look: { code: { in: filters.look } } });
  facet('color', { color: { code: { in: filters.color } } });
  facet('collection', { collection: { code: { in: filters.collection } } });
  facet('brand', { brand: { code: { in: filters.brand } } });
  facet('source', { source: { code: { in: filters.source } } });
  facet('application', { applications: { some: { application: { code: { in: filters.application } } } } });
  facet('size', { sizeLabel: { in: filters.size } });
  return { isPublished: true, AND: and };
}

export type FacetValue = { code: string; name: string; count: number; hex?: string | null };

// One vocabulary's contextual values: DB order (sort_order), localized name
// via the [locale, en] fallback, count under the other active filters.
type VocabRow = { id: string; code: string; translations: { localeCode: string; name: string }[] };

function localizedName(row: VocabRow, locale: string): string {
  return (
    row.translations.find((t) => t.localeCode === locale)?.name ??
    row.translations.find((t) => t.localeCode === 'en')?.name ??
    row.code
  );
}

export async function facetValues(
  locale: string,
  filters: CatalogFilters,
): Promise<Record<FacetKey, FacetValue[]>> {
  const include = { translations: { where: localeFilter(locale) } };
  const orderBy = { sortOrder: 'asc' as const };

  const [types, materials, looks, colors, applications, collections, brands, sources] =
    await Promise.all([
      prisma.productType.findMany({ where: { isActive: true }, orderBy, include }),
      prisma.material.findMany({ where: { isActive: true }, orderBy, include }),
      prisma.look.findMany({ where: { isActive: true }, orderBy, include }),
      prisma.color.findMany({ where: { isActive: true }, orderBy, include }),
      prisma.application.findMany({ where: { isActive: true }, orderBy, include }),
      prisma.collection.findMany({ where: { isActive: true }, orderBy, include }),
      prisma.brand.findMany({ where: { isActive: true }, orderBy, include }),
      prisma.source.findMany({ where: { isActive: true }, orderBy, include }),
    ]);

  const fkCounts = async (
    key: FacetKey,
    field: 'typeId' | 'materialId' | 'lookId' | 'colorId' | 'collectionId' | 'brandId' | 'sourceId',
  ) => {
    const rows = await prisma.product.groupBy({
      by: [field],
      where: catalogWhere(filters, key),
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r[field], r._count._all]));
  };

  const [typeC, materialC, lookC, colorC, collectionC, brandC, sourceC] = await Promise.all([
    fkCounts('type', 'typeId'),
    fkCounts('material', 'materialId'),
    fkCounts('look', 'lookId'),
    fkCounts('color', 'colorId'),
    fkCounts('collection', 'collectionId'),
    fkCounts('brand', 'brandId'),
    fkCounts('source', 'sourceId'),
  ]);
  const applicationRows = await prisma.productApplication.groupBy({
    by: ['applicationId'],
    where: { product: catalogWhere(filters, 'application') },
    _count: { _all: true },
  });
  const applicationC = new Map(applicationRows.map((r) => [r.applicationId, r._count._all]));
  const sizeRows = await prisma.product.groupBy({
    by: ['sizeLabel'],
    where: { ...catalogWhere(filters, 'size'), sizeLabel: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { sizeLabel: 'desc' } },
    take: 40,
  });

  const project = (rows: VocabRow[], counts: Map<string | null, number>): FacetValue[] =>
    rows
      .map((row) => ({ code: row.code, name: localizedName(row, locale), count: counts.get(row.id) ?? 0 }))
      .filter((v) => v.count > 0);

  // Colours carry their hex so the sidebar can render real swatches.
  const colorValues: FacetValue[] = colors
    .map((row) => ({
      code: row.code,
      name: localizedName(row, locale),
      count: colorC.get(row.id) ?? 0,
      hex: row.hex,
    }))
    .filter((v) => v.count > 0);

  return {
    type: project(types, typeC),
    material: project(materials, materialC),
    look: project(looks, lookC),
    color: colorValues,
    application: project(applications, applicationC),
    size: sizeRows
      .filter((r) => r.sizeLabel)
      .map((r) => ({ code: r.sizeLabel as string, name: r.sizeLabel as string, count: r._count._all })),
    collection: project(collections, collectionC),
    brand: project(brands, brandC),
    source: project(sources, sourceC),
  };
}

// Shared shape for a catalog product card — brand/type/look/material/collection
// names for the tags + subline, colour hex for the dot.
export function productCardInclude(locale: string) {
  const named = {
    select: { translations: { where: localeFilter(locale), select: { localeCode: true, name: true } } },
  };
  return {
    translations: { where: localeFilter(locale) },
    images: { where: { sortOrder: 0 } },
    source: { select: { code: true } },
    brand: named,
    type: named,
    look: named,
    material: named,
    collection: named,
    color: { select: { code: true, hex: true } },
  } satisfies Prisma.ProductInclude;
}

export async function queryProducts(locale: string, filters: CatalogFilters) {
  const skip = (filters.page - 1) * filters.perPage;

  if (filters.sort === 'az') return queryProductsByName(locale, filters, skip);

  // Featured (default): curated rank first (Postgres sorts NULLs last for ASC,
  // so unranked products fall to the end), then legacy id for a stable order.
  const where = catalogWhere(filters);
  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ featuredRank: 'asc' }, { legacyId: 'asc' }],
      skip,
      take: filters.perPage,
      include: productCardInclude(locale),
    }),
  ]);
  return { total, products };
}

// Raw-SQL twin of `catalogWhere` — used ONLY for the name-sorted listing.
// Keep in lock-step with catalogWhere above. Values are parameterised.
function whereSql(filters: CatalogFilters): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`p.is_published = TRUE`];
  if (filters.q) {
    const like = `%${filters.q}%`;
    conds.push(
      Prisma.sql`(p.code ILIKE ${like} OR EXISTS (SELECT 1 FROM product_translations t WHERE t.product_id = p.id AND t.name ILIKE ${like}))`,
    );
  }
  if (filters.type?.length)
    conds.push(
      Prisma.sql`p.type_id IN (SELECT id FROM product_types WHERE code IN (${Prisma.join(filters.type)}))`,
    );
  if (filters.material?.length)
    conds.push(
      Prisma.sql`p.material_id IN (SELECT id FROM materials WHERE code IN (${Prisma.join(filters.material)}))`,
    );
  if (filters.look?.length)
    conds.push(Prisma.sql`p.look_id IN (SELECT id FROM looks WHERE code IN (${Prisma.join(filters.look)}))`);
  if (filters.color?.length)
    conds.push(Prisma.sql`p.color_id IN (SELECT id FROM colors WHERE code IN (${Prisma.join(filters.color)}))`);
  if (filters.collection?.length)
    conds.push(
      Prisma.sql`p.collection_id IN (SELECT id FROM collections WHERE code IN (${Prisma.join(filters.collection)}))`,
    );
  if (filters.brand?.length)
    conds.push(Prisma.sql`p.brand_id IN (SELECT id FROM brands WHERE code IN (${Prisma.join(filters.brand)}))`);
  if (filters.source?.length)
    conds.push(Prisma.sql`p.source_id IN (SELECT id FROM sources WHERE code IN (${Prisma.join(filters.source)}))`);
  if (filters.application?.length)
    conds.push(
      Prisma.sql`EXISTS (SELECT 1 FROM product_applications pa JOIN applications a ON a.id = pa.application_id WHERE pa.product_id = p.id AND a.code IN (${Prisma.join(filters.application)}))`,
    );
  if (filters.size?.length) conds.push(Prisma.sql`p.size_label IN (${Prisma.join(filters.size)})`);
  return Prisma.join(conds, ' AND ');
}

// Name sort — the DB does the COALESCE(locale, en, code) ordering + LIMIT so we
// only ever pull one page into Node (never the whole catalog).
async function queryProductsByName(locale: string, filters: CatalogFilters, skip: number) {
  const where = whereSql(filters);
  const totalRows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM products p WHERE ${where}`;
  const total = totalRows[0]?.count ?? 0;

  const idRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id
    FROM products p
    LEFT JOIN product_translations ptl ON ptl.product_id = p.id AND ptl.locale_code = ${locale}
    LEFT JOIN product_translations pten ON pten.product_id = p.id AND pten.locale_code = 'en'
    WHERE ${where}
    ORDER BY lower(coalesce(ptl.name, pten.name, p.code, p.legacy_id)) ASC, p.legacy_id ASC
    LIMIT ${filters.perPage} OFFSET ${skip}`;

  const ids = idRows.map((r) => r.id);
  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: productCardInclude(locale),
  });
  const byId = new Map(rows.map((p) => [p.id, p]));
  const products = ids.map((id) => byId.get(id)).filter((p): p is (typeof rows)[number] => Boolean(p));
  return { total, products };
}

// "Shop by" representative images — one image per facet value (the most
// featured published product carrying it). DISTINCT ON does the pick DB-side,
// so each query returns at most one row per value. Keyed by facet-value code
// to line up with facetValues().
export type RepImage = { s3Key: string; thumbKey: string | null; sourceCode: string };
type RepRow = { value: string; s3_key: string; thumb_key: string | null; source_code: string };

export async function shopRepImages(): Promise<{
  type: Map<string, RepImage>;
  look: Map<string, RepImage>;
  collection: Map<string, RepImage>;
  application: Map<string, RepImage>;
}> {
  const toMap = (rows: RepRow[]) =>
    new Map(
      rows.map((r) => [r.value, { s3Key: r.s3_key, thumbKey: r.thumb_key, sourceCode: r.source_code }]),
    );

  const [types, looks, collections, applications] = await Promise.all([
    prisma.$queryRaw<RepRow[]>`
      SELECT DISTINCT ON (t.code) t.code AS value, pi.s3_key, pi.thumb_key, s.code AS source_code
      FROM products p
      JOIN product_types t ON t.id = p.type_id
      JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
      JOIN sources s ON s.id = p.source_id
      WHERE p.is_published = TRUE
      ORDER BY t.code, p.featured_rank ASC NULLS LAST, p.legacy_id`,
    prisma.$queryRaw<RepRow[]>`
      SELECT DISTINCT ON (l.code) l.code AS value, pi.s3_key, pi.thumb_key, s.code AS source_code
      FROM products p
      JOIN looks l ON l.id = p.look_id
      JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
      JOIN sources s ON s.id = p.source_id
      WHERE p.is_published = TRUE
      ORDER BY l.code, p.featured_rank ASC NULLS LAST, p.legacy_id`,
    prisma.$queryRaw<RepRow[]>`
      SELECT DISTINCT ON (c.code) c.code AS value, pi.s3_key, pi.thumb_key, s.code AS source_code
      FROM products p
      JOIN collections c ON c.id = p.collection_id
      JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
      JOIN sources s ON s.id = p.source_id
      WHERE p.is_published = TRUE
      ORDER BY c.code, p.featured_rank ASC NULLS LAST, p.legacy_id`,
    prisma.$queryRaw<RepRow[]>`
      SELECT DISTINCT ON (a.code) a.code AS value, pi.s3_key, pi.thumb_key, s.code AS source_code
      FROM product_applications pa
      JOIN applications a ON a.id = pa.application_id
      JOIN products p ON p.id = pa.product_id AND p.is_published = TRUE
      JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
      JOIN sources s ON s.id = p.source_id
      ORDER BY a.code, p.featured_rank ASC NULLS LAST, p.legacy_id`,
  ]);

  return {
    type: toMap(types),
    look: toMap(looks),
    collection: toMap(collections),
    application: toMap(applications),
  };
}
