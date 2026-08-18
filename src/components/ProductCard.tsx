import Link from 'next/link';
import SmartImage from './SmartImage';
import CardActions from './CardActions';
import { productMediaUrl } from '@/lib/media';
import { pickTranslation } from '@/lib/translate';
import type { Locale } from '@/i18n/config';

type Named = { translations: { localeCode: string; name: string }[] } | null | undefined;

type ProductForCard = {
  id: string;
  slug: string;
  code: string | null;
  translations: { localeCode: string; name: string }[];
  images: { s3Key: string; thumbKey: string | null; supplierUrl: string | null }[];
  source: { code: string };
  brand?: Named;
  type?: Named;
  look?: Named;
  material?: Named;
  collection?: Named;
  color?: { code: string; hex: string | null } | null;
};

const nameOf = (n: Named, locale: Locale) => (n ? pickTranslation(n.translations, locale)?.name ?? null : null);

// Catalog/related product tile — matches the old card: type/look tag chips,
// source badge, colour dot, hover Save/Compare actions, name + collection·material.
export default function ProductCard({ product, locale }: { product: ProductForCard; locale: Locale }) {
  const name = pickTranslation(product.translations, locale)?.name ?? product.code ?? '';
  const image = product.images[0];
  // Use the full display image (s3Key) rather than the small thumbnail so cards
  // stay crisp at the larger tile size; SmartImage falls back to the supplier URL.
  const src = image ? productMediaUrl(image.s3Key, product.source.code) : null;

  const typeName = nameOf(product.type, locale);
  const lookName = nameOf(product.look, locale);
  const tags = [typeName, lookName].filter(Boolean).slice(0, 2) as string[];

  const brandName = nameOf(product.brand, locale);
  const isAH = product.source.code === 'attractivehome';
  const badge = isAH ? 'Mosycle' : brandName;

  const sub = [nameOf(product.collection, locale), nameOf(product.material, locale)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="group relative bg-surface rounded-xl overflow-hidden border border-line shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl hover:border-accent/70">
      <div className="relative aspect-square bg-surface-2 overflow-hidden">
        {src && (
          <SmartImage
            src={src}
            fallbackSrc={image?.supplierUrl}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        )}

        {tags.length > 0 && (
          <div className="absolute top-2 start-2 flex flex-wrap gap-1.5 z-0">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-[7px] px-1.5 py-0.5 text-[10px] font-bold text-on-media bg-bg-deep/80"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {badge && (
          <div
            className={`absolute top-2 end-2 z-0 rounded-md px-1.5 py-0.5 text-[9px] font-extrabold text-white ${
              isAH ? 'bg-bg-deep' : 'bg-accent'
            }`}
          >
            {badge}
          </div>
        )}

        {product.color?.hex && (
          <div
            className="absolute bottom-2 start-2 z-0 w-[15px] h-[15px] rounded-full border-2 border-white shadow"
            style={{ backgroundColor: product.color.hex }}
            title={product.color.code}
          />
        )}

        <CardActions productId={product.id} className="absolute bottom-2 end-2 z-20" />

        {/* Stretched link — covers the card for navigation; sits below the action buttons (z-20). */}
        <Link href={`/${locale}/products/${product.slug}`} aria-label={name} className="absolute inset-0 z-10" />
      </div>

      <div className="p-3.5">
        <p className="text-ink text-[15px] font-semibold leading-snug truncate" title={name}>
          {name}
        </p>
        {sub && <p className="text-muted text-xs mt-1 truncate">{sub}</p>}
      </div>
    </div>
  );
}
