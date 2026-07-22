import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { prisma } from '@/lib/prisma';
import { pickTranslation, localeFilter } from '@/lib/translate';
import { siteMediaUrl } from '@/lib/media';
import { alternates } from '@/lib/seo';
import VideoPlayer from '@/components/VideoPlayer';
import SmartImage from '@/components/SmartImage';

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale, 'services');
  return {
    title: t(dict, 'heading'),
    alternates: alternates(locale, '/services'),
  };
}

// The 12 services now live in the DB (docs/DATABASE.md §7) — titles and
// descriptions per locale via the translation fallback chain.
export default async function ServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale, 'services');

  const services = await prisma.service.findMany({
    where: { isPublished: true },
    orderBy: { sortOrder: 'asc' },
    include: { translations: { where: localeFilter(locale) } },
  });

  return (
    <section className="bg-bg">
      <VideoPlayer
        videoUrl={siteMediaUrl('Main/Services/master.m3u8')}
        className="absolute inset-0 w-full h-full object-cover"
        priority
      />
      <div className="absolute inset-0 bg-black opacity-50" />

      <div className="max-w-7xl mx-auto sm:px-8 lg:px-10 2xl:px-0">
        <div className="flex flex-col min-h-screen">
          <div className="relative z-1 mb-32 sm:mb-16 grid grid-cols-1 mt-auto">
            <h1
              className="text-[2.8rem] 2xl:text-[3.2rem] sm:text-5xl font-bold text-white px-8 sm:px-6 lg:px-12 2xl:px-0 tracking-[3px] uppercase"
              style={{ lineHeight: '1.5' }}
            >
              {t(dict, 'heading')}
            </h1>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-16 py-16">
          {services.map((service) => {
            const tr = pickTranslation(service.translations, locale);
            if (!tr) return null;
            return (
              <div
                key={service.id}
                className="bg-surface rounded-lg shadow-lg overflow-hidden transition-transform duration-1000 hover:scale-105"
              >
                {service.mediaType === 'image' && service.mediaKey ? (
                  <SmartImage
                    src={siteMediaUrl(service.mediaKey)}
                    alt={tr.title}
                    className="w-full h-48 object-cover"
                  />
                ) : service.mediaType === 'video' && service.mediaKey ? (
                  <VideoPlayer
                    className="w-full h-48 object-cover"
                    videoUrl={siteMediaUrl(service.mediaKey)}
                    autoPlay={false}
                    showMuteButton={false}
                    enableHoverPlay
                  />
                ) : null}
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-2 text-ink">{tr.title}</h2>
                  <p className="text-heading">{tr.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
