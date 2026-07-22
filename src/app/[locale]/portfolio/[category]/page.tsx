import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, LOCALES } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { getCategories, getProjects } from '@/lib/portfolio';
import { prisma } from '@/lib/prisma';
import { pickTranslation } from '@/lib/translate';
import { alternates } from '@/lib/seo';
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

  return (
    <section className="bg-bg min-h-screen pt-28 sm:pt-32 pb-16 px-4 sm:px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-heading mb-2 uppercase">{activeLabel}</h1>
        <p className="text-ink-soft max-w-3xl mb-10">{description}</p>

        <div className="flex flex-wrap gap-8 mb-12">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/${locale}/portfolio/${c.slug}`}
              className={`pb-2 text-xl font-semibold text-center transition-colors duration-200 uppercase ${
                c.slug === category ? 'border-b-2 border-accent text-heading' : 'border-b text-ink hover:text-accent'
              }`}
            >
              {categoryLabel(c.legacyKey, pickTranslation(c.translations, locale)?.title)}
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
                  categoryLabel: activeLabel,
                }}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
