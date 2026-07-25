import Link from 'next/link';
import type { CatalogFilters, FacetKey, FacetValue } from '@/lib/catalog';
import { FACET_KEYS } from '@/lib/catalog';
import CollectionFacet from './CollectionFacet';

// Server-rendered faceted navigation: every filter option is a plain crawlable
// link that swaps one query param (and resets the page). Colour renders as
// swatches; Collection gets a client filter island. No other client state.

type HrefPatch = Partial<Record<FacetKey | 'q' | 'page' | 'sort' | 'perPage', string | undefined>>;

export function catalogHref(locale: string, filters: CatalogFilters, patch: HrefPatch): string {
  const params = new URLSearchParams();
  const merged: Record<string, string | undefined> = {
    q: filters.q,
    sort: filters.sort === 'featured' ? undefined : filters.sort,
    perPage: filters.perPage === 48 ? undefined : String(filters.perPage),
    ...Object.fromEntries(FACET_KEYS.map((k) => [k, filters[k]])),
    ...patch,
  };
  // Keep the URL canonical — never serialise a default sort/page-size.
  if (merged.sort === 'featured') merged.sort = undefined;
  if (merged.perPage === '48') merged.perPage = undefined;

  for (const key of ['q', 'sort', 'perPage', ...FACET_KEYS]) {
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
  collectionUi,
}: {
  locale: string;
  filters: CatalogFilters;
  facets: Record<FacetKey, FacetValue[]>;
  labels: Record<FacetKey, string>;
  clearAllLabel: string;
  collectionUi: { showAll: string; showLess: string; filter: string };
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
        const summary = (
          <summary className="cursor-pointer select-none text-heading font-semibold py-1">
            {labels[key]}
            {active ? <span className="text-accent"> · 1</span> : null}
          </summary>
        );

        // Colour → swatches
        if (key === 'color') {
          return (
            <details key={key} open={!!active} className="border-b border-line pb-3">
              {summary}
              <div className="mt-2 flex flex-wrap gap-2">
                {values.map((value) => {
                  const isActive = active === value.code;
                  return (
                    <Link
                      key={value.code}
                      href={catalogHref(locale, filters, { color: isActive ? undefined : value.code })}
                      title={`${value.name} (${value.count})`}
                      aria-label={`${value.name} (${value.count})`}
                      className={`w-7 h-7 rounded-full border grid place-items-center overflow-hidden ${
                        isActive ? 'ring-2 ring-accent border-accent' : 'border-line-strong hover:border-accent/60'
                      }`}
                      style={value.hex ? { backgroundColor: value.hex } : undefined}
                    >
                      {!value.hex && (
                        <span className="text-[9px] text-muted uppercase">{value.name.slice(0, 2)}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </details>
          );
        }

        // Collection → client filter island
        if (key === 'collection') {
          const items = values.map((value) => ({
            code: value.code,
            name: value.name,
            count: value.count,
            href: catalogHref(locale, filters, {
              collection: active === value.code ? undefined : value.code,
            }),
            isActive: active === value.code,
          }));
          return (
            <details key={key} open={!!active} className="border-b border-line pb-3">
              {summary}
              <CollectionFacet
                items={items}
                showAllLabel={collectionUi.showAll}
                showLessLabel={collectionUi.showLess}
                filterPlaceholder={collectionUi.filter}
              />
            </details>
          );
        }

        // Everything else → plain link list
        return (
          <details key={key} open={!!active || key === 'type'} className="border-b border-line pb-3">
            {summary}
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
