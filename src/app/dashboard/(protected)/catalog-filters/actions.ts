'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { CATALOG_FILTERS_KEY, catalogFiltersSchema, normalizeCatalogFilters } from '@/lib/catalogConfig';

export type FormState = { error?: string };

export async function updateCatalogFilters(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('catalog.write');

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get('configJson') ?? '[]'));
  } catch {
    return { error: 'Could not read the form data. Please try again.' };
  }
  const parsed = catalogFiltersSchema.safeParse(raw);
  if (!parsed.success) return { error: 'The filter configuration is invalid.' };

  // Normalize before storing so a missing/duplicate facet can never persist.
  const config = normalizeCatalogFilters(parsed.data);

  await prisma.setting.upsert({
    where: { key: CATALOG_FILTERS_KEY },
    update: { value: config as unknown as Prisma.InputJsonValue, updatedBy: user.id },
    create: { key: CATALOG_FILTERS_KEY, value: config as unknown as Prisma.InputJsonValue, updatedBy: user.id },
  });

  await writeAudit({
    userId: user.id,
    entityType: 'settings',
    entityId: CATALOG_FILTERS_KEY,
    action: 'update',
    diff: { order: { from: null, to: config.map((c) => `${c.facetKey}:${c.visible ? c.widget : 'hidden'}`).join(',') } },
  });

  revalidatePath('/dashboard/catalog-filters');
  revalidatePath('/', 'layout'); // catalog pages regenerate with the new sidebar
  redirect('/dashboard/catalog-filters?saved=1');
}
