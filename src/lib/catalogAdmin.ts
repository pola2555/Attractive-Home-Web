import 'server-only';
import { prisma } from './prisma';
import { productMediaUrl } from './media';
import { LOCALES, type Locale } from '@/i18n/config';

// Admin-side catalog helpers (dashboard is English-only). Kept separate from
// the public `catalog.ts` so the read-optimised public query paths stay lean.

export type FacetOption = { id: string; code: string; name: string; isActive: boolean };

// Every facet vocabulary a product form needs, in one shape. `hex` only on colors.
export type FacetOptions = {
  sources: FacetOption[];
  types: FacetOption[];
  materials: FacetOption[];
  looks: FacetOption[];
  colors: (FacetOption & { hex: string | null })[];
  finishes: FacetOption[];
  collections: FacetOption[];
  brands: FacetOption[];
  applications: FacetOption[];
  performance: FacetOption[];
};

// English label + code for a lookup row; inactive values are still returned so
// an already-assigned-but-now-hidden value keeps rendering in the editor.
const ORDER = [{ sortOrder: 'asc' as const }, { code: 'asc' as const }];
const EN = { where: { localeCode: 'en' }, select: { name: true } } as const;

function toOptions(
  rows: { id: string; code: string; isActive: boolean; translations: { name: string }[] }[],
): FacetOption[] {
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.translations[0]?.name ?? r.code,
    isActive: r.isActive,
  }));
}

// Vocabulary tables are small (dozens–low hundreds each); loading all ten in
// parallel is cheap and lets one call feed both the create and edit forms.
export async function getFacetOptions(): Promise<FacetOptions> {
  const select = { id: true, code: true, isActive: true, translations: EN };
  const [
    sources,
    types,
    materials,
    looks,
    colors,
    finishes,
    collections,
    brands,
    applications,
    performance,
  ] = await Promise.all([
    prisma.source.findMany({ orderBy: ORDER, select }),
    prisma.productType.findMany({ orderBy: ORDER, select }),
    prisma.material.findMany({ orderBy: ORDER, select }),
    prisma.look.findMany({ orderBy: ORDER, select }),
    prisma.color.findMany({ orderBy: ORDER, select: { ...select, hex: true } }),
    prisma.finish.findMany({ orderBy: ORDER, select }),
    prisma.collection.findMany({ orderBy: ORDER, select }),
    prisma.brand.findMany({ orderBy: ORDER, select }),
    prisma.application.findMany({ orderBy: ORDER, select }),
    prisma.performanceAttribute.findMany({ orderBy: ORDER, select }),
  ]);
  return {
    sources: toOptions(sources),
    types: toOptions(types),
    materials: toOptions(materials),
    looks: toOptions(looks),
    colors: colors.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.translations[0]?.name ?? c.code,
      isActive: c.isActive,
      hex: c.hex,
    })),
    finishes: toOptions(finishes),
    collections: toOptions(collections),
    brands: toOptions(brands),
    applications: toOptions(applications),
    performance: toOptions(performance),
  };
}

export type ProductTranslationInput = {
  name: string;
  description: string;
  usageNotes: string;
  metaTitle: string;
  metaDescription: string;
};

export type ProductImageInput = {
  s3Key: string;
  thumbKey: string;
  supplierUrl: string;
  width: string;
  height: string;
  url: string; // resolved preview URL for the dashboard
};

export type ProductFormInitial = {
  id: string;
  legacyId: string;
  slug: string;
  code: string;
  sourceId: string;
  brandId: string;
  typeId: string;
  materialId: string;
  lookId: string;
  colorId: string;
  finishId: string;
  collectionId: string;
  sizeLabel: string;
  price: string;
  currency: string;
  priceUnit: string;
  sellingType: string;
  packing: string;
  weightLabel: string;
  featuredRank: string;
  supplierUrl: string;
  isPublished: boolean;
  isAvailable: boolean;
  applicationIds: string[];
  performanceIds: string[];
  translations: Record<Locale, ProductTranslationInput>;
  images: ProductImageInput[];
};

const EMPTY_TRANSLATION: ProductTranslationInput = {
  name: '',
  description: '',
  usageNotes: '',
  metaTitle: '',
  metaDescription: '',
};

// Shape a product into flat, primitive form values (Decimal→string, nulls→'')
// so it serialises cleanly into the client ProductForm.
export async function getProductForEdit(id: string): Promise<ProductFormInitial | null> {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      translations: true,
      applications: { select: { applicationId: true } },
      performance: { select: { performanceAttributeId: true } },
      images: { orderBy: { sortOrder: 'asc' } },
      source: { select: { code: true } },
    },
  });
  if (!product) return null;

  const translations = {} as Record<Locale, ProductTranslationInput>;
  for (const locale of LOCALES) {
    const row = product.translations.find((t) => t.localeCode === locale);
    translations[locale] = row
      ? {
          name: row.name,
          description: row.description ?? '',
          usageNotes: row.usageNotes ?? '',
          metaTitle: row.metaTitle ?? '',
          metaDescription: row.metaDescription ?? '',
        }
      : { ...EMPTY_TRANSLATION };
  }

  return {
    id: product.id,
    legacyId: product.legacyId,
    slug: product.slug,
    code: product.code ?? '',
    sourceId: product.sourceId,
    brandId: product.brandId ?? '',
    typeId: product.typeId ?? '',
    materialId: product.materialId ?? '',
    lookId: product.lookId ?? '',
    colorId: product.colorId ?? '',
    finishId: product.finishId ?? '',
    collectionId: product.collectionId ?? '',
    sizeLabel: product.sizeLabel ?? '',
    price: String(Number(product.price)),
    currency: product.currency,
    priceUnit: product.priceUnit ?? '',
    sellingType: product.sellingType ?? '',
    packing: product.packing ?? '',
    weightLabel: product.weightLabel ?? '',
    featuredRank: product.featuredRank === null ? '' : String(product.featuredRank),
    supplierUrl: product.supplierUrl ?? '',
    isPublished: product.isPublished,
    isAvailable: product.isAvailable,
    applicationIds: product.applications.map((a) => a.applicationId),
    performanceIds: product.performance.map((p) => p.performanceAttributeId),
    translations,
    images: product.images.map((img) => ({
      s3Key: img.s3Key,
      thumbKey: img.thumbKey ?? '',
      supplierUrl: img.supplierUrl ?? '',
      width: img.width === null ? '' : String(img.width),
      height: img.height === null ? '' : String(img.height),
      url: productMediaUrl(img.thumbKey ?? img.s3Key, product.source.code),
    })),
  };
}
