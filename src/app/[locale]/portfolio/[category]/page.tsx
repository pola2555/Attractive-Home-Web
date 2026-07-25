import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, LOCALES } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { getCategories, getProjects } from '@/lib/portfolio';
import { prisma } from '@/lib/prisma';
import { pickTranslation } from '@/lib/translate';
import { siteMediaUrl } from '@/lib/media';
import { alternates } from '@/lib/seo';
import VideoPlayer from '@/components/VideoPlayer';
import ProjectCard from '../ProjectCard';

export const revalidate = 3600;

export async function generateStaticParams() {
  const categories = await prisma.portfolioCategory.findMany({ select: { slug: true } });
  return LOCALES.flatMap((locale) => categories.map((c) => ({ locale, category: c.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; category: string }>;
}): Promise<Metadata> {
  const { locale, category } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale, 'portfolio');
  const row = await prisma.portfolioCategory.findUnique({ where: { slug: category } });
  if (!row) return {};
  const title = t(dict, `categories.${row.legacyKey}.title`);
  return {
    title,
    description: t(dict, `categories.${row.legacyKey}.description`),
    alternates: alternates(locale, `/portfolio/${category}`),
  };
}

export default async function PortfolioCategoryPage({
  params,
}: {
  params: Promise<{ locale: string; category: string }>;
}) {
  const { locale, category } = await params;
  if (!isLocale(locale)) notFound();
  const [dict, categories, projects] = await Promise.all([
    getDictionary(locale, 'portfolio'),
    getCategories(locale),
    getProjects(locale, category),
  ]);
  const active = categories.find((c) => c.slug === category);
  if (!active) notFound();

  const categoryLabel = (legacyKey: string | null, dbTitle?: string) => {
    const fromDict = legacyKey ? t(dict, `categories.${legacyKey}.title`) : undefined;
    return fromDict && fromDict !== 'title' ? fromDict : (dbTitle ?? legacyKey ?? '');
  };
  const activeLabel = categoryLabel(active.legacyKey, pickTranslation(active.translations, locale)?.title);
  const description =
    pickTranslation(active.translations, locale)?.description ??
    t(dict, `categories.${active.legacyKey}.description`);

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
        <div className="mb-8 mt-auto px-6">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4" style={{ letterSpacing: '2.4px' }}>
            {activeLabel}
          </h1>
          <p className="text-lg leading-8 max-w-3xl" style={{ letterSpacing: '0.6px' }}>
            {description}
          </p>
          <p className="text-lg mt-4 font-semibold" style={{ letterSpacing: '0.72px' }}>
            {t(dict, 'objectsCount')}
          </p>
        </div>

        <div className="max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-x-36 md:border-b border-gray-300 gap-y-8 mb-32 md:mx-auto">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/${locale}/portfolio/${c.slug}`}
              className={`pb-2 text-xl font-semibold text-center uppercase transition-colors ${
                c.slug === category ? 'border-b-2 border-white text-white' : 'border-b border-white/40 text-white/80 hover:text-accent'
              }`}
            >
              {categoryLabel(c.legacyKey, pickTranslation(c.translations, locale)?.title)}
            </Link>
          ))}
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
                categoryLabel: activeLabel,
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
