import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { getContentBlocks, getContactSettings } from '@/lib/content';
import { siteMediaUrl } from '@/lib/media';
import { alternates } from '@/lib/seo';
import VideoPlayer from '@/components/VideoPlayer';
import ConsultationButton from '@/components/home/ConsultationButton';
import Introduction from '@/components/home/Introduction';
import ServicesSection from '@/components/home/ServicesSection';
import HowWeWork from '@/components/home/HowWeWork';
import WhyAttractiveHome from '@/components/home/WhyAttractiveHome';
import WhereWeWork from '@/components/home/WhereWeWork';
import Faq from '@/components/home/Faq';
import BottomCta from '@/components/home/BottomCta';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const [home, blocks] = await Promise.all([getDictionary(locale, 'home'), getContentBlocks(locale)]);
  return {
    // Strong, localised SEO title (overrides the "%s | Attractive Home" template).
    title: { absolute: `${t(home, 'introHeading')} | Attractive Home` },
    description: blocks['about.intro'] ?? t(home, 'introP1'),
    alternates: alternates(locale, '/'),
  };
}

// Home — fullscreen hero video (title/subtitle are admin-editable content_blocks)
// followed by the long-form marketing sections, all from the `home` i18n
// namespace. FAQPage structured data is emitted from the same FAQ strings.
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const [home, blocks, settings] = await Promise.all([
    getDictionary(locale, 'home'),
    getContentBlocks(locale),
    getContactSettings(),
  ]);

  const heroTitle = blocks['home.title'] ?? t(home, 'title');
  const heroSubtitle = blocks['home.subtitle'] ?? t(home, 'subtitle');

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [1, 2, 3, 4, 5].map((n) => ({
      '@type': 'Question',
      name: t(home, `faq${n}Q`),
      acceptedAnswer: { '@type': 'Answer', text: t(home, `faq${n}A`) },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* Hero */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden bg-bg">
        <VideoPlayer
          videoUrl={siteMediaUrl('Main/Home/master.m3u8')}
          className="absolute inset-0 w-full h-full object-cover"
          showMuteButton={false}
          priority
        />
        <div className="absolute inset-0 bg-black opacity-50" />
        <div className="relative z-1 w-full px-4 sm:px-6 text-center text-on-media">
          <h1 style={{ letterSpacing: '0.48px' }}>
            <span className="block text-[2.25rem] sm:text-5xl font-bold mb-1 sm:mb-3">{heroTitle}</span>
            <span className="block font-normal text-[16.8px] leading-[24px] sm:text-[21.6px] sm:leading-[33.6px]">
              {heroSubtitle}
            </span>
          </h1>
          <div className="mt-6 sm:mt-8">
            <ConsultationButton number={settings.whatsapp} label={t(home, 'ctaConsultation')} location="hero" />
          </div>
        </div>
      </section>

      <Introduction dict={home} />
      <ServicesSection dict={home} locale={locale} />
      <HowWeWork dict={home} />
      <WhyAttractiveHome dict={home} />
      <WhereWeWork dict={home} />
      <Faq dict={home} />
      <BottomCta dict={home} whatsapp={settings.whatsapp} />
    </>
  );
}
