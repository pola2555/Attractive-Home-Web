import Link from 'next/link';
import VideoPlayer from '@/components/VideoPlayer';
import SmartImage from '@/components/SmartImage';
import { siteMediaUrl } from '@/lib/media';
import type { Locale } from '@/i18n/config';

// Hover-to-play video cover cards, same interaction as the old portfolio grid.
type ProjectForCard = {
  slug: string;
  coverKey: string | null;
  coverType: 'image' | 'video' | null;
  title: string;
  categorySlug: string;
  categoryLabel: string;
};

export default function ProjectCard({
  project,
  locale,
}: {
  project: ProjectForCard;
  locale: Locale;
}) {
  const href = `/${locale}/portfolio/${project.categorySlug}/${project.slug}`;
  return (
    <div className="relative group overflow-hidden sm:rounded-lg sm:shadow-lg">
      {/* The cover is the same destination as the title link below; give it an
          accessible name so a video cover (no alt) isn't an unnamed link. */}
      <Link href={href} className="block" aria-label={project.title}>
        <div className="relative overflow-hidden sm:rounded-lg sm:shadow-lg">
          {project.coverKey && project.coverType === 'video' ? (
            <VideoPlayer
              videoUrl={siteMediaUrl(project.coverKey)}
              className="w-full aspect-video object-cover"
              enableHoverPlay
              autoPlay={false}
              defaultMuted
              showMuteButton={false}
            />
          ) : project.coverKey ? (
            <SmartImage
              src={siteMediaUrl(project.coverKey)}
              alt={project.title}
              className="w-full aspect-video object-cover"
            />
          ) : (
            <div className="w-full aspect-video bg-surface-2" aria-hidden="true" />
          )}
        </div>
      </Link>
      <div className="mt-4 text-start px-2 sm:px-0 text-ink pb-6">
        <p className="text-sm uppercase text-muted">{project.categoryLabel}</p>
        <Link href={href}>
          <h3 className="text-xl font-bold text-ink hover:text-accent transition-colors">{project.title}</h3>
        </Link>
      </div>
    </div>
  );
}
