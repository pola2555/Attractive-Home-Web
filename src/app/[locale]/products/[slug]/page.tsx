import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/i18n/config';
import { getDictionary, t, type Dictionary } from '@/i18n/getDictionary';
import { prisma } from '@/lib/prisma';
import { pickTranslation, localeFilter } from '@/lib/translate';
import { productMediaUrl } from '@/lib/media';
import { alternates, localeUrl } from '@/lib/seo';
import { getContactSettings } from '@/lib/content';
import { productCardInclude } from '@/lib/catalog';
import ProductGallery from '@/components/ProductGallery';
import ProductCard from '@/components/ProductCard';
import SocialIcon from '@/components/SocialIcon';
import FavoriteButton from '@/components/favorites/FavoriteButton';

export const revalidate = 3600;

const facetInclude = (locale: string) => ({
  include: { translations: { where: localeFilter(locale) } },
});

async function loadProduct(locale: Locale, slug: string) {
  return prisma.product.findUnique({
    where: { slug },
    include: {
      translations: { where: localeFilter(locale) },
      images: { orderBy: { sortOrder: 'asc' } },
      source: { select: { code: true } },
      brand: facetInclude(locale),
      type: facetInclude(locale),
      material: facetInclude(locale),
      look: facetInclude(locale),
      color: facetInclude(locale),
      finish: facetInclude(locale),
      collection: facetInclude(locale),
      applications: { include: { application: facetInclude(locale) } },
      performance: { include: { performanceAttribute: facetInclude(locale) } },
    },
  });
}

type FacetRow = { code: string; translations: { localeCode: string; name: string }[] } | null;

function facetName(row: FacetRow, locale: string): string | null {
  if (!row) return null;
  return pickTranslation(row.translations, locale)?.name ?? row.code;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const product = await loadProduct(locale, slug);
  if (!product || !product.isPublished) return {};
  const tr = pickTranslation(product.translations, locale);
  const name = tr?.name ?? product.code ?? slug;
  const image = product.images[0];
  return {
    // Per-locale SEO meta lives on the translation rows (docs/DATABASE.md §3);
    // sensible derivation until data-entry fills them.
    title: tr?.metaTitle ?? name,
    description: tr?.metaDescription ?? tr?.description?.slice(0, 160) ?? undefined,
    alternates: alternates(locale, `/products/${slug}`),
    openGraph: image
      ? { images: [{ url: productMediaUrl(image.s3Key, product.source.code) }] }
      : undefined,
  };
}

function specRows(
  product: NonNullable<Awaited<ReturnType<typeof loadProduct>>>,
  locale: Locale,
  dict: Dictionary,
): { label: string; value: string }[] {
  const rows: { label: string; value: string | null }[] = [
    { label: t(dict, 'facet.type'), value: facetName(product.type, locale) },
    { label: t(dict, 'facet.material'), value: facetName(product.material, locale) },
    { label: t(dict, 'facet.look'), value: facetName(product.look, locale) },
    { label: t(dict, 'facet.color'), value: facetName(product.color, locale) },
    { label: t(dict, 'spec.finish'), value: facetName(product.finish, locale) },
    { label: t(dict, 'facet.size'), value: product.sizeLabel },
    { label: t(dict, 'facet.collection'), value: facetName(product.collection, locale) },
    { label: t(dict, 'facet.brand'), value: facetName(product.brand, locale) },
    {
      label: t(dict, 'facet.application'),
      value:
        product.applications
          .map((a) => facetName(a.application, locale))
          .filter(Boolean)
          .join(' · ') || null,
    },
    {
      label: t(dict, 'spec.selling'),
      value: product.sellingType,
    },
    { label: t(dict, 'spec.packing'), value: product.packing },
    { label: t(dict, 'spec.weight'), value: product.weightLabel },
  ];
  return rows.filter((r): r is { label: string; value: string } => !!r.value);
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const product = await loadProduct(locale, slug);
  if (!product || !product.isPublished) notFound();

  const [dict, account, settings] = await Promise.all([
    getDictionary(locale, 'catalog'),
    getDictionary(locale, 'account'),
    getContactSettings(),
  ]);
  const tr = pickTranslation(product.translations, locale);
  const name = tr?.name ?? product.code ?? slug;
  const specs = specRows(product, locale, dict);
  const performanceBadges = product.performance
    .map((p) => facetName(p.performanceAttribute, locale))
    .filter(Boolean) as string[];

  const galleryImages = product.images.map((image) => ({
    src: productMediaUrl(image.s3Key, product.source.code),
    fallback: image.supplierUrl,
  }));

  const price = Number(product.price);
  const waText = encodeURIComponent(
    `${t(dict, 'whatsappMessage')}\n${name}${product.code ? ` (${product.code})` : ''}\n${localeUrl(locale, `/products/${slug}`)}`,
  );

  // Similar products: same collection, else same type (docs/DATABASE.md §5).
  const related = await prisma.product.findMany({
    where: {
      isPublished: true,
      id: { not: product.id },
      ...(product.collectionId
        ? { collectionId: product.collectionId }
        : product.typeId
          ? { typeId: product.typeId }
          : {}),
    },
    orderBy: { legacyId: 'asc' },
    take: 8,
    include: productCardInclude(locale),
  });

  // Product structured data for rich results; offers only once real prices exist.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    sku: product.code ?? undefined,
    image: galleryImages.map((i) => i.src),
    description: tr?.description ?? undefined,
    brand: product.brand
      ? { '@type': 'Brand', name: facetName(product.brand, locale) }
      : undefined,
    offers:
      price > 0
        ? {
            '@type': 'Offer',
            price: price.toFixed(2),
            priceCurrency: product.currency,
            availability: product.isAvailable
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          }
        : undefined,
  };

  return (
    <section className="bg-bg min-h-screen pt-28 sm:pt-32 pb-16 px-4 sm:px-6 lg:px-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-6xl mx-auto">
        <nav className="text-sm text-muted mb-6" aria-label="Breadcrumb">
          <Link href={`/${locale}/catalog`} className="hover:text-accent">
            {t(dict, 'libraryTitle')}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-ink-soft">{name}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <ProductGallery images={galleryImages} alt={name} />

          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-heading">{name}</h1>
              {product.code && product.code !== name && (
                <p className="text-muted mt-1">{product.code}</p>
              )}
            </div>

            {price > 0 && (
              <p className="text-2xl font-semibold text-accent">
                {product.currency} {price.toFixed(2)}
                {product.priceUnit && <span className="text-base text-muted"> / {product.priceUnit}</span>}
              </p>
            )}

            {performanceBadges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {performanceBadges.map((badge) => (
                  <span key={badge} className="text-xs bg-accent-2/15 text-heading border border-accent-2/40 rounded-full px-3 py-1">
                    {badge}
                  </span>
                ))}
              </div>
            )}

            {specs.length > 0 && (
              <dl className="divide-y divide-line border-y border-line">
                {specs.map((row) => (
                  <div key={row.label} className="flex justify-between gap-6 py-2 text-sm">
                    <dt className="text-muted">{row.label}</dt>
                    <dd className="text-ink text-end">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {tr?.description && <p className="text-ink-soft leading-relaxed">{tr.description}</p>}
            {tr?.usageNotes && <p className="text-muted text-sm leading-relaxed">{tr.usageNotes}</p>}

            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`https://wa.me/${settings.whatsapp}?text=${waText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                <SocialIcon platform="whatsapp" className="w-5 h-5" />
                {t(dict, 'orderWhatsapp')}
              </a>
              <FavoriteButton
                productId={product.id}
                locale={locale}
                labels={{
                  save: t(account, 'save'),
                  saved: t(account, 'saved'),
                  signInToSave: t(account, 'signInToSave'),
                }}
              />
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-bold text-heading mb-6">{t(dict, 'similar')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {related.map((p) => (
                <ProductCard key={p.slug} product={p} locale={locale} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
