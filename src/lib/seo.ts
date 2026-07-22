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
