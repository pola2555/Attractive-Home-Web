import 'server-only';
import { prisma } from './prisma';
import { siteMediaUrl } from './media';
import { LOCALES, type Locale } from '@/i18n/config';

// Admin-side portfolio helpers (dashboard is English-only). Kept separate from
// the public `portfolio.ts` so the read-optimised public query paths stay lean.
// Projects live in the site bucket, so siteMediaUrl() resolves every key.

const EN = { where: { localeCode: 'en' as const }, select: { title: true } } as const;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type CategoryRow = {
  id: string;
  slug: string;
  legacyKey: string | null;
  title: string;
  sortOrder: number;
  isPublished: boolean;
  projectCount: number;
};

export async function listCategories(): Promise<CategoryRow[]> {
  const rows = await prisma.portfolioCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    include: { translations: EN, _count: { select: { projects: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    legacyKey: c.legacyKey,
    title: c.translations[0]?.title ?? c.slug,
    sortOrder: c.sortOrder,
    isPublished: c.isPublished,
    projectCount: c._count.projects,
  }));
}

// id + label for the project form's category dropdown.
export async function categoryOptions(): Promise<{ id: string; title: string }[]> {
  const rows = await prisma.portfolioCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    include: { translations: EN },
  });
  return rows.map((c) => ({ id: c.id, title: c.translations[0]?.title ?? c.slug }));
}

export type CategoryTranslationInput = {
  title: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
};

export type CategoryFormInitial = {
  id: string;
  slug: string;
  sortOrder: string;
  isPublished: boolean;
  translations: Record<Locale, CategoryTranslationInput>;
};

const EMPTY_CATEGORY_T: CategoryTranslationInput = {
  title: '',
  description: '',
  metaTitle: '',
  metaDescription: '',
};

export async function getCategoryForEdit(id: string): Promise<CategoryFormInitial | null> {
  const c = await prisma.portfolioCategory.findUnique({
    where: { id },
    include: { translations: true },
  });
  if (!c) return null;

  const translations = {} as Record<Locale, CategoryTranslationInput>;
  for (const locale of LOCALES) {
    const row = c.translations.find((t) => t.localeCode === locale);
    translations[locale] = row
      ? {
          title: row.title,
          description: row.description ?? '',
          metaTitle: row.metaTitle ?? '',
          metaDescription: row.metaDescription ?? '',
        }
      : { ...EMPTY_CATEGORY_T };
  }

  return {
    id: c.id,
    slug: c.slug,
    sortOrder: String(c.sortOrder),
    isPublished: c.isPublished,
    translations,
  };
}

// ---------------------------------------------------------------------------
// Projects — list
// ---------------------------------------------------------------------------

export type ProjectRow = {
  id: string;
  slug: string;
  title: string;
  categoryTitle: string;
  coverUrl: string | null;
  hasCoords: boolean;
  sortOrder: number;
  isPublished: boolean;
};

export async function listProjects(opts: {
  q?: string;
  categoryId?: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: ProjectRow[]; total: number }> {
  const where = {
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.q
      ? {
          OR: [
            { slug: { contains: opts.q, mode: 'insensitive' as const } },
            { legacyId: { contains: opts.q, mode: 'insensitive' as const } },
            { translations: { some: { title: { contains: opts.q, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  };

  const [total, projects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: {
        translations: EN,
        category: { include: { translations: EN } },
      },
    }),
  ]);

  const rows: ProjectRow[] = projects.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.translations[0]?.title ?? p.slug,
    categoryTitle: p.category.translations[0]?.title ?? p.category.slug,
    coverUrl: p.coverKey ? siteMediaUrl(p.coverKey) : null,
    hasCoords: p.latitude !== null && p.longitude !== null,
    sortOrder: p.sortOrder,
    isPublished: p.isPublished,
  }));
  return { rows, total };
}

// ---------------------------------------------------------------------------
// Projects — edit form initial
// ---------------------------------------------------------------------------

export type ProjectTranslationInput = {
  title: string;
  areaLabel: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
};

export type SectionInput = {
  id: string;
  sortOrder: number;
  names: Record<Locale, string>;
};

export type ProjectMediaInput = {
  mediaType: 'image' | 'video';
  s3Key: string;
  sectionId: string; // '' = Other tab
  alt: string;
  caption: string;
  url: string; // resolved preview URL
};

export type ProjectFormInitial = {
  id: string;
  legacyId: string;
  slug: string;
  categoryId: string;
  coverKey: string;
  coverType: 'image' | 'video' | '';
  coverUrl: string | null;
  latitude: string;
  longitude: string;
  sortOrder: string;
  isPublished: boolean;
  translations: Record<Locale, ProjectTranslationInput>;
  sections: SectionInput[];
  media: ProjectMediaInput[];
};

const EMPTY_PROJECT_T: ProjectTranslationInput = {
  title: '',
  areaLabel: '',
  description: '',
  metaTitle: '',
  metaDescription: '',
};

export async function getProjectForEdit(id: string): Promise<ProjectFormInitial | null> {
  const p = await prisma.project.findUnique({
    where: { id },
    include: {
      translations: true,
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: { translations: true },
      },
      media: {
        orderBy: { sortOrder: 'asc' },
        include: { translations: { where: { localeCode: 'en' } } },
      },
    },
  });
  if (!p) return null;

  const translations = {} as Record<Locale, ProjectTranslationInput>;
  for (const locale of LOCALES) {
    const row = p.translations.find((t) => t.localeCode === locale);
    translations[locale] = row
      ? {
          title: row.title,
          areaLabel: row.areaLabel ?? '',
          description: row.description ?? '',
          metaTitle: row.metaTitle ?? '',
          metaDescription: row.metaDescription ?? '',
        }
      : { ...EMPTY_PROJECT_T };
  }

  const sections: SectionInput[] = p.sections.map((s) => {
    const names = {} as Record<Locale, string>;
    for (const locale of LOCALES) {
      names[locale] = s.translations.find((t) => t.localeCode === locale)?.name ?? '';
    }
    return { id: s.id, sortOrder: s.sortOrder, names };
  });

  const media: ProjectMediaInput[] = p.media.map((m) => ({
    mediaType: m.mediaType,
    s3Key: m.s3Key,
    sectionId: m.sectionId ?? '',
    alt: m.translations[0]?.alt ?? '',
    caption: m.translations[0]?.caption ?? '',
    url: siteMediaUrl(m.s3Key),
  }));

  return {
    id: p.id,
    legacyId: p.legacyId,
    slug: p.slug,
    categoryId: p.categoryId,
    coverKey: p.coverKey ?? '',
    coverType: p.coverType ?? '',
    coverUrl: p.coverKey ? siteMediaUrl(p.coverKey) : null,
    latitude: p.latitude === null ? '' : String(p.latitude),
    longitude: p.longitude === null ? '' : String(p.longitude),
    sortOrder: String(p.sortOrder),
    isPublished: p.isPublished,
    translations,
    sections,
    media,
  };
}
