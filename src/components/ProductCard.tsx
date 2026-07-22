import Link from 'next/link';
import SmartImage from './SmartImage';
import { productMediaUrl } from '@/lib/media';
import { pickTranslation } from '@/lib/translate';
import type { Locale } from '@/i18n/config';

type ProductForCard = {
  slug: string;
  code: string | null;
  sizeLabel: string | null;
  translations: { localeCode: string; name: string }[];
  images: { s3Key: string; thumbKey: string | null; supplierUrl: string | null }[];
  source: { code: string };
};

// Image alt is derived from the translated product name at render time —
// no per-image i18n at this scale (docs/DATABASE.md §5).
export default function ProductCard({
  product,
  locale,
}: {
  product: ProductForCard;
  locale: Locale;
}) {
  const name = pickTranslation(product.translations, locale)?.name ?? product.code ?? '';
  const image = product.images[0];
  const src = image ? productMediaUrl(image.thumbKey ?? image.s3Key, product.source.code) : null;

  return (
    <Link
      href={`/${locale}/products/${product.slug}`}
      className="group bg-surface rounded-lg overflow-hidden border border-line hover:border-accent/60 transition-colors"
    >
      <div className="aspect-square bg-surface-2 overflow-hidden">
        {src && (
          <SmartImage
            src={src}
            fallbackSrc={image?.supplierUrl}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        )}
      </div>
      <div className="p-3">
        <p className="text-ink text-sm font-medium truncate" title={name}>
          {name}
        </p>
        {product.sizeLabel && <p className="text-muted text-xs mt-1 truncate">{product.sizeLabel}</p>}
      </div>
    </Link>
  );
}
