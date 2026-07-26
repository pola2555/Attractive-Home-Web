'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { slugify } from '@/lib/slug';
import { LOCALES, type Locale } from '@/i18n/config';

export type FormState = { error?: string };

// ---------------------------------------------------------------------------
// Shared field helpers
// ---------------------------------------------------------------------------

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

// Ensure a slug is unique across the target table; on collision append a short
// id chunk. The DB unique constraint remains the final backstop.
async function uniqueCategorySlug(base: string, excludeId?: string): Promise<string> {
  const clash = await prisma.portfolioCategory.findUnique({ where: { slug: base }, select: { id: true } });
  if (!clash || clash.id === excludeId) return base;
  return `${base}-${uuidv7().slice(0, 8)}`;
}
async function uniqueProjectSlug(base: string, excludeId?: string): Promise<string> {
  const clash = await prisma.project.findUnique({ where: { slug: base }, select: { id: true } });
  if (!clash || clash.id === excludeId) return base;
  return `${base}-${uuidv7().slice(0, 8)}`;
}

function writeErrorMessage(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return 'That slug is already in use — choose a different one.';
    if (err.code === 'P2003') return 'A referenced record no longer exists.';
  }
  throw err; // unexpected — let the framework surface it
}

// ===========================================================================
// CATEGORIES
// ===========================================================================

type CategoryTranslationRow = {
  localeCode: Locale;
  title: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

function parseCategoryForm(
  fd: FormData,
): { ok: true; data: { slug: string; sortOrder: number; isPublished: boolean; titleEn: string; translations: CategoryTranslationRow[] } } | { ok: false; error: string } {
  const translations: CategoryTranslationRow[] = [];
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

  const sortOrder = nullableInt(str(fd, 'sortOrder')) ?? 0;
  return {
    ok: true,
    data: {
      slug: slugify(str(fd, 'slug')) || slugify(titleEn),
      sortOrder,
      isPublished: fd.get('isPublished') === 'on',
      titleEn,
      translations,
    },
  };
}

function categoryTranslationData(portfolioCategoryId: string, rows: CategoryTranslationRow[]) {
  return rows.map((t) => ({ id: uuidv7(), portfolioCategoryId, ...t }));
}

export async function createCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('portfolio.write');
  const parsed = parseCategoryForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const { data } = parsed;

  const id = uuidv7();
  const slug = await uniqueCategorySlug(data.slug || id);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.portfolioCategory.create({
        data: { id, slug, sortOrder: data.sortOrder, isPublished: data.isPublished },
      });
      await tx.portfolioCategoryTranslation.createMany({
        data: categoryTranslationData(id, data.translations),
      });
    });
  } catch (err) {
    return { error: writeErrorMessage(err) };
  }

  await writeAudit({
    userId: user.id,
    entityType: 'portfolio_category',
    entityId: slug,
    action: 'create',
    diff: { slug: { from: null, to: slug }, title: { from: null, to: data.titleEn } },
  });
  revalidatePath('/dashboard/portfolio');
  redirect('/dashboard/portfolio');
}

export async function updateCategory(
  categoryId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('portfolio.write');
  const parsed = parseCategoryForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const { data } = parsed;

  const existing = await prisma.portfolioCategory.findUnique({
    where: { id: categoryId },
    select: { slug: true },
  });
  if (!existing) return { error: 'Category not found.' };
  const slug = data.slug === existing.slug ? existing.slug : await uniqueCategorySlug(data.slug, categoryId);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.portfolioCategory.update({
        where: { id: categoryId },
        data: { slug, sortOrder: data.sortOrder, isPublished: data.isPublished },
      });
      await tx.portfolioCategoryTranslation.deleteMany({ where: { portfolioCategoryId: categoryId } });
      await tx.portfolioCategoryTranslation.createMany({
        data: categoryTranslationData(categoryId, data.translations),
      });
    });
  } catch (err) {
    return { error: writeErrorMessage(err) };
  }

  await writeAudit({
    userId: user.id,
    entityType: 'portfolio_category',
    entityId: existing.slug,
    action: 'update',
    diff: { slug: { from: existing.slug, to: slug } },
  });
  revalidatePath('/dashboard/portfolio');
  redirect('/dashboard/portfolio');
}

export async function toggleCategory(categoryId: string, next: boolean): Promise<void> {
  const user = await requirePermission('portfolio.write');
  const cat = await prisma.portfolioCategory.findUnique({
    where: { id: categoryId },
    select: { slug: true, isPublished: true },
  });
  if (!cat) return;
  await prisma.portfolioCategory.update({ where: { id: categoryId }, data: { isPublished: next } });
  await writeAudit({
    userId: user.id,
    entityType: 'portfolio_category',
    entityId: cat.slug,
    action: 'update',
    diff: { is_published: { from: cat.isPublished, to: next } },
  });
  revalidatePath('/dashboard/portfolio');
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const user = await requirePermission('portfolio.write');
  const cat = await prisma.portfolioCategory.findUnique({
    where: { id: categoryId },
    select: { slug: true },
  });
  if (!cat) redirect('/dashboard/portfolio');

  try {
    // Project.categoryId is RESTRICT — a category with projects won't delete.
    await prisma.portfolioCategory.delete({ where: { id: categoryId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      redirect('/dashboard/portfolio?error=category-in-use');
    }
    throw err;
  }
  await writeAudit({
    userId: user.id,
    entityType: 'portfolio_category',
    entityId: cat.slug,
    action: 'delete',
    diff: { slug: { from: cat.slug, to: null } },
  });
  revalidatePath('/dashboard/portfolio');
  redirect('/dashboard/portfolio');
}

// ===========================================================================
// PROJECTS
// ===========================================================================

const coordSchema = z
  .object({
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
  })
  .refine((v) => (v.latitude === null) === (v.longitude === null), {
    message: 'Enter both latitude and longitude, or leave both blank.',
  });

type ProjectTranslationRow = {
  localeCode: Locale;
  title: string;
  areaLabel: string | null;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

type SectionRow = { id: string; sortOrder: number; names: Partial<Record<Locale, string>> };
type MediaRow = {
  mediaType: 'image' | 'video';
  s3Key: string;
  sectionId: string | null;
  alt: string | null;
  caption: string | null;
};

type ParsedProject = {
  slug: string;
  titleEn: string;
  categoryId: string;
  coverKey: string | null;
  coverType: 'image' | 'video' | null;
  latitude: number | null;
  longitude: number | null;
  sortOrder: number;
  isPublished: boolean;
  translations: ProjectTranslationRow[];
  sections: SectionRow[];
  media: MediaRow[];
};

function parseNumberOrNull(value: string): number | null {
  if (value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

function parseProjectForm(fd: FormData): { ok: true; data: ParsedProject } | { ok: false; error: string } {
  const categoryId = str(fd, 'categoryId');
  if (!UUID_RE.test(categoryId)) return { ok: false, error: 'A category is required.' };

  const translations: ProjectTranslationRow[] = [];
  for (const locale of LOCALES) {
    const title = str(fd, `title_${locale}`);
    if (!title) continue;
    translations.push({
      localeCode: locale,
      title,
      areaLabel: nullableStr(fd, `areaLabel_${locale}`),
      description: nullableStr(fd, `description_${locale}`),
      metaTitle: nullableStr(fd, `metaTitle_${locale}`),
      metaDescription: nullableStr(fd, `metaDescription_${locale}`),
    });
  }
  const titleEn = translations.find((t) => t.localeCode === 'en')?.title ?? '';
  if (!titleEn) return { ok: false, error: 'An English title is required.' };

  const coords = coordSchema.safeParse({
    latitude: parseNumberOrNull(str(fd, 'latitude')),
    longitude: parseNumberOrNull(str(fd, 'longitude')),
  });
  if (!coords.success) return { ok: false, error: coords.error.issues[0]?.message ?? 'Invalid coordinates.' };

  // Cover
  const coverKey = nullableStr(fd, 'coverKey');
  const coverTypeRaw = str(fd, 'coverType');
  const coverType = coverKey ? (coverTypeRaw === 'video' ? 'video' : 'image') : null;

  // Sections (client-serialised: [{ id, names:{en,…} }] in display order)
  let sections: SectionRow[] = [];
  try {
    const raw = JSON.parse(str(fd, 'sectionsJson') || '[]');
    if (Array.isArray(raw)) {
      sections = raw
        .map((r, i): SectionRow | null => {
          const rec = r as Record<string, unknown>;
          const id = typeof rec.id === 'string' && UUID_RE.test(rec.id) ? rec.id : null;
          const namesRaw = (rec.names ?? {}) as Record<string, unknown>;
          const en = typeof namesRaw.en === 'string' ? namesRaw.en.trim() : '';
          if (!id || !en) return null; // section name (en) is NOT NULL
          const names: Partial<Record<Locale, string>> = {};
          for (const locale of LOCALES) {
            const v = namesRaw[locale];
            if (typeof v === 'string' && v.trim()) names[locale] = v.trim();
          }
          return { id, sortOrder: i, names };
        })
        .filter((s): s is SectionRow => s !== null);
    }
  } catch {
    return { ok: false, error: 'Could not read the sections list.' };
  }
  const sectionIds = new Set(sections.map((s) => s.id));

  // Media (client-serialised: [{ mediaType, s3Key, sectionId, alt, caption }])
  let media: MediaRow[] = [];
  try {
    const raw = JSON.parse(str(fd, 'mediaJson') || '[]');
    if (Array.isArray(raw)) {
      media = raw
        .map((r): MediaRow | null => {
          const rec = r as Record<string, unknown>;
          const s3Key = typeof rec.s3Key === 'string' ? rec.s3Key.trim() : '';
          if (!s3Key) return null;
          const mediaType = rec.mediaType === 'video' ? 'video' : 'image';
          const sectionRaw = typeof rec.sectionId === 'string' ? rec.sectionId : '';
          const sectionId = sectionRaw && sectionIds.has(sectionRaw) ? sectionRaw : null;
          const alt = typeof rec.alt === 'string' && rec.alt.trim() ? rec.alt.trim() : null;
          const caption = typeof rec.caption === 'string' && rec.caption.trim() ? rec.caption.trim() : null;
          return { mediaType, s3Key, sectionId, alt, caption };
        })
        .filter((m): m is MediaRow => m !== null);
    }
  } catch {
    return { ok: false, error: 'Could not read the media list.' };
  }

  return {
    ok: true,
    data: {
      slug: slugify(str(fd, 'slug')) || slugify(titleEn),
      titleEn,
      categoryId,
      coverKey,
      coverType,
      latitude: coords.data.latitude,
      longitude: coords.data.longitude,
      sortOrder: nullableInt(str(fd, 'sortOrder')) ?? 0,
      isPublished: fd.get('isPublished') === 'on',
      translations,
      sections,
      media,
    },
  };
}

function projectTranslationData(projectId: string, rows: ProjectTranslationRow[]) {
  return rows.map((t) => ({ id: uuidv7(), projectId, ...t }));
}

// Rebuild the sections + media child graph for a project inside a transaction.
// Wholesale replace — the simplest correct diff; media is deleted before
// sections so no dangling FK, then recreated referencing the fresh section ids.
async function writeProjectChildren(
  tx: Prisma.TransactionClient,
  projectId: string,
  data: ParsedProject,
) {
  await tx.projectTranslation.deleteMany({ where: { projectId } });
  await tx.projectTranslation.createMany({ data: projectTranslationData(projectId, data.translations) });

  await tx.projectMedia.deleteMany({ where: { projectId } });
  await tx.projectSection.deleteMany({ where: { projectId } });

  for (const s of data.sections) {
    await tx.projectSection.create({ data: { id: s.id, projectId, sortOrder: s.sortOrder } });
    const names = LOCALES.map((locale) => ({ locale, name: s.names[locale] })).filter(
      (n): n is { locale: Locale; name: string } => Boolean(n.name),
    );
    if (names.length) {
      await tx.projectSectionTranslation.createMany({
        data: names.map((n) => ({ id: uuidv7(), projectSectionId: s.id, localeCode: n.locale, name: n.name })),
      });
    }
  }

  for (let i = 0; i < data.media.length; i++) {
    const m = data.media[i];
    const mediaId = uuidv7();
    await tx.projectMedia.create({
      data: {
        id: mediaId,
        projectId,
        sectionId: m.sectionId,
        mediaType: m.mediaType,
        baseKey: `dash_${uuidv7()}`,
        s3Key: m.s3Key,
        sortOrder: i,
      },
    });
    if (m.alt || m.caption) {
      await tx.projectMediaTranslation.create({
        data: { id: uuidv7(), projectMediaId: mediaId, localeCode: 'en', alt: m.alt, caption: m.caption },
      });
    }
  }
}

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('portfolio.write');
  const parsed = parseProjectForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const { data } = parsed;

  const id = uuidv7();
  const legacyId = `AHW-${id}`; // no legacy origin for dashboard-created projects
  const slug = await uniqueProjectSlug(data.slug || id);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.project.create({
        data: {
          id,
          legacyId,
          slug,
          categoryId: data.categoryId,
          coverKey: data.coverKey,
          coverType: data.coverType,
          latitude: data.latitude,
          longitude: data.longitude,
          sortOrder: data.sortOrder,
          isPublished: data.isPublished,
        },
      });
      await writeProjectChildren(tx, id, data);
    });
  } catch (err) {
    return { error: writeErrorMessage(err) };
  }

  await writeAudit({
    userId: user.id,
    entityType: 'project',
    entityId: legacyId,
    action: 'create',
    diff: { slug: { from: null, to: slug }, title: { from: null, to: data.titleEn } },
  });
  revalidatePath('/dashboard/portfolio/projects');
  redirect(`/dashboard/portfolio/projects/${id}/edit`);
}

export async function updateProject(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('portfolio.write');
  const parsed = parseProjectForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const { data } = parsed;

  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    select: { legacyId: true, slug: true },
  });
  if (!existing) return { error: 'Project not found.' };
  const slug = data.slug === existing.slug ? existing.slug : await uniqueProjectSlug(data.slug, projectId);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: {
          slug,
          categoryId: data.categoryId,
          coverKey: data.coverKey,
          coverType: data.coverType,
          latitude: data.latitude,
          longitude: data.longitude,
          sortOrder: data.sortOrder,
          isPublished: data.isPublished,
        },
      });
      await writeProjectChildren(tx, projectId, data);
    });
  } catch (err) {
    return { error: writeErrorMessage(err) };
  }

  await writeAudit({
    userId: user.id,
    entityType: 'project',
    entityId: existing.legacyId,
    action: 'update',
    diff: { slug: { from: existing.slug, to: slug } },
  });
  revalidatePath('/dashboard/portfolio/projects');
  redirect('/dashboard/portfolio/projects');
}

export async function toggleProject(projectId: string, next: boolean): Promise<void> {
  const user = await requirePermission('portfolio.write');
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { legacyId: true, isPublished: true },
  });
  if (!p) return;
  await prisma.project.update({ where: { id: projectId }, data: { isPublished: next } });
  await writeAudit({
    userId: user.id,
    entityType: 'project',
    entityId: p.legacyId,
    action: 'update',
    diff: { is_published: { from: p.isPublished, to: next } },
  });
  revalidatePath('/dashboard/portfolio/projects');
}

export async function deleteProject(projectId: string): Promise<void> {
  const user = await requirePermission('portfolio.write');
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { legacyId: true, slug: true },
  });
  if (!p) redirect('/dashboard/portfolio/projects');

  // Cascades translations/sections/media; leads.project_id is SET NULL.
  await prisma.project.delete({ where: { id: projectId } });
  await writeAudit({
    userId: user.id,
    entityType: 'project',
    entityId: p.legacyId,
    action: 'delete',
    diff: { slug: { from: p.slug, to: null } },
  });
  revalidatePath('/dashboard/portfolio/projects');
  redirect('/dashboard/portfolio/projects');
}
