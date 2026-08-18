import Link from 'next/link';
import { productMediaUrl } from '@/lib/media';
import type { CatalogFilters, FacetKey, FacetValue, RepImage } from '@/lib/catalog';
import type { ShopBySection, ShopKey } from '@/lib/catalogShopByConfig';
import { catalogHref } from './FiltersSidebar';

// "Shop by …" browse tiles — shown above the grid on the unfiltered landing.
// Which sections show, their order, how many cards each shows, the card order,
// and the per-card tile image are all driven by the admin config
// (settings['catalog.shopby']); with no config it mirrors the old behaviour
// (ranked by count, auto-picked image). Colour renders as swatches; the rest as
// image tiles with a dark gradient overlay.

type ShopReps = {
  type: Map<string, RepImage>;
  look: Map<string, RepImage>;
  collection: Map<string, RepImage>;
  application: Map<string, RepImage>;
};

// Manual-order prefix, then count order for everything else.
function orderValues(values: FacetValue[], order: string[]): FacetValue[] {
  if (!order.length) return [...values].sort((a, b) => b.count - a.count);
  const idx = new Map(order.map((code, i) => [code, i]));
  return [...values].sort((a, b) => {
    const ai = idx.has(a.code) ? (idx.get(a.code) as number) : Infinity;
    const bi = idx.has(b.code) ? (idx.get(b.code) as number) : Infinity;
    if (ai !== bi) return ai - bi;
    return b.count - a.count;
  });
}

export default function ShopByTiles({
  locale,
  filters,
  facets,
  sections,
  reps,
  pickImages,
  labels,
}: {
  locale: string;
  filters: CatalogFilters;
  facets: Record<FacetKey, FacetValue[]>;
  sections: ShopBySection[];
  reps: ShopReps;
  pickImages: Map<string, RepImage>;
  labels: Record<ShopKey, string>;
}) {
  return (
    <div className="mb-10 space-y-6">
      {sections.map((section) => {
        if (!section.visible) return null;
        const isColor = section.key === 'color';
        const values = orderValues(facets[section.key], section.order).slice(0, section.limit);
        if (values.length === 0) return null;
        const repMap = isColor ? null : (reps[section.key as keyof ShopReps]);

        return (
          <section key={section.key}>
            <h2 className="text-heading font-extrabold text-[15px] mt-2 mb-2.5">{labels[section.key]}</h2>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${isColor ? '96px' : '160px'}, 1fr))`,
              }}
            >
              {values.map((value) => {
                const href = catalogHref(locale, filters, { [section.key]: [value.code] });
                if (isColor) {
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
                const pickId = section.picks[value.code];
                const rep = (pickId && pickImages.get(pickId)) || repMap?.get(value.code);
                const url = rep ? productMediaUrl(rep.s3Key, rep.sourceCode) : null;
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
