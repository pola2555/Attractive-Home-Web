// Media binaries stay on S3; the DB stores bucket-relative keys
// (docs/DATABASE.md). Two buckets exist today:
//  - attractive.home.ae      — site media (Main/, Services/), portfolio
//                              projects/ and Shopify-era product-images/
//  - chinas-catalog-media    — catalog-source product media, visualizer assets
// A key starting with http(s) is an absolute URL stored as-is (the one
// never-mirrored CDN image) and is returned unchanged.
const SITE_MEDIA_BASE = (
  process.env.NEXT_PUBLIC_MEDIA_BASE ?? 'https://s3.ap-south-1.amazonaws.com/attractive.home.ae'
).replace(/\/$/, '');

const CATALOG_MEDIA_BASE = (
  process.env.NEXT_PUBLIC_CATALOG_MEDIA_BASE ??
  'https://s3.ap-south-1.amazonaws.com/chinas-catalog-media'
).replace(/\/$/, '');

function join(base: string, key: string): string {
  return /^https?:\/\//.test(key) ? key : `${base}/${key.replace(/^\/+/, '')}`;
}

export function siteMediaUrl(key: string): string {
  return join(SITE_MEDIA_BASE, key);
}

// Product media bucket is derivable from products.source (docs/DATABASE.md §8).
export function productMediaUrl(key: string, sourceCode: string): string {
  return join(sourceCode === 'catalog' ? CATALOG_MEDIA_BASE : SITE_MEDIA_BASE, key);
}

export function catalogMediaUrl(key: string): string {
  return join(CATALOG_MEDIA_BASE, key);
}
