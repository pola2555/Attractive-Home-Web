import 'server-only';
import { prisma } from './prisma';
import { siteMediaUrl } from './media';
import { LOCALES, type Locale } from '@/i18n/config';

// Admin-side services helpers (dashboard is English-only). Services media lives
// in the site bucket, so siteMediaUrl() resolves every key.

const EN = { where: { localeCode: 'en' as const }, select: { title: true } } as const;

export type ServiceRow = {
  id: string;
  slug: string;
  title: string;
  mediaType: 'image' | 'video' | null;
  mediaUrl: string | null;
  sortOrder: number;
  isPublished: boolean;
};

export async function listServices(): Promise<ServiceRow[]> {
  const rows = await prisma.service.findMany({
    orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    include: { translations: EN },
  });
  return rows.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.translations[0]?.title ?? s.slug,
    mediaType: s.mediaType,
    mediaUrl: s.mediaKey ? siteMediaUrl(s.mediaKey) : null,
    sortOrder: s.sortOrder,
    isPublished: s.isPublished,
  }));
}

export type ServiceTranslationInput = {
  title: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
};

export type ServiceFormInitial = {
  id: string;
  slug: string;
  mediaKey: string;
  mediaType: 'image' | 'video' | '';
  mediaUrl: string | null;
  sortOrder: string;
  isPublished: boolean;
  translations: Record<Locale, ServiceTranslationInput>;
};

const EMPTY_T: ServiceTranslationInput = {
  title: '',
  description: '',
  metaTitle: '',
  metaDescription: '',
};

export async function getServiceForEdit(id: string): Promise<ServiceFormInitial | null> {
  const s = await prisma.service.findUnique({
    where: { id },
    include: { translations: true },
  });
  if (!s) return null;

  const translations = {} as Record<Locale, ServiceTranslationInput>;
  for (const locale of LOCALES) {
    const row = s.translations.find((t) => t.localeCode === locale);
    translations[locale] = row
      ? {
          title: row.title,
          description: row.description ?? '',
          metaTitle: row.metaTitle ?? '',
          metaDescription: row.metaDescription ?? '',
        }
      : { ...EMPTY_T };
  }

  return {
    id: s.id,
    slug: s.slug,
    mediaKey: s.mediaKey ?? '',
    mediaType: s.mediaType ?? '',
    mediaUrl: s.mediaKey ? siteMediaUrl(s.mediaKey) : null,
    sortOrder: String(s.sortOrder),
    isPublished: s.isPublished,
    translations,
  };
}
