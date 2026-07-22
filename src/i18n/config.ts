// Public site languages — must stay in sync with the seeded `locales` table
// (docs/DATABASE.md §3): en default, ar RTL, fr, ru. `zh` is a non-public
// translation source and is deliberately absent here.
export const LOCALES = ['en', 'ar', 'fr', 'ru'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

const RTL_LOCALES: readonly Locale[] = ['ar'];

export function isLocale(value: string | undefined): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

// Compact pill labels for the navbar language switcher.
export const LOCALE_SHORT: Record<Locale, string> = {
  en: 'EN',
  ar: 'ع',
  fr: 'FR',
  ru: 'RU',
};
