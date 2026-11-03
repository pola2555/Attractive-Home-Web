import type { Metadata } from 'next';
import { LOCALES, DEFAULT_LOCALE, type Locale } from '@/i18n/config';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.attractivehome.ae').replace(/\/$/, '');

export function localeUrl(locale: Locale, path: string): string {
  return `${SITE_URL}/${locale}${path === '/' ? '' : path}`;
}

// Canonical + hreflang set for a page. `path` is the locale-less pathname
// ('/', '/catalog', '/products/x-slug'). One slug per entity — localized URLs
// are path prefixes (docs/DATABASE.md §8 step 5), so every locale variant maps
// 1:1 and x-default points at English.
export function alternates(locale: Locale, path: string): Metadata['alternates'] {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = localeUrl(l, path);
  languages['x-default'] = localeUrl(DEFAULT_LOCALE, path);
  return { canonical: localeUrl(locale, path), languages };
}

export const SITE_NAME = 'Attractive Home';

// og:locale wants a language_TERRITORY tag; map our bare language codes.
const OG_LOCALE: Record<Locale, string> = {
  en: 'en_US',
  ar: 'ar_AE',
  fr: 'fr_FR',
  ru: 'ru_RU',
};

// Default social share image: the localized logo (same asset as the org
// JSON-LD). A purpose-built 1200×630 image is a future design follow-up; pages
// with their own photo (products, projects) pass `images` to override.
function defaultOgImage(locale: Locale): string {
  return `${SITE_URL}/${encodeURI(locale === 'ar' ? 'Logo AR.webp' : 'Logo EN.webp')}`;
}

// One place that builds canonical/hreflang + a complete OpenGraph + Twitter
// card for a page. Title and description are intentionally left to inherit:
// Next falls back og:title/twitter:title to the page `title` (so the
// "%s | Attractive Home" template still applies) and og/twitter description to
// the page `description`. Callers set those as usual and just add the path here.
export function pageMetadata(opts: {
  locale: Locale;
  path: string;
  title?: Metadata['title'];
  description?: string;
  images?: string[];
  type?: 'website' | 'article';
}): Metadata {
  const { locale, path, title, description, images, type = 'website' } = opts;
  const imageUrls = images && images.length > 0 ? images : [defaultOgImage(locale)];
  return {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    alternates: alternates(locale, path),
    openGraph: {
      type,
      siteName: SITE_NAME,
      url: localeUrl(locale, path),
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      images: imageUrls.map((url) => ({ url })),
    },
    twitter: {
      card: 'summary_large_image',
      images: imageUrls,
    },
  };
}
