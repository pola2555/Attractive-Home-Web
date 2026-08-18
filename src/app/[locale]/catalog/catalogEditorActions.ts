'use server';

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
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
