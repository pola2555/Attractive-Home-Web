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
    // Tab title in title case ("Portfolio | Attractive Home") — the i18n `title`
    // is all-caps because it doubles as the big hero H1, so it's not reused here.
    title: 'Portfolio',
    description: t(dict, 'mapSubtitle'),
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
    <section className="bg-bg text-on-media">
      {/* Hero — the video is scoped to this full-screen band so it can't stretch
          behind the whole page (it previously filled the entire section). No
          vertical padding so the band is a true 100vh and the video ends at the
          fold, exactly like the old site; the gap before the grid is the grid's
          own top padding (on the page background), not space over the video. */}
      <div className="relative overflow-hidden md:px-12 lg:px-24">
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

            <div className="px-6 mt-4">
              <Link
                href={`/${locale}/portfolio/map`}
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-4 rounded-lg transition-colors border border-white/30 backdrop-blur-sm"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {t(dict, 'viewOnMap')}
              </Link>
            </div>
          </div>

          <div className="max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-x-36 md:border-b border-gray-300 gap-y-8 mb-12 md:mx-auto">
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
      </div>

      {/* Project grid — on the page background, below the hero. The top padding
          is the breathing room between the video's bottom edge and the first
          row (the old site has ~80px here). No extra md/lg horizontal padding —
          it narrowed the cards inside max-w-5xl and squashed the 16:9 covers. */}
      <div className="max-w-5xl mx-auto grid gap-24 md:grid-cols-2 px-6 py-20">
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
