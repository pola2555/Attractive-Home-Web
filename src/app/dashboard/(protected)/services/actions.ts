'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { slugify } from '@/lib/slug';
import { LOCALES, type Locale } from '@/i18n/config';

export type FormState = { error?: string };

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function nullableStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}
function nullableInt(value: string): number | null {
  if (value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const clash = await prisma.service.findUnique({ where: { slug: base }, select: { id: true } });
  if (!clash || clash.id === excludeId) return base;
  return `${base}-${uuidv7().slice(0, 8)}`;
}

function writeErrorMessage(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return 'That slug is already in use — choose a different one.';
  }
  throw err;
}

type TranslationRow = {
  localeCode: Locale;
  title: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

type Parsed = {
  slug: string;
  titleEn: string;
  mediaKey: string | null;
  mediaType: 'image' | 'video' | null;
  sortOrder: number;
  isPublished: boolean;
  translations: TranslationRow[];
};

function parseForm(fd: FormData): { ok: true; data: Parsed } | { ok: false; error: string } {
  const translations: TranslationRow[] = [];
  for (const locale of LOCALES) {
    const title = str(fd, `title_${locale}`);
    if (!title) continue;
    translations.push({
      localeCode: locale,
      title,
      description: nullableStr(fd, `description_${locale}`),
      metaTitle: nullableStr(fd, `metaTitle_${locale}`),
      metaDescription: nullableStr(fd, `metaDescription_${locale}`),
    });
  }
  const titleEn = translations.find((t) => t.localeCode === 'en')?.title ?? '';
  if (!titleEn) return { ok: false, error: 'An English title is required.' };

  const mediaKey = nullableStr(fd, 'mediaKey');
  const mediaType = mediaKey ? (str(fd, 'mediaType') === 'video' ? 'video' : 'image') : null;

  return {
    ok: true,
    data: {
      slug: slugify(str(fd, 'slug')) || slugify(titleEn),
      titleEn,
      mediaKey,
      mediaType,
      sortOrder: nullableInt(str(fd, 'sortOrder')) ?? 0,
      isPublished: fd.get('isPublished') === 'on',
      translations,
    },
  };
}

function translationData(serviceId: string, rows: TranslationRow[]) {
  return rows.map((t) => ({ id: uuidv7(), serviceId, ...t }));
}

export async function createService(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('content.write');
  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const { data } = parsed;

  const id = uuidv7();
  const slug = await uniqueSlug(data.slug || id);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.service.create({
        data: {
          id,
          slug,
          mediaKey: data.mediaKey,
          mediaType: data.mediaType,
          sortOrder: data.sortOrder,
          isPublished: data.isPublished,
        },
      });
      await tx.serviceTranslation.createMany({ data: translationData(id, data.translations) });
    });
  } catch (err) {
    return { error: writeErrorMessage(err) };
  }

  await writeAudit({
    userId: user.id,
    entityType: 'service',
    entityId: slug,
    action: 'create',
    diff: { slug: { from: null, to: slug }, title: { from: null, to: data.titleEn } },
  });
  revalidatePath('/dashboard/services');
  redirect('/dashboard/services');
}

export async function updateService(
  serviceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('content.write');
  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const { data } = parsed;

  const existing = await prisma.service.findUnique({ where: { id: serviceId }, select: { slug: true } });
  if (!existing) return { error: 'Service not found.' };
  const slug = data.slug === existing.slug ? existing.slug : await uniqueSlug(data.slug, serviceId);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.service.update({
        where: { id: serviceId },
        data: {
          slug,
          mediaKey: data.mediaKey,
          mediaType: data.mediaType,
          sortOrder: data.sortOrder,
          isPublished: data.isPublished,
        },
      });
      await tx.serviceTranslation.deleteMany({ where: { serviceId } });
      await tx.serviceTranslation.createMany({ data: translationData(serviceId, data.translations) });
    });
  } catch (err) {
    return { error: writeErrorMessage(err) };
  }

  await writeAudit({
    userId: user.id,
    entityType: 'service',
    entityId: existing.slug,
    action: 'update',
    diff: { slug: { from: existing.slug, to: slug } },
  });
  revalidatePath('/dashboard/services');
  redirect('/dashboard/services');
}

export async function toggleService(serviceId: string, next: boolean): Promise<void> {
  const user = await requirePermission('content.write');
  const s = await prisma.service.findUnique({ where: { id: serviceId }, select: { slug: true, isPublished: true } });
  if (!s) return;
  await prisma.service.update({ where: { id: serviceId }, data: { isPublished: next } });
  await writeAudit({
    userId: user.id,
    entityType: 'service',
    entityId: s.slug,
    action: 'update',
    diff: { is_published: { from: s.isPublished, to: next } },
  });
  revalidatePath('/dashboard/services');
}

export async function deleteService(serviceId: string): Promise<void> {
  const user = await requirePermission('content.write');
  const s = await prisma.service.findUnique({ where: { id: serviceId }, select: { slug: true } });
  if (!s) redirect('/dashboard/services');

  await prisma.service.delete({ where: { id: serviceId } });
  await writeAudit({
    userId: user.id,
    entityType: 'service',
    entityId: s.slug,
    action: 'delete',
    diff: { slug: { from: s.slug, to: null } },
  });
  revalidatePath('/dashboard/services');
  redirect('/dashboard/services');
}
