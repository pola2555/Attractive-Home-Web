import 'server-only';
import { prisma } from './prisma';
import { localeFilter, pickTranslation } from './translate';
import type { Locale } from '@/i18n/config';
import type { MapMarker } from '@/components/LeafletMap';

// Portfolio queries — docs/DATABASE.md §6. Projects are ordered by
// sort_order within their category (the old manifest order, preserved by the
// import).

// Projects map — every published project gets a Dubai pin, the way the old
// website did it. A project's real coordinates win when set
// (projects.latitude/longitude, currently NULL for all), otherwise it falls back
// to a fixed Dubai spot by stable index, so the map is populated the same way the
// old site's was. Shared by the About page and the /portfolio/map page.
export const DUBAI_CENTER: [number, number] = [25.17, 55.24];
const DUBAI_LOCATIONS: [number, number][] = [
  [25.0877, 55.1385], // Jumeirah
  [25.0657, 55.1393],
  [25.2048, 55.2708], // Downtown
  [25.1124, 55.139],
  [25.2285, 55.3273], // Dubai Marina
  [25.2419, 55.2994],
  [25.0658, 55.21],
  [25.1972, 55.2744],
  [25.1134, 55.138],
  [25.0916, 55.1612],
  [25.2184, 55.2843],
  [25.0764, 55.1312],
  [25.2496, 55.3012],
  [25.0721, 55.1421],
  [25.1852, 55.2612],
  [25.0988, 55.1555],
];

export async function projectMapMarkers(locale: Locale, viewLabel: string): Promise<MapMarker[]> {
  const projects = await prisma.project.findMany({
    where: { isPublished: true },
    orderBy: { id: 'asc' },
    include: {
      translations: { where: localeFilter(locale) },
      category: { select: { slug: true } },
    },
  });
  return projects.map((p, i) => {
    const hasReal = p.latitude != null && p.longitude != null;
    const [lat, lng] = hasReal
      ? [Number(p.latitude), Number(p.longitude)]
      : DUBAI_LOCATIONS[i % DUBAI_LOCATIONS.length];
    return {
      lat,
      lng,
      title: pickTranslation(p.translations, locale)?.title,
      href: `/${locale}/portfolio/${p.category.slug}/${p.slug}`,
      linkLabel: viewLabel,
    };
  });
}

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
