import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import {
  parseCatalogFilters,
  facetValues,
  queryProducts,
  shopRepImages,
  CATALOG_PAGE_SIZE,
  PER_PAGE_OPTIONS,
  FACET_KEYS,
  type FacetKey,
  type CatalogSort,
} from '@/lib/catalog';
import { getCatalogFilterConfig } from '@/lib/catalogConfig';
import { alternates } from '@/lib/seo';
import ProductCard from '@/components/ProductCard';
import FiltersSidebar, { catalogHref } from './FiltersSidebar';
import CatalogFilters from './CatalogFilters';
import ShopByTiles from './ShopByTiles';
import CatalogEditor from './CatalogEditor';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale, 'catalog');
  return {
    title: t(dict, 'libraryTitle'),
    description: t(dict, 'browse'),
    alternates: alternates(locale, '/catalog'),
  };
}

// The material library: 4,276 products, faceted filtering with contextual
// counts (docs/DATABASE.md §5). Filter/search state lives entirely in the
// URL, so every filtered view is crawlable and shareable.
export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const filters = parseCatalogFilters(await searchParams);
  // Browse tiles only make sense on the unfiltered landing view.
  const showShopBy = !FACET_KEYS.some((k) => filters[k]?.length) && !filters.q;

  const [dict, facets, { total, products }, reps, filterConfig] = await Promise.all([
    getDictionary(locale, 'catalog'),
    facetValues(locale, filters),
    queryProducts(locale, filters),
    showShopBy ? shopRepImages() : Promise.resolve(null),
    getCatalogFilterConfig(),
  ]);

  // Labels default to the i18n facet name; the admin config can override each.
  const baseFacetLabels = Object.fromEntries(
    FACET_KEYS.map((key) => [key, t(dict, `facet.${key}`)]),
  ) as Record<FacetKey, string>;
  const facetLabels = { ...baseFacetLabels };
  const visibleFilters = filterConfig.filter((e) => e.visible);
  for (const entry of visibleFilters) {
    if (entry.label) facetLabels[entry.facetKey] = entry.label;
  }
  const activeCount = FACET_KEYS.filter((k) => filters[k]).length;

  const totalPages = Math.max(1, Math.ceil(total / filters.perPage));
  const page = Math.min(filters.page, totalPages);
  const shownFrom = total === 0 ? 0 : (page - 1) * filters.perPage + 1;
  const shownTo = Math.min(total, page * filters.perPage);

  const sortOptions: { value: CatalogSort; label: string }[] = [
    { value: 'featured', label: t(dict, 'sortFeatured') },
    { value: 'az', label: t(dict, 'sortAZ') },
  ];

  return (
    <section className="bg-bg min-h-screen pt-28 sm:pt-32 pb-16 px-4 sm:px-6 lg:px-10">
      <div className="max-w-[110rem] mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold text-heading mb-2">{t(dict, 'libraryTitle')}</h1>
        <p className="text-muted mb-8">{t(dict, 'browse')}</p>

        {/* Search — plain GET form; active filters ride along as hidden inputs */}
        <form method="get" className="mb-8 max-w-xl">
          {FACET_KEYS.map((key) => {
            const vals = filters[key];
            return vals?.length ? <input key={key} type="hidden" name={key} value={vals.join(',')} /> : null;
          })}
          {filters.sort !== 'featured' && <input type="hidden" name="sort" value={filters.sort} />}
          {filters.perPage !== CATALOG_PAGE_SIZE && (
            <input type="hidden" name="perPage" value={filters.perPage} />
          )}
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder={t(dict, 'searchPlaceholderShort', { count: total })}
            className="w-full px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </form>

        <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-10">
          <CatalogFilters
            filtersLabel={t(dict, 'filters')}
            closeLabel={t(dict, 'close')}
            viewResultsLabel={t(dict, 'viewResults', { count: total })}
            activeCount={activeCount}
          >
            <FiltersSidebar
              locale={locale}
              filters={filters}
              facets={facets}
              entries={visibleFilters}
              labels={facetLabels}
              clearAllLabel={t(dict, 'clearAll')}
              collectionUi={{
                showAll: t(dict, 'showAll'),
                showLess: t(dict, 'showLess'),
                filter: t(dict, 'filterPlaceholder'),
              }}
            />
          </CatalogFilters>

          <div>
            {showShopBy && reps && (
              <ShopByTiles
                locale={locale}
                filters={filters}
                facets={facets}
                reps={reps}
                labels={{
                  application: t(dict, 'shop.application'),
                  look: t(dict, 'shop.look'),
                  color: t(dict, 'shop.color'),
                  type: t(dict, 'shop.type'),
                  collection: t(dict, 'shop.collection'),
                }}
              />
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 mb-6">
              <p className="text-muted text-sm">
                {t(dict, 'showing', { shown: `${shownFrom}–${shownTo}`, total })}
              </p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center gap-3">
                  {sortOptions.map((opt) => (
                    <Link
                      key={opt.value}
                      href={catalogHref(locale, filters, { sort: opt.value })}
                      className={
                        filters.sort === opt.value
                          ? 'text-heading font-semibold'
                          : 'text-muted hover:text-ink'
                      }
                    >
                      {opt.label}
                    </Link>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  {PER_PAGE_OPTIONS.map((n) => (
                    <Link
                      key={n}
                      href={catalogHref(locale, filters, { perPage: String(n) })}
                      className={
                        filters.perPage === n
                          ? 'text-heading font-semibold'
                          : 'text-muted hover:text-ink'
                      }
                    >
                      {n}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {products.length === 0 ? (
              <div className="py-20 text-center space-y-4">
                <p className="text-ink-soft">{t(dict, 'noMatch')}</p>
                <Link href={`/${locale}/catalog`} className="text-accent hover:underline">
                  {t(dict, 'clearFilters')}
                </Link>
              </div>
            ) : (
              <div
                className="grid gap-5"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}
              >
                {products.map((product) => (
                  <ProductCard key={product.slug} product={product} locale={locale} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <nav className="flex items-center justify-center gap-4 mt-10" aria-label="Pagination">
                {page > 1 && (
                  <Link
                    href={catalogHref(locale, filters, { page: String(page - 1) })}
                    className="px-4 py-2 rounded-lg bg-surface border border-line hover:border-accent/60 text-ink"
                  >
                    {t(dict, 'prev')}
                  </Link>
                )}
                <span className="text-muted text-sm">
                  {page} / {totalPages}
                </span>
                {page < totalPages && (
                  <Link
                    href={catalogHref(locale, filters, { page: String(page + 1) })}
                    className="px-4 py-2 rounded-lg bg-surface border border-line hover:border-accent/60 text-ink"
                  >
                    {t(dict, 'next')}
                  </Link>
                )}
              </nav>
            )}
          </div>
        </div>

        {/* Staff-only in-context layout editor (renders nothing for shoppers). */}
        <CatalogEditor initialConfig={filterConfig} labels={baseFacetLabels} />
      </div>
    </section>
  );
}
