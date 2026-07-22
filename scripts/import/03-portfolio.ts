// §8 step 7 — portfolio: 3 categories → 41 projects in manifest order →
// sections (4-lang names) → media with section_id resolved from the old
// sections[].keys[] stems. Project timestamps are preserved from
// metadata.json (via raw UPDATE, because Prisma's @updatedAt overrides
// supplied values). lat/lng start NULL — today's map pins are fake (§6).
//
// DEV NOTE: runs against the repo backup copy in data/portfolio/. The real
// cutover import must use a FRESH S3 export (§8 sources) — the site is live.
import { uuidv7 } from 'uuidv7';
import { Prisma, MediaType } from '@prisma/client';
import { prisma, readJson, slugify, createManyBatched, trimmed } from './lib';

type Manifest = {
  categories: Record<string, { title: string; description?: string }>;
  projects: { id: string; category: string }[];
};
type SectionMeta = {
  id: string;
  names: Partial<Record<'en' | 'ar' | 'fr' | 'ru', string>>;
  keys: string[];
};
type ProjectMeta = {
  id: string;
  title: string;
  category: string;
  area?: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
  cover?: string;
  media?: { type: 'image' | 'video'; src: string }[];
  sections?: SectionMeta[];
};

export type PortfolioReport = {
  categories: number;
  projects: number;
  sections: number;
  sectionTranslations: number;
  media: number;
  mediaInSections: number;
};

// 'projects/.../media/media_x_y.webp' → 'media_x_y'; a video's
// '.../media_x_y/master.m3u8' → 'media_x_y'.
function baseKeyOf(src: string): string {
  const parts = src.split('/');
  const file = parts[parts.length - 1];
  if (file === 'master.m3u8') return parts[parts.length - 2];
  return file.replace(/\.[a-z0-9]+$/i, '');
}

// The manifest embeds JSX-indented multi-line strings; collapse whitespace.
function cleanText(value: string | undefined): string | null {
  const collapsed = (value ?? '').replace(/\s+/g, ' ').trim();
  return collapsed || null;
}

export async function importPortfolio(): Promise<PortfolioReport> {
  const manifest = readJson<Manifest>('portfolio/projects.json');

  const report: PortfolioReport = {
    categories: 0,
    projects: 0,
    sections: 0,
    sectionTranslations: 0,
    media: 0,
    mediaInSections: 0,
  };

  // Categories — legacy_key architectural|interior|fit; slug kept identical to
  // the old URL segment (/portfolio/<key>) for redirect parity. EN copy from
  // the manifest; ar/fr/ru are data-entry work (§6).
  const categoryIdByKey = new Map<string, string>();
  for (const [index, key] of Object.keys(manifest.categories).entries()) {
    const cat = manifest.categories[key];
    const row = await prisma.portfolioCategory.upsert({
      where: { legacyKey: key },
      update: {},
      create: { id: uuidv7(), legacyKey: key, slug: key, sortOrder: index },
    });
    categoryIdByKey.set(key, row.id);
    await prisma.portfolioCategoryTranslation.upsert({
      where: { portfolioCategoryId_localeCode: { portfolioCategoryId: row.id, localeCode: 'en' } },
      update: {},
      create: {
        id: uuidv7(),
        portfolioCategoryId: row.id,
        localeCode: 'en',
        title: cat.title,
        description: cleanText(cat.description),
      },
    });
    report.categories += 1;
  }

  const existingProjects = await prisma.project.findMany({
    select: { id: true, legacyId: true, slug: true },
  });
  const projectByLegacy = new Map(existingProjects.map((p) => [p.legacyId, p]));
  const usedSlugs = new Set(existingProjects.map((p) => p.slug));
  const existingSections = await prisma.projectSection.findMany({
    select: { id: true, legacyId: true },
  });
  const sectionIdByLegacy = new Map(
    existingSections.filter((s) => s.legacyId).map((s) => [s.legacyId as string, s.id]),
  );

  const projectRows: Prisma.ProjectCreateManyInput[] = [];
  const projectTrRows: Prisma.ProjectTranslationCreateManyInput[] = [];
  const sectionRows: Prisma.ProjectSectionCreateManyInput[] = [];
  const sectionTrRows: Prisma.ProjectSectionTranslationCreateManyInput[] = [];
  const mediaRows: Prisma.ProjectMediaCreateManyInput[] = [];
  const timestamps: { id: string; createdAt: Date; updatedAt: Date }[] = [];

  const perCategoryOrder = new Map<string, number>();

  for (const entry of manifest.projects) {
    const md = readJson<ProjectMeta>(`portfolio/projects/${entry.category}/${entry.id}/metadata.json`);
    const categoryId = categoryIdByKey.get(md.category);
    if (!categoryId) throw new Error(`Unknown portfolio category "${md.category}" on ${md.id}`);

    const sortOrder = perCategoryOrder.get(md.category) ?? 0;
    perCategoryOrder.set(md.category, sortOrder + 1);

    const prior = projectByLegacy.get(md.id);
    const projectId = prior?.id ?? uuidv7();
    let slug: string;
    if (prior) {
      slug = prior.slug;
    } else {
      const base = slugify(md.title) || md.id;
      slug = usedSlugs.has(base) ? `${base}-${md.id.replace(/^project-/, '')}` : base;
      usedSlugs.add(slug);
    }

    const createdAt = new Date(md.createdAt);
    const updatedAt = md.updatedAt ? new Date(md.updatedAt) : createdAt;
    timestamps.push({ id: projectId, createdAt, updatedAt });

    projectRows.push({
      id: projectId,
      legacyId: md.id,
      categoryId,
      slug,
      coverKey: trimmed(md.cover) || null,
      coverType: md.cover ? (md.cover.endsWith('.m3u8') ? MediaType.video : MediaType.image) : null,
      sortOrder,
      createdAt,
    });
    report.projects += 1;

    projectTrRows.push({
      id: uuidv7(),
      projectId,
      localeCode: 'en',
      title: md.title,
      areaLabel: trimmed(md.area) || null,
      description: cleanText(md.description),
    });

    // Sections — legacy 'sec_<b36>_<rand>' ids; names already 4-lang today,
    // seeded for every locale with real content (§6, §3).
    const sectionIdByStem = new Map<string, string>();
    for (const [index, section] of (md.sections ?? []).entries()) {
      const sectionId = sectionIdByLegacy.get(section.id) ?? uuidv7();
      if (!sectionIdByLegacy.has(section.id)) {
        sectionRows.push({ id: sectionId, projectId, legacyId: section.id, sortOrder: index });
        sectionIdByLegacy.set(section.id, sectionId);
      }
      report.sections += 1;
      for (const stem of section.keys) sectionIdByStem.set(stem, sectionId);
      for (const locale of ['en', 'ar', 'fr', 'ru'] as const) {
        const name = trimmed(section.names[locale]);
        if (!name) continue;
        sectionTrRows.push({
          id: uuidv7(),
          projectSectionId: sectionId,
          localeCode: locale,
          name,
        });
        report.sectionTranslations += 1;
      }
    }

    // Media — the old sections[].keys[] mapping becomes the section_id FK;
    // media not claimed by any section stay NULL (the old 'Other' tab).
    for (const [index, media] of (md.media ?? []).entries()) {
      const baseKey = baseKeyOf(media.src);
      const sectionId = sectionIdByStem.get(baseKey) ?? null;
      if (sectionId) report.mediaInSections += 1;
      mediaRows.push({
        id: uuidv7(),
        projectId,
        sectionId,
        mediaType: media.type === 'video' ? MediaType.video : MediaType.image,
        baseKey,
        s3Key: media.src,
        sortOrder: index,
        createdAt,
      });
      report.media += 1;
    }
  }

  const createdProjects = await createManyBatched(prisma.project, projectRows);
  await createManyBatched(prisma.projectTranslation, projectTrRows);
  await createManyBatched(prisma.projectSection, sectionRows);
  await createManyBatched(prisma.projectSectionTranslation, sectionTrRows);
  const createdMedia = await createManyBatched(prisma.projectMedia, mediaRows);

  // §8 step 7 "timestamps preserved" — raw UPDATE because @updatedAt would
  // stamp now() on any Prisma-level write.
  for (const t of timestamps) {
    await prisma.$executeRaw`UPDATE projects SET created_at = ${t.createdAt}, updated_at = ${t.updatedAt} WHERE id = ${t.id}::uuid`;
  }

  console.log(
    `03-portfolio: ${report.categories} categories, ${report.projects} projects ` +
      `(${createdProjects} new), ${report.sections} sections ` +
      `(${report.sectionTranslations} translations), ${report.media} media ` +
      `(${createdMedia} new, ${report.mediaInSections} in sections)`,
  );
  return report;
}
