import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { getCategories, getProjects } from '@/lib/portfolio';
import { pickTranslation } from '@/lib/translate';
import { alternates } from '@/lib/seo';
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

// Portfolio overview: category tabs + all 41 projects in manifest order.
// Category labels prefer the i18n dictionary (already translated in all four
// languages); DB translations take over as data-entry fills them.
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

  return (
    <section className="bg-bg min-h-screen pt-28 sm:pt-32 pb-16 px-4 sm:px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-heading mb-2 uppercase">{t(dict, 'title')}</h1>
        <p className="text-muted mb-10">{t(dict, 'objectsCount')}</p>

        <div className="flex flex-wrap gap-8 mb-12">
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/${locale}/portfolio/${category.slug}`}
              className="pb-2 text-xl font-semibold border-b text-ink hover:text-accent transition-colors uppercase"
              aria-label={t(dict, 'viewCategory', {
                title: categoryLabel(category.legacyKey, pickTranslation(category.translations, locale)?.title),
              })}
            >
              {categoryLabel(category.legacyKey, pickTranslation(category.translations, locale)?.title)}
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
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
        </div>
      </div>
    </section>
  );
}
