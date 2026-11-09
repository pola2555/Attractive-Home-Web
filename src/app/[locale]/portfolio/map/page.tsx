import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { projectMapMarkers, DUBAI_CENTER } from '@/lib/portfolio';
import { pageMetadata } from '@/lib/seo';
import { requirePagePublished } from '@/lib/sitePages.server';
import LeafletMap from '@/components/LeafletMap';

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale, 'portfolio');
  return pageMetadata({
    locale,
    path: '/portfolio/map',
    title: t(dict, 'mapTitle'),
    description: t(dict, 'mapSubtitle'),
  });
}

// Standalone projects map — the old site's /portfolio/map page. Every published
// project is a Dubai pin (shared builder in lib/portfolio); click a marker to open
// the project.
export default async function PortfolioMapPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requirePagePublished('portfolio', locale);
  const dict = await getDictionary(locale, 'portfolio');
  const markers = await projectMapMarkers(locale, t(dict, 'viewProject'));

  return (
    <section className="bg-bg min-h-screen pt-28 sm:pt-32 pb-16 px-4 sm:px-6 lg:px-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <Link href={`/${locale}/portfolio`} className="text-sm text-accent hover:underline">
          ← {t(dict, 'backToPortfolio')}
        </Link>
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-heading">{t(dict, 'mapTitle')}</h1>
          <p className="text-ink-soft max-w-3xl mt-2">{t(dict, 'mapSubtitle')}</p>
        </div>
        <div className="rounded-lg overflow-hidden border border-line shadow-lg">
          <LeafletMap
            center={DUBAI_CENTER}
            zoom={11}
            markers={markers}
            className="h-[calc(100vh-18rem)] min-h-[24rem] w-full"
            scrollWheelZoom
          />
        </div>
      </div>
    </section>
  );
}
