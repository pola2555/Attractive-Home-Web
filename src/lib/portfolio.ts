import { prisma } from './prisma';
import { localeFilter } from './translate';

// Portfolio queries — docs/DATABASE.md §6. Projects are ordered by
// sort_order within their category (the old manifest order, preserved by the
// import).

export function getCategories(locale: string) {
  return prisma.portfolioCategory.findMany({
    where: { isPublished: true },
    orderBy: { sortOrder: 'asc' },
    include: { translations: { where: localeFilter(locale) } },
  });
}

export function getProjects(locale: string, categorySlug?: string) {
  return prisma.project.findMany({
    where: {
      isPublished: true,
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    },
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    include: {
      translations: { where: localeFilter(locale) },
      category: { select: { slug: true, legacyKey: true } },
    },
  });
}

export function getProject(locale: string, slug: string) {
  return prisma.project.findUnique({
    where: { slug },
    include: {
      translations: { where: localeFilter(locale) },
      category: { select: { slug: true, legacyKey: true } },
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: { translations: { where: localeFilter(locale) } },
      },
      media: { orderBy: { sortOrder: 'asc' } },
    },
  });
}
