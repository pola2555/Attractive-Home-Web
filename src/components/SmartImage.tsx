'use client';

import { useState } from 'react';

// S3-hosted media with a supplier-CDN fallback (product_images.supplier_url —
// docs/DATABASE.md §5): if the S3 object 404s or times out, swap to the
// fallback URL once. Plain <img> because fallback hosts are arbitrary
// supplier domains that can't be whitelisted for next/image.
type SmartImageProps = {
  src: string;
  // Optional responsive candidates (e.g. "thumb 400w, display 1000w") + the
  // sizes hint. The browser then downloads only the variant it needs — a small
  // thumb for a grid tile on a phone, the full image on a large/retina screen.
  // Dropped on fallback: supplier CDN URLs have no resized variants.
  srcSet?: string;
  sizes?: string;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  width?: number;
  height?: number;
};

export default function SmartImage({
  src,
  srcSet,
  sizes,
  fallbackSrc,
  alt,
  className,
  loading = 'lazy',
  width,
  height,
}: SmartImageProps) {
  const [failed, setFailed] = useState(false);
  const effective = failed && fallbackSrc ? fallbackSrc : src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={effective}
      srcSet={failed ? undefined : srcSet}
      sizes={failed ? undefined : sizes}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      width={width}
      height={height}
      onError={() => {
        if (!failed && fallbackSrc) setFailed(true);
      }}
    />
  );
}
