'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { LOCALES, type Locale } from '@/i18n/config';
import {
  isFacetType,
  createFacetValue,
  updateFacetValue,
  deleteFacetValue,
  setFacetActive,
  type FacetType,
  type FacetValueInput,
} from '@/lib/facetsAdmin';

export type FacetFormState = { error?: string };

function parseFacetForm(formData: FormData): { ok: true; data: FacetValueInput } | { ok: false; error: string } {
  const code = String(formData.get('code') ?? '').trim();
  if (!code) return { ok: false, error: 'A code is required.' };
  const nameEn = String(formData.get('name_en') ?? '').trim();
  if (!nameEn) return { ok: false, error: 'An English name is required.' };

  const names = {} as Record<Locale, string>;
  for (const l of LOCALES) names[l] = String(formData.get(`name_${l}`) ?? '').trim();

  const sortOrder = Math.trunc(Number(formData.get('sortOrder') ?? 0)) || 0;
  const isActive = formData.get('isActive') === 'on';
  const hexRaw = String(formData.get('hex') ?? '').trim();
  const hex = hexRaw && /^#[0-9a-fA-F]{6}$/.test(hexRaw) ? hexRaw : null;

  return { ok: true, data: { code, sortOrder, isActive, hex, names } };
}

function friendly(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return 'That code is already in use.';
  }
  return null;
}

export async function createFacet(
  facet: string,
  _prev: FacetFormState,
  formData: FormData,
): Promise<FacetFormState> {
  if (!isFacetType(facet)) return { error: 'Unknown facet.' };
  const user = await requirePermission('catalog.write');
  const parsed = parseFacetForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  try {
    await createFacetValue(facet, parsed.data);
  } catch (err) {
    const msg = friendly(err);
    if (msg) return { error: msg };
    throw err;
  }
  await writeAudit({
    userId: user.id,
    entityType: `facet.${facet}`,
    entityId: parsed.data.code,
    action: 'create',
    diff: { name: { from: null, to: parsed.data.names.en } },
  });
  revalidatePath(`/dashboard/facets/${facet}`);
  redirect(`/dashboard/facets/${facet}`);
}

export async function updateFacet(
  facet: string,
  id: string,
  _prev: FacetFormState,
  formData: FormData,
): Promise<FacetFormState> {
  if (!isFacetType(facet)) return { error: 'Unknown facet.' };
  const user = await requirePermission('catalog.write');
  const parsed = parseFacetForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  try {
    await updateFacetValue(facet, id, parsed.data);
  } catch (err) {
    const msg = friendly(err);
    if (msg) return { error: msg };
    throw err;
  }
  await writeAudit({
    userId: user.id,
    entityType: `facet.${facet}`,
    entityId: parsed.data.code,
    action: 'update',
    diff: { name: { from: null, to: parsed.data.names.en } },
  });
  revalidatePath(`/dashboard/facets/${facet}`);
  redirect(`/dashboard/facets/${facet}`);
}

export async function toggleFacet(facet: FacetType, id: string, next: boolean): Promise<void> {
  if (!isFacetType(facet)) return;
  await requirePermission('catalog.write');
  await setFacetActive(facet, id, next);
  revalidatePath(`/dashboard/facets/${facet}`);
}

export async function deleteFacet(facet: FacetType, id: string): Promise<void> {
  if (!isFacetType(facet)) return;
  const user = await requirePermission('catalog.write');
  let code: string;
  try {
    code = await deleteFacetValue(facet, id);
  } catch (err) {
    // In-use values can't be deleted (RESTRICT); deactivate instead.
    if (err instanceof Error && err.message === 'IN_USE') {
      redirect(`/dashboard/facets/${facet}?error=in-use`);
    }
    throw err;
  }
  await writeAudit({
    userId: user.id,
    entityType: `facet.${facet}`,
    entityId: code,
    action: 'delete',
    diff: { code: { from: code, to: null } },
  });
  revalidatePath(`/dashboard/facets/${facet}`);
  redirect(`/dashboard/facets/${facet}`);
}
