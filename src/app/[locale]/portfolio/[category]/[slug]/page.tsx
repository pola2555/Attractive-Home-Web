import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { isLocale, type Locale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { getProject } from '@/lib/portfolio';
import { prisma } from '@/lib/prisma';
import { pickTranslation } from '@/lib/translate';
import { siteMediaUrl } from '@/lib/media';
import { alternates } from '@/lib/seo';
import VideoPlayer from '@/components/VideoPlayer';
import SmartImage from '@/components/SmartImage';

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; category: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, category, slug } = await params;
  if (!isLocale(locale)) return {};
  const project = await getProject(locale, slug);
  if (!project || !project.isPublished) return {};
  const tr = pickTranslation(project.translations, locale);
  return {
    title: tr?.metaTitle ?? tr?.title,
    description: tr?.metaDescription ?? tr?.description ?? undefined,
    alternates: alternates(locale, `/portfolio/${category}/${slug}`),
  };
}

type MediaGroup = { key: string; name: string | null; media: { id: string; s3Key: string; mediaType: string }[] };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ locale: string; category: string; slug: string }>;
}) {
  const { locale, category, slug } = await params;
  if (!isLocale(locale)) notFound();

  const project = await getProject(locale, slug);
  if (!project) {
    // 301 for old SPA URLs /portfolio/{category}/{legacy-id} (docs/DATABASE.md §2 —
    // legacy ids are kept UNIQUE precisely for these redirects).
    const byLegacy = await prisma.project.findUnique({
      where: { legacyId: slug },
      select: { slug: true, category: { select: { slug: true } } },
    });
    if (byLegacy) permanentRedirect(`/${locale}/portfolio/${byLegacy.category.slug}/${byLegacy.slug}`);
    notFound();
  }
  if (!project.isPublished || project.category.slug !== category) notFound();

  const dict = await getDictionary(locale, 'portfolio');
  const tr = pickTranslation(project.translations, locale);
  const title = tr?.title ?? project.slug;

  // Group media by section (sections in sort order; unsectioned media go to
  // the trailing "Gallery" group — the old 'Other' tab).
  const groups: MediaGroup[] = project.sections.map((section) => ({
    key: section.id,
    name: pickTranslation(section.translations, locale as Locale)?.name ?? null,
    media: project.media.filter((m) => m.sectionId === section.id),
  }));
  const other = project.media.filter((m) => m.sectionId === null);
  if (other.length) groups.push({ key: 'other', name: groups.length ? t(dict, 'sectionOther') : null, media: other });

  return (
    <section className="bg-bg min-h-screen pb-16">
      {/* Cover */}
      <div className="relative h-[60vh] overflow-hidden">
        {project.coverKey && project.coverType === 'video' ? (
          <VideoPlayer
            videoUrl={siteMediaUrl(project.coverKey)}
            className="absolute inset-0 w-full h-full object-cover"
            showMuteButton={false}
            priority
          />
        ) : project.coverKey ? (
          <SmartImage
            src={siteMediaUrl(project.coverKey)}
            alt={title}
            loading="eager"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-bg-deep" aria-hidden="true" />
        )}
        <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10 text-on-media">
          <nav className="text-sm text-on-media-soft mb-2" aria-label="Breadcrumb">
            <Link href={`/${locale}/portfolio`} className="hover:underline">
              {t(dict, 'title')}
            </Link>
            <span className="mx-2">/</span>
            <Link href={`/${locale}/portfolio/${category}`} className="hover:underline uppercase">
              {t(dict, `categories.${project.category.legacyKey}.title`)}
            </Link>
          </nav>
          <h1 className="text-3xl sm:text-5xl font-bold">{title}</h1>
          {tr?.areaLabel && <p className="text-on-media-soft mt-2">{tr.areaLabel}</p>}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-10 space-y-14">
        {tr?.description && <p className="text-ink-soft max-w-3xl leading-relaxed">{tr.description}</p>}

        {groups.map((group) => (
          <div key={group.key}>
            {group.name && <h2 className="text-2xl font-bold text-heading mb-6">{group.name}</h2>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.media.map((media, index) =>
                media.mediaType === 'video' ? (
                  <VideoPlayer
                    key={media.id}
                    videoUrl={siteMediaUrl(media.s3Key)}
                    className="w-full h-64 object-cover rounded-lg"
                    autoPlay={false}
                    showMuteButton={false}
                    clickToPlay
                  />
                ) : (
                  <SmartImage
                    key={media.id}
                    src={siteMediaUrl(media.s3Key)}
                    alt={`${title}${group.name ? ` — ${group.name}` : ''} ${index + 1}`}
                    className="w-full h-64 object-cover rounded-lg bg-surface-2"
                  />
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
