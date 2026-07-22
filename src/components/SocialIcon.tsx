// Brand glyphs from Font Awesome Free (CC BY 4.0) — the same icons the old
// site rendered via @fortawesome/react-fontawesome, extracted to plain SVG
// paths so no icon library is needed.
import iconPaths from './social-icon-paths.json';

type IconData = { width: number; height: number; path: string };
const icons = iconPaths as Record<string, IconData>;

export default function SocialIcon({
  platform,
  className = 'w-4 h-4',
}: {
  platform: string;
  className?: string;
}) {
  const icon = icons[platform];
  if (!icon) return null;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${icon.width} ${icon.height}`}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={icon.path} />
    </svg>
  );
}
