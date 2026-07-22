import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { getContentBlocks } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import { pickTranslation, localeFilter } from '@/lib/translate';
import { siteMediaUrl } from '@/lib/media';
import { alternates } from '@/lib/seo';
import VideoPlayer from '@/components/VideoPlayer';
import LeafletMap, { type MapMarker } from '@/components/LeafletMap';

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale, 'about');
  const blocks = await getContentBlocks(locale);
  return {
    title: t(dict, 'aboutUs'),
    description: blocks['about.intro'],
    alternates: alternates(locale, '/about'),
  };
}

// Projects map — shows ONLY projects with real coordinates
// (docs/DATABASE.md §6: lat/lng start NULL because the old map pins were
// fake; data-entry adds real ones). The section hides itself while empty.
async function projectMarkers(locale: Locale, viewLabel: string): Promise<MapMarker[]> {
  const projects = await prisma.project.findMany({
    where: { isPublished: true, latitude: { not: null }, longitude: { not: null } },
    include: {
      translations: { where: localeFilter(locale) },
      category: { select: { slug: true } },
    },
  });
  return projects.map((p) => ({
    lat: Number(p.latitude),
    lng: Number(p.longitude),
    title: pickTranslation(p.translations, locale)?.title,
    href: `/${locale}/portfolio/${p.category.slug}/${p.slug}`,
    linkLabel: viewLabel,
  }));
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [dict, blocks] = await Promise.all([getDictionary(locale, 'about'), getContentBlocks(locale)]);
  const markers = await projectMarkers(locale, t(dict, 'viewProject'));

  const pillars = [
    { label: t(dict, 'pillars.architectural'), key: 'architectural' },
    { label: t(dict, 'pillars.interior'), key: 'interior' },
    { label: t(dict, 'pillars.fitOut'), key: 'fit' },
  ];

  return (
    <>
      <section className="text-on-media relative bg-bg min-h-screen overflow-hidden">
        <VideoPlayer
          videoUrl={siteMediaUrl('Main/About/master.m3u8')}
          className="absolute inset-0 w-full h-full object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 sm:px-10 md:px-16 pt-24 sm:pt-32 pb-20 min-h-screen flex flex-col justify-end">
          <div className="space-y-8 sm:space-y-10">
            <div>
              <span className="inline-block text-on-media-soft text-sm font-medium uppercase mb-4 tracking-[0.2em]">
                {t(dict, 'whoWeAre')}
              </span>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-on-media tracking-tight">
                {t(dict, 'aboutUs')}
              </h1>
              <div className="mt-4 w-16 h-0.5 rounded-full bg-accent-2/80" aria-hidden="true" />
            </div>

            {/* Marketing copy from content_blocks — admin-editable in the DB. */}
            <p className="text-lg sm:text-xl md:text-2xl leading-relaxed text-on-media/95 max-w-3xl">
              {blocks['about.intro']}
            </p>

            <div className="flex flex-wrap gap-x-8 gap-y-2 pt-2 border-t border-on-media/20">
              {pillars.map(({ label, key }) => (
                <Link
                  key={key}
                  href={`/${locale}/portfolio/${key}`}
                  className="text-on-media-soft/90 text-sm sm:text-base font-medium tracking-wide transition-colors hover:text-on-media-soft hover:underline underline-offset-4"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {markers.length > 0 && (
        <section className="bg-bg py-20 px-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <h2 className="text-3xl sm:text-4xl font-bold text-heading">{blocks['about.map_title']}</h2>
            <p className="text-ink-soft max-w-3xl">{blocks['about.map_subtitle']}</p>
            <div className="rounded-lg overflow-hidden border border-line">
              <LeafletMap
                center={[markers[0].lat, markers[0].lng]}
                zoom={10}
                markers={markers}
                className="h-[28rem] w-full"
              />
            </div>
          </div>
        </section>
      )}
    </>
  );
}
