import Link from 'next/link';
import type { CatalogFilters, FacetKey, FacetValue } from '@/lib/catalog';
import { FACET_KEYS } from '@/lib/catalog';

// Server-rendered faceted navigation: every filter option is a plain crawlable
// link that swaps one query param (and resets the page). No client state.

export function catalogHref(
  locale: string,
  filters: CatalogFilters,
  patch: Partial<Record<FacetKey | 'q' | 'page', string | undefined>>,
): string {
  const params = new URLSearchParams();
  const merged: Record<string, string | undefined> = {
    q: filters.q,
    ...Object.fromEntries(FACET_KEYS.map((k) => [k, filters[k]])),
    ...patch,
  };
  for (const key of ['q', ...FACET_KEYS]) {
    if (merged[key]) params.set(key, merged[key] as string);
  }
  if (patch.page && patch.page !== '1') params.set('page', patch.page);
  const qs = params.toString();
  return `/${locale}/catalog${qs ? `?${qs}` : ''}`;
}

export default function FiltersSidebar({
  locale,
  filters,
  facets,
  labels,
  clearAllLabel,
}: {
  locale: string;
  filters: CatalogFilters;
  facets: Record<FacetKey, FacetValue[]>;
  labels: Record<FacetKey, string>;
  clearAllLabel: string;
}) {
  const hasActive = FACET_KEYS.some((k) => filters[k]) || !!filters.q;

  return (
    <aside className="space-y-4">
      {hasActive && (
        <Link href={`/${locale}/catalog`} className="inline-block text-sm text-accent hover:underline">
          {clearAllLabel}
        </Link>
      )}
      {FACET_KEYS.map((key) => {
        const values = facets[key];
        if (!values.length) return null;
        const active = filters[key];
        return (
          <details key={key} open={!!active || key === 'type'} className="border-b border-line pb-3">
            <summary className="cursor-pointer select-none text-heading font-semibold py-1">
              {labels[key]}
              {active ? <span className="text-accent"> · 1</span> : null}
            </summary>
            <ul className="mt-2 space-y-1 max-h-64 overflow-y-auto pe-2">
              {values.map((value) => {
                const isActive = active === value.code;
                return (
                  <li key={value.code}>
                    <Link
                      href={catalogHref(locale, filters, { [key]: isActive ? undefined : value.code })}
                      className={`flex justify-between gap-2 text-sm rounded px-2 py-1 transition-colors ${
                        isActive ? 'bg-accent-2/15 text-heading font-semibold' : 'text-ink hover:bg-accent-2/10'
                      }`}
                    >
                      <span className="truncate">{value.name}</span>
                      <span className="text-muted shrink-0">{value.count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </aside>
  );
}
