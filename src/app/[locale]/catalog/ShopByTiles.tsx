import Link from 'next/link';
import { productMediaUrl } from '@/lib/media';
import type { CatalogFilters, FacetKey, FacetValue, RepImage } from '@/lib/catalog';
import { catalogHref } from './FiltersSidebar';

// "Shop by …" browse tiles — shown above the grid when no facet/search is
// active (mirrors the old catalog landing). Tiles are ranked by count and link
// into the filtered catalog. Colour renders as swatches; the rest as image
// tiles with a dark gradient overlay.

type ShopReps = {
  type: Map<string, RepImage>;
  look: Map<string, RepImage>;
  collection: Map<string, RepImage>;
  application: Map<string, RepImage>;
};

const SECTIONS: { key: Extract<FacetKey, 'application' | 'look' | 'color' | 'type' | 'collection'>; limit: number; color?: boolean }[] = [
  { key: 'application', limit: 8 },
  { key: 'look', limit: 10 },
  { key: 'color', limit: 30, color: true },
  { key: 'type', limit: 8 },
  { key: 'collection', limit: 8 },
];

export default function ShopByTiles({
  locale,
  filters,
  facets,
  reps,
  labels,
}: {
  locale: string;
  filters: CatalogFilters;
  facets: Record<FacetKey, FacetValue[]>;
  reps: ShopReps;
  labels: Record<'application' | 'look' | 'color' | 'type' | 'collection', string>;
}) {
  return (
    <div className="mb-10 space-y-6">
      {SECTIONS.map(({ key, limit, color }) => {
        const values = [...facets[key]].sort((a, b) => b.count - a.count).slice(0, limit);
        if (values.length === 0) return null;
        const repMap = color ? null : (reps[key as keyof ShopReps] as Map<string, RepImage>);

        return (
          <section key={key}>
            <h2 className="text-heading font-extrabold text-[15px] mt-2 mb-2.5">{labels[key]}</h2>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${color ? '96px' : '150px'}, 1fr))`,
              }}
            >
              {values.map((value) => {
                const href = catalogHref(locale, filters, { [key]: [value.code] });
                if (color) {
                  return (
                    <Link
                      key={value.code}
                      href={href}
                      className="relative rounded-[14px] overflow-hidden aspect-square border border-line block"
                      style={{ backgroundColor: value.hex ?? '#9aa4ab' }}
                    >
                      <span className="absolute inset-0 flex flex-col justify-end p-2 bg-gradient-to-b from-black/10 to-black/70 text-white">
                        <b className="text-xs font-bold leading-tight truncate">{value.name}</b>
                        <span className="text-[10px] opacity-85">{value.count}</span>
                      </span>
                    </Link>
                  );
                }
                const rep = repMap?.get(value.code);
                const url = rep ? productMediaUrl(rep.thumbKey ?? rep.s3Key, rep.sourceCode) : null;
                return (
                  <Link
                    key={value.code}
                    href={href}
                    className="relative rounded-[14px] overflow-hidden aspect-[4/3] border border-line shadow bg-surface-2 bg-cover bg-center block"
                    style={url ? { backgroundImage: `url('${url}')` } : undefined}
                  >
                    <span className="absolute inset-0 flex flex-col justify-end p-3 bg-gradient-to-b from-black/15 to-black/70 text-white">
                      <b className="text-[15px] font-bold leading-tight truncate">{value.name}</b>
                      <span className="text-xs opacity-85">{value.count}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
