import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { getCategories, getProjects } from '@/lib/portfolio';
import { pickTranslation } from '@/lib/translate';
import { siteMediaUrl } from '@/lib/media';
import { alternates } from '@/lib/seo';
import VideoPlayer from '@/components/VideoPlayer';
import ProjectCard from './ProjectCard';

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale, 'portfolio');
  return {
    title: t(dict, 'title'),
    description: t(dict, 'objectsCount'),
    alternates: alternates(locale, '/portfolio'),
  };
}

// Portfolio overview — ported from the old SPA: fullscreen video hero with the
// title + category tabs, the aluminum-skirting promo, then the project grid
// with a trailing aluminum promo card.
export default async function PortfolioPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [dict, categories, projects] = await Promise.all([
    getDictionary(locale, 'portfolio'),
    getCategories(locale),
    getProjects(locale),
  ]);

  const categoryLabel = (legacyKey: string | null, dbTitle?: string) => {
    const fromDict = legacyKey ? t(dict, `categories.${legacyKey}.title`) : undefined;
    return fromDict && fromDict !== 'title' ? fromDict : (dbTitle ?? legacyKey ?? '');
  };

  // Even project count → the promo card would sit alone on a new row, so span both.
  const aluminumFullWidth = projects.length % 2 === 0;
  const aluminumHref = `/${locale}/portfolio/aluminum-skirting`;

  return (
    <section className="relative py-20 md:px-12 lg:px-24 bg-bg text-on-media overflow-hidden">
      <VideoPlayer
        videoUrl={siteMediaUrl('Main/Portfolio/master.m3u8')}
        showMuteButton={false}
        className="absolute inset-0 w-full h-full object-cover"
        priority
      />
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

      {/* Aluminum-skirting floating promo */}
      <div className="absolute end-0 opacity-90 top-[40%] px-3 z-[2]">
        <span className="absolute -top-5 start-0 bg-gray-800 text-white text-xs font-semibold py-1 px-3 rounded-full">
          {t(dict, 'pioneer')}
        </span>
        <Link
          href={aluminumHref}
          className="inline-block bg-white text-gray-900 font-bold rounded-md shadow-lg px-3 py-2 text-sm sm:text-xl sm:py-3 sm:px-6 sm:rounded-lg hover:bg-gray-200 transition"
        >
          {t(dict, 'exploreAluminum')}
        </Link>
      </div>

      <div className="relative z-[1] flex flex-col min-h-screen">
        <div className="mb-12 mt-auto">
          <h1 className="text-5xl font-bold mb-2 px-6" style={{ letterSpacing: '2.4px' }}>
            {t(dict, 'title')}
          </h1>
          <p className="text-lg px-6" style={{ letterSpacing: '0.72px' }}>
            {t(dict, 'objectsCount')}
          </p>
        </div>

        <div className="max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-x-36 md:border-b border-gray-300 gap-y-8 mb-32 md:mx-auto">
          {categories.map((category) => {
            const label = categoryLabel(category.legacyKey, pickTranslation(category.translations, locale)?.title);
            return (
              <Link
                key={category.slug}
                href={`/${locale}/portfolio/${category.slug}`}
                className="pb-2 text-xl font-semibold text-center border-b border-white/40 text-white uppercase hover:text-accent transition-colors"
                aria-label={t(dict, 'viewCategory', { title: label })}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="relative z-[1] max-w-5xl mx-auto grid gap-24 md:grid-cols-2">
        {projects.map((project) => {
          const tr = pickTranslation(project.translations, locale);
          if (!tr) return null;
          return (
            <ProjectCard
              key={project.slug}
              locale={locale}
              project={{
                slug: project.slug,
                coverKey: project.coverKey,
                coverType: project.coverType,
                title: tr.title,
                categorySlug: project.category.slug,
                categoryLabel: categoryLabel(project.category.legacyKey),
              }}
            />
          );
        })}
        <div
          className={`relative overflow-hidden sm:rounded-lg sm:shadow-lg bg-surface p-6 flex flex-col items-center justify-center ${
            aluminumFullWidth ? 'md:col-span-2' : ''
          }`}
        >
          <h3 className="text-xl font-bold text-ink mb-4">{t(dict, 'aluminumProfiles')}</h3>
          <Link
            href={aluminumHref}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-300"
          >
            {t(dict, 'exploreMore')}
          </Link>
        </div>
      </div>
    </section>
  );
}
