import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { LOCALES, DEFAULT_LOCALE } from '@/i18n/config';
import { localeUrl } from '@/lib/seo';

// Every product (4,276), project (41), category and static page — in all four
// languages via hreflang alternates. This is the core of the SEO rewrite:
// crawlable, always-fresh URLs for the whole catalog (README "Why this
// rewrite").
export const revalidate = 3600;

function entry(
  path: string,
  lastModified?: Date,
  priority?: number,
): MetadataRoute.Sitemap[number] {
  return {
    url: localeUrl(DEFAULT_LOCALE, path),
    lastModified,
    priority,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, localeUrl(l, path)])),
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, projects, categories] = await Promise.all([
    prisma.product.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
      orderBy: { legacyId: 'asc' },
    }),
    prisma.project.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true, category: { select: { slug: true } } },
    }),
    prisma.portfolioCategory.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  return [
    entry('/', undefined, 1),
    entry('/about'),
    entry('/services'),
    entry('/contacts'),
    entry('/catalog', undefined, 0.9),
    entry('/portfolio', undefined, 0.9),
    ...categories.map((c) => entry(`/portfolio/${c.slug}`, c.updatedAt, 0.8)),
    ...projects.map((p) => entry(`/portfolio/${p.category.slug}/${p.slug}`, p.updatedAt, 0.7)),
    ...products.map((p) => entry(`/products/${p.slug}`, p.updatedAt, 0.6)),
  ];
}
