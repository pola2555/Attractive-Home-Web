'use server';

import { revalidatePath } from 'next/cache';
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
  moveFacetValue,
  type FacetType,
  type FacetValueInput,
} from '@/lib/facetsAdmin';

// Actions for the inline facet-values editor. Each returns a small result object
// (rather than redirecting) so the client table can update in place; the client
// calls router.refresh() to pull the re-validated server data.

export type InlineResult = { ok: boolean; error?: string };

export type FacetInlinePayload = {
  code: string;
  isActive: boolean;
  hex: string | null;
  names: Record<string, string>;
  sortOrder?: number;
};

function friendly(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return 'That code is already in use.';
  }
  return null;
}

function normalize(payload: FacetInlinePayload): { ok: true; data: FacetValueInput } | { ok: false; error: string } {
  const code = String(payload.code ?? '').trim();
  if (!code) return { ok: false, error: 'A code is required.' };
  const names = {} as Record<Locale, string>;
  for (const l of LOCALES) names[l] = String(payload.names?.[l] ?? '').trim();
  if (!names.en) return { ok: false, error: 'An English name is required.' };

  const hexRaw = String(payload.hex ?? '').trim();
  const hex = hexRaw && /^#[0-9a-fA-F]{6}$/.test(hexRaw) ? hexRaw : null;
  const sortOrder = Number.isFinite(payload.sortOrder) ? Math.trunc(Number(payload.sortOrder)) : 0;

  return { ok: true, data: { code, sortOrder, isActive: !!payload.isActive, hex, names } };
}

// Create (id === null) or update a facet value from the inline row.
export async function saveFacetInline(
  facet: string,
  id: string | null,
  payload: FacetInlinePayload,
): Promise<InlineResult> {
  if (!isFacetType(facet)) return { ok: false, error: 'Unknown facet.' };
  const user = await requirePermission('catalog.write');
  const parsed = normalize(payload);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    if (id) await updateFacetValue(facet, id, parsed.data);
    else await createFacetValue(facet, parsed.data);
  } catch (err) {
    const msg = friendly(err);
    if (msg) return { ok: false, error: msg };
    throw err;
  }
  await writeAudit({
    userId: user.id,
    entityType: `facet.${facet}`,
    entityId: parsed.data.code,
    action: id ? 'update' : 'create',
    diff: { name: { from: null, to: parsed.data.names.en } },
  });
  revalidatePath(`/dashboard/facets/${facet}`);
  return { ok: true };
}

export async function toggleFacet(facet: FacetType, id: string, next: boolean): Promise<InlineResult> {
  if (!isFacetType(facet)) return { ok: false, error: 'Unknown facet.' };
  await requirePermission('catalog.write');
  await setFacetActive(facet, id, next);
  revalidatePath(`/dashboard/facets/${facet}`);
  return { ok: true };
}

export async function moveFacetInline(facet: string, id: string, direction: 'up' | 'down'): Promise<InlineResult> {
  if (!isFacetType(facet)) return { ok: false, error: 'Unknown facet.' };
  await requirePermission('catalog.write');
  await moveFacetValue(facet, id, direction);
  revalidatePath(`/dashboard/facets/${facet}`);
  return { ok: true };
}

export async function deleteFacetInline(facet: string, id: string): Promise<InlineResult> {
  if (!isFacetType(facet)) return { ok: false, error: 'Unknown facet.' };
  const user = await requirePermission('catalog.write');
  let code: string;
  try {
    code = await deleteFacetValue(facet, id);
  } catch (err) {
    // In-use values can't be deleted (RESTRICT); hide them instead.
    if (err instanceof Error && err.message === 'IN_USE') {
      return { ok: false, error: 'That value is still used by products — hide it instead of deleting.' };
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
  return { ok: true };
}
