// Translation fallback chain — docs/DATABASE.md §3: [requested, 'en'],
// resolved by this one shared helper. Queries fetch only the two candidate
// rows (`where: localeFilter(locale)`) and this picks the winner.
type TranslationRow = { localeCode: string };

export function pickTranslation<T extends TranslationRow>(
  rows: T[] | undefined,
  locale: string,
): T | undefined {
  if (!rows?.length) return undefined;
  return rows.find((r) => r.localeCode === locale) ?? rows.find((r) => r.localeCode === 'en');
}

export function localeFilter(locale: string): { localeCode: { in: string[] } } {
  return { localeCode: { in: locale === 'en' ? ['en'] : [locale, 'en'] } };
}
