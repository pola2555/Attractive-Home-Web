'use server';

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { productMediaUrl } from '@/lib/media';
import {
  CATALOG_FILTERS_KEY,
  catalogFiltersSchema,
  normalizeCatalogFilters,
  type CatalogFilterEntry,
} from '@/lib/catalogConfig';
import {
  SHOPBY_KEY,
  shopBySchema,
  normalizeShopBy,
  type ShopBySection,
} from '@/lib/catalogShopByConfig';
import {
  BRANDSHOP_KEY,
  brandShopSchema,
  normalizeBrandShop,
  type BrandRow,
} from '@/lib/catalogBrandShopConfig';

// Server action behind the in-context catalog editor. Same persistence as the
// dashboard Catalog-filters screen (settings['catalog.filters']), but callable
// from the public catalog page — guarded by the STAFF session + catalog.write,
// so only dashboard-capable users can save. Returns a result (no redirect) so
// the on-page editor can stay put and just refresh.

export type SaveResult = { ok: boolean; error?: string };

export async function saveCatalogFilterConfig(config: CatalogFilterEntry[]): Promise<SaveResult> {
  const user = await requirePermission('catalog.write');

  const parsed = catalogFiltersSchema.safeParse(config);
  if (!parsed.success) return { ok: false, error: 'The filter configuration is invalid.' };
  const normalized = normalizeCatalogFilters(parsed.data);

  await prisma.setting.upsert({
    where: { key: CATALOG_FILTERS_KEY },
    update: { value: normalized as unknown as Prisma.InputJsonValue, updatedBy: user.id },
    create: { key: CATALOG_FILTERS_KEY, value: normalized as unknown as Prisma.InputJsonValue, updatedBy: user.id },
  });

  await writeAudit({
    userId: user.id,
    entityType: 'settings',
    entityId: CATALOG_FILTERS_KEY,
    action: 'update',
    diff: {
      order: {
        from: null,
        to: normalized.map((c) => `${c.facetKey}:${c.visible ? c.widget : 'hidden'}`).join(','),
      },
    },
  });

  revalidatePath('/', 'layout'); // catalog pages regenerate with the new sidebar
  return { ok: true };
}

// Product search for the Shop-by "pick a product" flow (staff-only). Returns a
// small, serialisable result set with a thumbnail for each match.
export type PickResult = { id: string; name: string; code: string | null; thumb: string | null };

export async function searchProductsForPick(q: string): Promise<PickResult[]> {
  await requirePermission('catalog.write');
  const term = q.trim();
  if (term.length < 2) return [];

  const rows = await prisma.product.findMany({
    where: {
      isPublished: true,
      OR: [
        { code: { contains: term, mode: 'insensitive' } },
        { translations: { some: { name: { contains: term, mode: 'insensitive' } } } },
      ],
    },
    take: 24,
    orderBy: { featuredRank: 'asc' },
    select: {
      id: true,
      code: true,
      translations: { where: { localeCode: 'en' }, select: { name: true } },
      source: { select: { code: true } },
      images: { where: { sortOrder: 0 }, take: 1, select: { s3Key: true, thumbKey: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.translations[0]?.name ?? r.code ?? '',
    code: r.code,
    thumb: r.images[0] ? productMediaUrl(r.images[0].thumbKey ?? r.images[0].s3Key, r.source.code) : null,
  }));
}

// Products that carry a given Shop-by facet value (by CODE), as image cards for
// the cover-picker. Pre-populated when the picker opens (no search needed); `q`
// optionally narrows within the facet value. Staff-only.
const SHOP_PRODUCT_WHERE: Record<string, (code: string) => Prisma.ProductWhereInput> = {
  type: (code) => ({ type: { code } }),
  look: (code) => ({ look: { code } }),
  collection: (code) => ({ collection: { code } }),
  application: (code) => ({ applications: { some: { application: { code } } } }),
  color: (code) => ({ color: { code } }),
};

export async function shopPickProducts(
  sectionKey: string,
  valueCode: string,
  q?: string,
): Promise<PickResult[]> {
  await requirePermission('catalog.write');
  const build = SHOP_PRODUCT_WHERE[sectionKey];
  if (!build || !valueCode) return [];

  const and: Prisma.ProductWhereInput[] = [{ isPublished: true }, build(valueCode)];
  const term = (q ?? '').trim();
  if (term) {
    and.push({
      OR: [
        { code: { contains: term, mode: 'insensitive' } },
        { translations: { some: { name: { contains: term, mode: 'insensitive' } } } },
      ],
    });
  }

  const rows = await prisma.product.findMany({
    where: { AND: and },
    take: 60,
    orderBy: [{ featuredRank: 'asc' }, { legacyId: 'asc' }],
    select: {
      id: true,
      code: true,
      translations: { where: { localeCode: 'en' }, select: { name: true } },
      source: { select: { code: true } },
      images: { where: { sortOrder: 0 }, take: 1, select: { s3Key: true, thumbKey: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.translations[0]?.name ?? r.code ?? '',
    code: r.code,
    thumb: r.images[0] ? productMediaUrl(r.images[0].thumbKey ?? r.images[0].s3Key, r.source.code) : null,
  }));
}

export async function saveShopByConfig(sections: ShopBySection[]): Promise<SaveResult> {
  const user = await requirePermission('catalog.write');

  const parsed = shopBySchema.safeParse(sections);
  if (!parsed.success) return { ok: false, error: 'The Shop-by configuration is invalid.' };
  const normalized = normalizeShopBy(parsed.data);

  await prisma.setting.upsert({
    where: { key: SHOPBY_KEY },
    update: { value: normalized as unknown as Prisma.InputJsonValue, updatedBy: user.id },
    create: { key: SHOPBY_KEY, value: normalized as unknown as Prisma.InputJsonValue, updatedBy: user.id },
  });

  await writeAudit({
    userId: user.id,
    entityType: 'settings',
    entityId: SHOPBY_KEY,
    action: 'update',
    diff: {
      shopby: {
        from: null,
        to: normalized.map((s) => `${s.key}:${s.visible ? s.limit : 'hidden'}`).join(','),
      },
    },
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function saveBrandShopConfig(rows: BrandRow[]): Promise<SaveResult> {
  const user = await requirePermission('catalog.write');

  const parsed = brandShopSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: 'The Shop-by-brand configuration is invalid.' };
  const normalized = normalizeBrandShop(parsed.data);

  await prisma.setting.upsert({
    where: { key: BRANDSHOP_KEY },
    update: { value: normalized as unknown as Prisma.InputJsonValue, updatedBy: user.id },
    create: { key: BRANDSHOP_KEY, value: normalized as unknown as Prisma.InputJsonValue, updatedBy: user.id },
  });

  await writeAudit({
    userId: user.id,
    entityType: 'settings',
    entityId: BRANDSHOP_KEY,
    action: 'update',
    diff: {
      shopbybrand: {
        from: null,
        to: normalized.map((r) => `${r.key}:${r.visible ? r.limit : 'hidden'}`).join(','),
      },
    },
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}
