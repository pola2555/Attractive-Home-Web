import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { getContentBlocks } from '@/lib/content';
import { projectMapMarkers, DUBAI_CENTER } from '@/lib/portfolio';
import { siteMediaUrl } from '@/lib/media';
import { requirePagePublished, pageMetaWithOverride } from '@/lib/sitePages.server';
import VideoPlayer from '@/components/VideoPlayer';
import LeafletMap from '@/components/LeafletMap';

export const revalidate = 3600;

// Set the brand name in a heavier weight wherever it appears in a marketing
// string. The stored copy stays plain text; every locale's seed spells the
// name "Attractive Home", so one split covers them all.
function emphasizeBrand(text: string | undefined): ReactNode {
  if (!text) return text ?? null;
  const brand = 'Attractive Home';
  const parts = text.split(brand);
  if (parts.length === 1) return text;
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i > 0) {
      out.push(
        <span key={`brand-${i}`} className="font-semibold">
          {brand}
        </span>,
      );
    }
    out.push(part);
  });
  return out;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale, 'about');
  const blocks = await getContentBlocks(locale);
  return pageMetaWithOverride('about', {
    locale,
    path: '/about',
    title: t(dict, 'aboutUs'),
    description: blocks['about.intro'],
  });
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requirePagePublished('about', locale);
  const [dict, blocks] = await Promise.all([getDictionary(locale, 'about'), getContentBlocks(locale)]);
  const markers = await projectMapMarkers(locale, t(dict, 'viewProject'));

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

            {/* Marketing copy from content_blocks — admin-editable in the DB.
                The brand name is emphasised in place; the stored copy stays plain
                text, so every locale's "Attractive Home" reads as one word set. */}
            <p className="text-lg sm:text-xl md:text-2xl leading-relaxed text-on-media/95 max-w-3xl">
              {emphasizeBrand(blocks['about.intro'])}
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
            <h2 className="text-3xl sm:text-4xl font-bold text-heading">
              {blocks['about.map_title'] || t(dict, 'mapTitle')}
            </h2>
            <p className="text-ink-soft max-w-3xl">
              {blocks['about.map_subtitle'] || t(dict, 'mapSubtitle')}
            </p>
            <div className="rounded-lg overflow-hidden border border-line">
              <LeafletMap
                center={DUBAI_CENTER}
                zoom={11}
                markers={markers}
                className="h-[28rem] w-full"
                scrollWheelZoom
              />
            </div>
          </div>
        </section>
      )}
    </>
  );
}
