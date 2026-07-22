import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { parseCatalogFilters, facetValues, queryProducts, CATALOG_PAGE_SIZE, FACET_KEYS, type FacetKey } from '@/lib/catalog';
import { alternates } from '@/lib/seo';
import ProductCard from '@/components/ProductCard';
import FiltersSidebar, { catalogHref } from './FiltersSidebar';

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

  const [dict, facets, { total, products }] = await Promise.all([
    getDictionary(locale, 'catalog'),
    facetValues(locale, filters),
    queryProducts(locale, filters),
  ]);

  const facetLabels = Object.fromEntries(
    FACET_KEYS.map((key) => [key, t(dict, `facet.${key}`)]),
  ) as Record<FacetKey, string>;

  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const shownFrom = total === 0 ? 0 : (page - 1) * CATALOG_PAGE_SIZE + 1;
  const shownTo = Math.min(total, page * CATALOG_PAGE_SIZE);

  return (
    <section className="bg-bg min-h-screen pt-28 sm:pt-32 pb-16 px-4 sm:px-6 lg:px-10">
      <div className="max-w-[110rem] mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold text-heading mb-2">{t(dict, 'libraryTitle')}</h1>
        <p className="text-muted mb-8">{t(dict, 'browse')}</p>

        {/* Search — plain GET form; active filters ride along as hidden inputs */}
        <form method="get" className="mb-8 max-w-xl">
          {FACET_KEYS.map((key) =>
            filters[key] ? <input key={key} type="hidden" name={key} value={filters[key]} /> : null,
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
          <FiltersSidebar
            locale={locale}
            filters={filters}
            facets={facets}
            labels={facetLabels}
            clearAllLabel={t(dict, 'clearAll')}
          />

          <div>
            <p className="text-muted text-sm mb-4">
              {t(dict, 'showing', { shown: `${shownFrom}–${shownTo}`, total })}
            </p>

            {products.length === 0 ? (
              <div className="py-20 text-center space-y-4">
                <p className="text-ink-soft">{t(dict, 'noMatch')}</p>
                <Link href={`/${locale}/catalog`} className="text-accent hover:underline">
                  {t(dict, 'clearFilters')}
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
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
      </div>
    </section>
  );
}
