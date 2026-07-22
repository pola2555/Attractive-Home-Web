'use client';

import { useState } from 'react';

// S3-hosted media with a supplier-CDN fallback (product_images.supplier_url —
// docs/DATABASE.md §5): if the S3 object 404s or times out, swap to the
// fallback URL once. Plain <img> because fallback hosts are arbitrary
// supplier domains that can't be whitelisted for next/image.
type SmartImageProps = {
  src: string;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  width?: number;
  height?: number;
};

export default function SmartImage({
  src,
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
      alt={alt}
      className={className}
      loading={loading}
      width={width}
      height={height}
      onError={() => {
        if (!failed && fallbackSrc) setFailed(true);
      }}
    />
  );
}
