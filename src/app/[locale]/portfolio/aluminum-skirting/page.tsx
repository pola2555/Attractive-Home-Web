import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LOCALES, isLocale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { alternates } from '@/lib/seo';
import { siteMediaUrl } from '@/lib/media';
import SmartImage from '@/components/SmartImage';
import BackLink from '@/components/BackLink';

// Aluminum-skirting landing page — ported from the old SPA (same copy + assets).
// Static route wins over /portfolio/[category], so it keeps the legacy URL.
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale, 'portfolio');
  return {
    title: t(dict, 'aluminum.heroTitle'),
    description: t(dict, 'aluminum.heroSubtitle'),
    alternates: alternates(locale, '/portfolio/aluminum-skirting'),
  };
}

// PDF guides live on the legacy me-central bucket (unchanged from the old site).
const GUIDE_PDF = 'https://s3.me-central-1.amazonaws.com/attractivehome.ae/Aluminum-Skirting/ATT-001-Guide.pdf';
const DIMS_PDF = 'https://s3.me-central-1.amazonaws.com/attractivehome.ae/ATT-001-DIMS.pdf';

export default async function AluminumSkirtingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale, 'portfolio');
  const tr = (key: string) => t(dict, `aluminum.${key}`);

  return (
    <section className="bg-bg">
      {/* Hero */}
      <div
        className="relative flex flex-col lg:justify-end min-h-screen bg-cover bg-center lg:px-32 max-lg:text-center max-lg:items-center pt-20"
        style={{ backgroundImage: `url('${siteMediaUrl('Aluminum-Skirting/Background.avif')}')` }}
      >
        <div className="lg:hidden" style={{ paddingTop: '21vh' }} />
        <div className="absolute inset-0 bg-black/50" />

        <div className="relative z-10 max-w-4xl 2xl:max-w-5xl text-on-media">
          <h1
            className="text-6xl 2xl:text-7xl max-sm:text-4xl font-bold max-sm:max-w-xs mx-auto lg:mx-0"
            style={{ lineHeight: '1.5', letterSpacing: '0.02em' }}
          >
            {tr('heroTitle')}
          </h1>
          <div className="lg:hidden" style={{ paddingBottom: '24vh' }} />
          <p
            className="mt-3 text-md sm:text-xl 2xl:text-2xl md:max-w-2xl 2xl:max-w-3xl lg:max-w-2xl max-sm:px-8 mx-auto lg:mx-0"
            style={{ lineHeight: '1.4', letterSpacing: '0.7px' }}
          >
            {tr('heroSubtitle')}
          </p>
          <a
            href={GUIDE_PDF}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 mb-20 inline-block px-14 py-4 text-lg 2xl:text-xl font-medium text-on-accent bg-accent-2 rounded-full hover:brightness-105 transition"
          >
            {tr('discover')}
          </a>
        </div>
      </div>

      <div className="px-10 2xl:px-20 pt-8 bg-bg">
        <BackLink
          href={`/${locale}/portfolio`}
          label={t(dict, 'backToPortfolio')}
          className="text-sm font-medium text-muted hover:text-accent"
        />
      </div>

      {/* Premium profiles */}
      <div className="px-10 2xl:px-20 py-24 bg-bg-deep text-ink">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-6" style={{ letterSpacing: '0.02em' }}>
          {tr('premiumTitle')}
        </h2>
        <p className="text-center text-ink/90 mb-24 max-w-2xl mx-auto">{tr('premiumSubtitle')}</p>
        <div className="flex flex-wrap items-center">
          <SmartImage
            src={siteMediaUrl('Aluminum-Skirting/Image1-Desk.jpg')}
            alt="Aluminum Skirting"
            className="w-full lg:w-1/2 rounded-2xl shadow-lg hidden lg:block ring-1 ring-surface"
          />
          <div className="w-full lg:w-1/2 lg:px-24">
            {[1, 2, 3].map((n) => (
              <div key={n} className={n < 3 ? 'mb-6' : ''}>
                <h3 className="text-xl font-semibold text-heading mb-2" style={{ lineHeight: '1.3' }}>
                  {tr(`feature${n}Title`)}
                </h3>
                <p className="text-ink/90" style={{ lineHeight: '1.3' }}>
                  {tr(`feature${n}Text`)}
                </p>
              </div>
            ))}
            <SmartImage
              src={siteMediaUrl('Aluminum-Skirting/Image1-Mob.avif')}
              alt="Aluminum Skirting"
              className="w-full rounded-2xl shadow-lg mt-16 block lg:hidden ring-1 ring-surface"
            />
          </div>
        </div>
      </div>

      {/* Sleek profiles */}
      <div className="px-10 2xl:px-20 py-24 bg-bg text-ink">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-6" style={{ letterSpacing: '0.02em' }}>
          {tr('sleekTitle')}
        </h2>
        <p className="text-center text-ink/90 mb-14 max-w-2xl mx-auto">{tr('sleekSubtitle')}</p>
        <div className="flex flex-wrap justify-between gap-8">
          {[1, 2, 3, 4].map((n) => (
            <SmartImage
              key={n}
              src={siteMediaUrl(`Aluminum-Skirting/Sleek${n}.avif`)}
              alt={`Sleek Profile ${n}`}
              className="w-[45%] lg:w-1/5 rounded-lg shadow-lg ring-1 ring-surface"
            />
          ))}
        </div>
      </div>

      {/* ATT-001 */}
      <div className="flex flex-col lg:flex-row bg-bg-deep py-24 px-10 2xl:px-20 text-ink gap-20">
        <div className="lg:w-1/3">
          <SmartImage
            src={siteMediaUrl('Aluminum-Skirting/ATT-001.avif')}
            alt="ATT-001 Aluminum Profile"
            className="w-full object-cover rounded-t-lg"
          />
          <div className="bg-surface p-6 rounded-b-lg border-t border-surface">
            <h2 className="text-2xl font-bold mb-4 text-ink">{tr('att001Name')}</h2>
            <p className="mb-2 text-ink/90">{tr('att001Desc')}</p>
            <p className="text-heading">{tr('att001Tag')}</p>
          </div>
        </div>
        <div className="lg:w-2/3">
          <h3 className="text-2xl font-bold mb-2 text-heading">{tr('att001Heading')}</h3>
          <p className="mb-8 text-ink/95" dangerouslySetInnerHTML={{ __html: tr('att001Body') }} />
          <div className="flex flex-wrap gap-4">
            <a href={DIMS_PDF} target="_blank" rel="noopener noreferrer">
              <span className="inline-block bg-accent-2 text-on-accent font-medium py-3 px-6 rounded-full hover:brightness-105 transition">
                {tr('dimensions')}
              </span>
            </a>
            <a href={GUIDE_PDF} target="_blank" rel="noopener noreferrer">
              <span className="inline-block bg-accent-2 text-on-accent font-medium py-3 px-6 rounded-full hover:brightness-105 transition">
                {tr('technicalGuide')}
              </span>
            </a>
          </div>
        </div>
      </div>

      {/* ATT-002 */}
      <div className="flex flex-col lg:flex-row bg-bg py-24 px-10 2xl:px-20 text-ink gap-20">
        <div className="lg:w-1/3">
          <SmartImage
            src={siteMediaUrl('Aluminum-Skirting/ATT-002.avif')}
            alt="ATT-002 Aluminum Profile"
            className="w-full object-cover rounded-t-lg"
          />
          <div className="bg-surface p-6 rounded-b-lg border-t border-surface">
            <h2 className="text-2xl font-bold mb-4 text-ink">{tr('att002Name')}</h2>
            <p className="text-heading">{tr('att002Tag')}</p>
          </div>
        </div>
        <div className="lg:w-2/3">
          <h3 className="text-2xl font-bold mb-2 text-heading">{tr('att002Heading')}</h3>
          <p className="mb-8 text-ink/95" dangerouslySetInnerHTML={{ __html: tr('att002Body') }} />
        </div>
      </div>
    </section>
  );
}
