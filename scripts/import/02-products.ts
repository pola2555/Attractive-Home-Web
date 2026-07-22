// §8 steps 4–6 — products: merge full records (products.json) + listing
// (catalog-listing.json: ONLY source of fr/ru names + availability) + legacy
// Shopify catalog (shopify_product_id, handle→slug, legacy_meta). Idempotent:
// ids are reused from existing rows and every createMany skips duplicates on
// legacy/natural unique keys.
import { uuidv7 } from 'uuidv7';
import { Prisma } from '@prisma/client';
import { prisma, readJson, slugify, mediaKeyFromUrl, createManyBatched, trimmed } from './lib';
import { canonicalBrand, canonicalColor, canonicalMaterial } from './canonical';

type ListingProduct = {
  id: string;
  t?: string;
  ta?: string;
  tz?: string;
  tf?: string;
  tr?: string;
  av?: boolean;
  img?: { src?: string; fallback?: string };
};
type ListingFile = { products: ListingProduct[] };

type FullProduct = {
  id: string;
  source: 'catalog' | 'attractivehome';
  brand?: string;
  code?: string;
  name: { en?: string; ar?: string; zh?: string };
  type?: string;
  material?: string;
  look?: string;
  color?: string;
  finish?: string;
  application?: string[];
  performance?: string[];
  size?: string;
  collection?: string;
  images?: { src: string; fallback?: string }[];
  desc?: { en?: string; ar?: string };
  use?: { en?: string; ar?: string };
  commerce?: {
    selling_type?: string;
    packing?: string;
    weight?: string;
    available?: boolean;
  } | null;
  url?: string;
};
type FullFile = { products: FullProduct[] };

type ShopifyRecord = {
  product_id: number;
  title?: string;
  handle: string;
  product_url?: string;
  tags?: string[];
  product_number?: string;
  size_per_piece?: string;
  sheet_size?: string;
  shape?: string;
  usage_image_url?: string;
  description_paragraphs?: string[];
  body_images?: string[];
};

export type ProductsReport = {
  sourceProducts: number;
  productsEnsured: number;
  translationRows: Record<string, number>;
  imageRows: number;
  applicationRows: number;
  performanceRows: number;
  aliasHits: Record<string, number>;
  junkBrandProducts: number;
  slugSuffixed: string[];
  shopifyMatched: number;
  externalImageUrls: number;
};

function pruneEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export async function importProducts(): Promise<ProductsReport> {
  const listing = readJson<ListingFile>('catalog/catalog-listing.json');
  const full = readJson<FullFile>('catalog/products.json');
  const shopify = readJson<ShopifyRecord[]>('catalog/shopify-catalog.json');

  const listingById = new Map(listing.products.map((p) => [p.id, p]));
  const shopifyById = new Map(shopify.map((r) => [String(r.product_id), r]));

  const facetMap = async (rows: Promise<{ id: string; code: string }[]>) =>
    new Map((await rows).map((r) => [r.code, r.id]));
  const select = { select: { id: true, code: true } };
  const [types, materials, looks, colors, finishes, collections, brands, sources, applications, perfs] =
    await Promise.all([
      facetMap(prisma.productType.findMany(select)),
      facetMap(prisma.material.findMany(select)),
      facetMap(prisma.look.findMany(select)),
      facetMap(prisma.color.findMany(select)),
      facetMap(prisma.finish.findMany(select)),
      facetMap(prisma.collection.findMany(select)),
      facetMap(prisma.brand.findMany(select)),
      facetMap(prisma.source.findMany(select)),
      facetMap(prisma.application.findMany(select)),
      facetMap(prisma.performanceAttribute.findMany(select)),
    ]);

  // §8 step 3 — an unknown facet value at import is a hard failure.
  const resolve = (map: Map<string, string>, facet: string, value: string | null, productId: string) => {
    if (!value) return null;
    const id = map.get(value);
    if (!id) throw new Error(`Unknown ${facet} value "${value}" on product ${productId}`);
    return id;
  };

  const existing = await prisma.product.findMany({
    select: { id: true, legacyId: true, slug: true },
  });
  const existingByLegacy = new Map(existing.map((p) => [p.legacyId, p]));
  const usedSlugs = new Set(existing.map((p) => p.slug));

  const report: ProductsReport = {
    sourceProducts: full.products.length,
    productsEnsured: 0,
    translationRows: { en: 0, ar: 0, zh: 0, fr: 0, ru: 0 },
    imageRows: 0,
    applicationRows: 0,
    performanceRows: 0,
    aliasHits: {},
    junkBrandProducts: 0,
    slugSuffixed: [],
    shopifyMatched: 0,
    externalImageUrls: 0,
  };
  const hit = (alias: string) => {
    report.aliasHits[alias] = (report.aliasHits[alias] ?? 0) + 1;
  };

  const productRows: Prisma.ProductCreateManyInput[] = [];
  const translationRows: Prisma.ProductTranslationCreateManyInput[] = [];
  const imageRows: Prisma.ProductImageCreateManyInput[] = [];
  const applicationRows: Prisma.ProductApplicationCreateManyInput[] = [];
  const performanceRows: Prisma.ProductPerformanceCreateManyInput[] = [];

  for (const p of full.products) {
    const ls = listingById.get(p.id);
    if (!ls) throw new Error(`Product ${p.id} missing from catalog-listing.json`);
    const sh = p.id.startsWith('AH') ? shopifyById.get(p.id.slice(2)) : undefined;
    if (p.id.startsWith('AH') && !sh) {
      throw new Error(`Shopify record not found for ${p.id} (expected product_id ${p.id.slice(2)})`);
    }
    if (sh) report.shopifyMatched += 1;

    const prior = existingByLegacy.get(p.id);
    const productId = prior?.id ?? uuidv7();

    const material = canonicalMaterial(trimmed(p.material));
    if (material.aliased) hit(`material:${trimmed(p.material)}`);
    const color = canonicalColor(trimmed(p.color));
    if (color.aliased) hit(`color:${trimmed(p.color)}`);
    const brand = canonicalBrand(trimmed(p.brand));
    if (brand.junk) {
      hit(`brand:${trimmed(p.brand)}`);
      report.junkBrandProducts += 1;
    }

    const code = trimmed(p.code) || null;
    const nameEn = trimmed(p.name.en) || code || p.id;

    // §8 step 5 — slugs: Shopify handle verbatim; else slugify(en name);
    // bare-SKU products (name == code) end up slugified from the code.
    // Collisions get a legacy-id suffix. Existing products keep their slug.
    let slug: string;
    if (prior) {
      slug = prior.slug;
    } else {
      const base = sh ? sh.handle : slugify(nameEn) || slugify(code ?? p.id) || p.id.toLowerCase();
      slug = base;
      if (usedSlugs.has(slug)) {
        slug = `${base}-${p.id.toLowerCase()}`;
        report.slugSuffixed.push(slug);
      }
      usedSlugs.add(slug);
    }

    // Shopify leftovers (docs/DATABASE.md §5 legacy_meta) + junk-brand original.
    const legacyMeta = pruneEmpty({
      tags: sh?.tags,
      description_paragraphs: sh?.description_paragraphs,
      product_number: sh?.product_number,
      size_per_piece: sh?.size_per_piece,
      sheet_size: sh?.sheet_size,
      shape: sh?.shape,
      usage_image_url: sh?.usage_image_url,
      body_images: sh?.body_images,
      original_brand: brand.junk ? trimmed(p.brand) : undefined,
    });

    productRows.push({
      id: productId,
      legacyId: p.id,
      shopifyProductId: sh ? BigInt(sh.product_id) : null,
      slug,
      sourceId: resolve(sources, 'source', p.source, p.id) as string,
      brandId: resolve(brands, 'brand', brand.value, p.id),
      code,
      typeId: resolve(types, 'type', trimmed(p.type) || null, p.id),
      materialId: resolve(materials, 'material', material.value, p.id),
      lookId: resolve(looks, 'look', trimmed(p.look) || null, p.id),
      colorId: resolve(colors, 'color', color.value, p.id),
      finishId: resolve(finishes, 'finish', trimmed(p.finish) || null, p.id),
      collectionId: resolve(collections, 'collection', trimmed(p.collection) || null, p.id),
      sizeLabel: trimmed(p.size) || null,
      sellingType: trimmed(p.commerce?.selling_type) || null,
      packing: trimmed(p.commerce?.packing) || null,
      weightLabel: trimmed(p.commerce?.weight) || null,
      isAvailable: ls.av !== false,
      supplierUrl: trimmed(p.url) || trimmed(sh?.product_url) || null,
      legacyMeta: Object.keys(legacyMeta).length ? (legacyMeta as Prisma.InputJsonValue) : undefined,
    });

    // §8 step 4 — translation rows only where content exists; locales that
    // merely duplicate en are skipped, EXCEPT zh (always kept — §3).
    const descEn = trimmed(p.desc?.en) || null;
    const useEn = trimmed(p.use?.en) || null;
    translationRows.push({
      id: uuidv7(),
      productId,
      localeCode: 'en',
      name: nameEn,
      description: descEn,
      usageNotes: useEn,
    });
    report.translationRows.en += 1;

    const nameAr = trimmed(p.name.ar);
    const descAr = trimmed(p.desc?.ar) || null;
    const useAr = trimmed(p.use?.ar) || null;
    if (
      (nameAr && nameAr !== nameEn) ||
      (descAr && descAr !== descEn) ||
      (useAr && useAr !== useEn)
    ) {
      translationRows.push({
        id: uuidv7(),
        productId,
        localeCode: 'ar',
        name: nameAr || nameEn,
        description: descAr,
        usageNotes: useAr,
      });
      report.translationRows.ar += 1;
    }

    const nameZh = trimmed(p.name.zh);
    if (nameZh) {
      translationRows.push({ id: uuidv7(), productId, localeCode: 'zh', name: nameZh });
      report.translationRows.zh += 1;
    }

    // fr/ru names exist ONLY in catalog-listing.json (§8 sources).
    const nameFr = trimmed(ls.tf);
    if (nameFr && nameFr !== nameEn) {
      translationRows.push({ id: uuidv7(), productId, localeCode: 'fr', name: nameFr });
      report.translationRows.fr += 1;
    }
    const nameRu = trimmed(ls.tr);
    if (nameRu && nameRu !== nameEn) {
      translationRows.push({ id: uuidv7(), productId, localeCode: 'ru', name: nameRu });
      report.translationRows.ru += 1;
    }

    // §8 step 6 — images: sort_order = array index; index 0 carries the thumb
    // key from the listing when it differs from the display key.
    for (const [index, img] of (p.images ?? []).entries()) {
      const { key: s3Key, external } = mediaKeyFromUrl(img.src);
      if (external) report.externalImageUrls += 1;
      let thumbKey: string | null = null;
      if (index === 0 && ls.img?.src) {
        const { key: listingKey, external: thumbExternal } = mediaKeyFromUrl(ls.img.src);
        if (!thumbExternal && listingKey !== s3Key) thumbKey = listingKey;
      }
      imageRows.push({
        id: uuidv7(),
        productId,
        sortOrder: index,
        s3Key,
        thumbKey,
        supplierUrl: trimmed(img.fallback) || null,
      });
    }

    for (const app of p.application ?? []) {
      const applicationId = resolve(applications, 'application', trimmed(app) || null, p.id);
      if (applicationId) applicationRows.push({ productId, applicationId });
    }
    for (const perf of p.performance ?? []) {
      const performanceAttributeId = resolve(perfs, 'performance', trimmed(perf) || null, p.id);
      if (performanceAttributeId) performanceRows.push({ productId, performanceAttributeId });
    }
  }

  report.productsEnsured = productRows.length;
  report.imageRows = imageRows.length;
  report.applicationRows = applicationRows.length;
  report.performanceRows = performanceRows.length;

  const createdProducts = await createManyBatched(prisma.product, productRows);
  const createdTranslations = await createManyBatched(prisma.productTranslation, translationRows);
  const createdImages = await createManyBatched(prisma.productImage, imageRows);
  const createdApplications = await createManyBatched(prisma.productApplication, applicationRows);
  const createdPerformance = await createManyBatched(prisma.productPerformance, performanceRows);

  console.log(
    `02-products: ${report.productsEnsured} products (${createdProducts} new), ` +
      `translations en=${report.translationRows.en} ar=${report.translationRows.ar} ` +
      `zh=${report.translationRows.zh} fr=${report.translationRows.fr} ru=${report.translationRows.ru} ` +
      `(${createdTranslations} new), images=${report.imageRows} (${createdImages} new), ` +
      `applications=${report.applicationRows} (${createdApplications} new), ` +
      `performance=${report.performanceRows} (${createdPerformance} new), ` +
      `shopify matched=${report.shopifyMatched}, junk-brand products=${report.junkBrandProducts}, ` +
      `slug suffixed=${report.slugSuffixed.length}, external image URLs=${report.externalImageUrls}`,
  );
  return report;
}
