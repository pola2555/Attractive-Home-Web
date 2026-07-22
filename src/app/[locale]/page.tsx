import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { getContentBlocks } from '@/lib/content';
import { siteMediaUrl } from '@/lib/media';
import { alternates } from '@/lib/seo';
import VideoPlayer from '@/components/VideoPlayer';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const common = await getDictionary(locale, 'common');
  const blocks = await getContentBlocks(locale);
  return {
    title: { absolute: t(common, 'documentTitle') },
    description: blocks['about.intro'],
    alternates: alternates(locale, '/'),
  };
}

// Home — fullscreen hero video with the title/subtitle marketing atoms from
// content_blocks (admin-editable; docs/DATABASE.md §7).
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const blocks = await getContentBlocks(locale);

  return (
    <section className="relative h-screen flex items-center justify-center overflow-hidden bg-bg">
      <VideoPlayer
        videoUrl={siteMediaUrl('Main/Home/master.m3u8')}
        className="absolute inset-0 w-full h-full object-cover"
        showMuteButton={false}
        priority
      />
      <div className="absolute inset-0 bg-black opacity-50" />
      <div className="relative z-1 text-center text-on-media">
        <h1 className="text-[2.25rem] sm:text-5xl font-bold mb-1 sm:mb-3" style={{ letterSpacing: '0.72px' }}>
          {blocks['home.title'] ?? 'Attractive Home'}
        </h1>
        <p className="text-sm sm:text-lg" style={{ transform: 'scale(1.2)', letterSpacing: '0.4px' }}>
          {blocks['home.subtitle'] ?? ''}
        </p>
      </div>
    </section>
  );
}
