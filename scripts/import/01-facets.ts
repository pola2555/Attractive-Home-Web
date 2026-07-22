/* eslint-disable @typescript-eslint/no-explicit-any */
// §8 step 3 — the ten facet vocabularies + translations, canonicalized via
// canonical.ts. Facet display translations come from the old repo's
// catalogTerms.js / catalogCollections.js (copied into data/catalog/), which
// these seeded *_translations tables replace entirely (docs/DATABASE.md §5).
import { uuidv7 } from 'uuidv7';
import { prisma, readJson, trimmed } from './lib';
import { canonicalColor, canonicalMaterial, canonicalBrand } from './canonical';

type ListingFacetValue = { value: string; count: number };
type ListingFile = {
  meta: { colorHex: Record<string, string> };
  facets: Record<string, ListingFacetValue[]>;
  products: unknown[];
};
type FullProduct = { finish?: string; performance?: string[] };
type FullFile = { products: FullProduct[] };

export type FacetsReport = { vocabularies: Record<string, number>; translations: number };

type TermMap = Record<string, { ar?: string; fr?: string; ru?: string }>;

function orderedUnique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export async function importFacets(): Promise<FacetsReport> {
  const listing = readJson<ListingFile>('catalog/catalog-listing.json');
  const full = readJson<FullFile>('catalog/products.json');
  const { TERMS } = (await import('./data/catalog/catalogTerms.js')) as { TERMS: TermMap };
  const { COLLECTIONS } = (await import('./data/catalog/catalogCollections.js')) as {
    COLLECTIONS: TermMap;
  };
  // Facet TERMS win on any collision, same as the old tval() lookup.
  const lookup: TermMap = { ...COLLECTIONS, ...TERMS };

  const facetValues = (key: string) => listing.facets[key].map((v) => v.value);

  const specs: {
    label: string;
    codes: string[];
    hexByCode?: Record<string, string>;
    model: any;
    translationModel: any;
    fkField: string;
    uniqueKey: string;
  }[] = [
    {
      label: 'product_types',
      codes: facetValues('type'),
      model: prisma.productType,
      translationModel: prisma.productTypeTranslation,
      fkField: 'productTypeId',
      uniqueKey: 'productTypeId_localeCode',
    },
    {
      label: 'materials',
      codes: orderedUnique(
        facetValues('material')
          .map((v) => canonicalMaterial(v).value)
          .filter((v): v is string => v !== null),
      ),
      model: prisma.material,
      translationModel: prisma.materialTranslation,
      fkField: 'materialId',
      uniqueKey: 'materialId_localeCode',
    },
    {
      label: 'looks',
      codes: facetValues('look'),
      model: prisma.look,
      translationModel: prisma.lookTranslation,
      fkField: 'lookId',
      uniqueKey: 'lookId_localeCode',
    },
    {
      label: 'colors',
      codes: orderedUnique(
        facetValues('color')
          .map((v) => canonicalColor(v).value)
          .filter((v): v is string => v !== null),
      ),
      hexByCode: listing.meta.colorHex,
      model: prisma.color,
      translationModel: prisma.colorTranslation,
      fkField: 'colorId',
      uniqueKey: 'colorId_localeCode',
    },
    {
      label: 'applications',
      codes: facetValues('application'),
      model: prisma.application,
      translationModel: prisma.applicationTranslation,
      fkField: 'applicationId',
      uniqueKey: 'applicationId_localeCode',
    },
    {
      label: 'finishes',
      codes: orderedUnique(full.products.map((p) => trimmed(p.finish))),
      model: prisma.finish,
      translationModel: prisma.finishTranslation,
      fkField: 'finishId',
      uniqueKey: 'finishId_localeCode',
    },
    {
      label: 'performance_attributes',
      codes: orderedUnique(full.products.flatMap((p) => (p.performance ?? []).map(trimmed))),
      model: prisma.performanceAttribute,
      translationModel: prisma.performanceAttributeTranslation,
      fkField: 'performanceAttributeId',
      uniqueKey: 'performanceAttributeId_localeCode',
    },
    {
      label: 'collections',
      codes: facetValues('collection'),
      model: prisma.collection,
      translationModel: prisma.collectionTranslation,
      fkField: 'collectionId',
      uniqueKey: 'collectionId_localeCode',
    },
    {
      label: 'brands',
      codes: facetValues('brand').filter((v) => !canonicalBrand(v).junk),
      model: prisma.brand,
      translationModel: prisma.brandTranslation,
      fkField: 'brandId',
      uniqueKey: 'brandId_localeCode',
    },
    {
      label: 'sources',
      codes: facetValues('source'),
      model: prisma.source,
      translationModel: prisma.sourceTranslation,
      fkField: 'sourceId',
      uniqueKey: 'sourceId_localeCode',
    },
  ];

  const report: FacetsReport = { vocabularies: {}, translations: 0 };

  for (const spec of specs) {
    for (const [index, code] of spec.codes.entries()) {
      const create: Record<string, unknown> = { id: uuidv7(), code, sortOrder: index };
      if (spec.hexByCode?.[code]) create.hex = spec.hexByCode[code];
      const row = await spec.model.upsert({ where: { code }, update: {}, create });

      // §3 — a translation row exists only where there is real content. The
      // canonical EN value doubles as the en display name; ar/fr/ru come from
      // the terms dictionary where translated.
      const names: Record<string, string | undefined> = {
        en: code,
        ar: lookup[code]?.ar,
        fr: lookup[code]?.fr,
        ru: lookup[code]?.ru,
      };
      for (const [localeCode, name] of Object.entries(names)) {
        if (!name) continue;
        await spec.translationModel.upsert({
          where: { [spec.uniqueKey]: { [spec.fkField]: row.id, localeCode } },
          update: {},
          create: { id: uuidv7(), [spec.fkField]: row.id, localeCode, name },
        });
        report.translations += 1;
      }
    }
    report.vocabularies[spec.label] = spec.codes.length;
  }

  console.log(
    `01-facets: ${Object.entries(report.vocabularies)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')} (${report.translations} translation rows ensured)`,
  );
  return report;
}
