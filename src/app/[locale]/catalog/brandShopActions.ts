'use server';

import { isLocale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { facetValues, brandShopRepImages, type FacetValue } from '@/lib/catalog';
import { productMediaUrl } from '@/lib/media';
import { getBrandShopConfig } from '@/lib/catalogBrandShopConfig';

// Lazy loader behind the "Shop by brand" panels. A brand's rows (its type /
// collection / look / … cards) are only fetched when a visitor opens that brand,
// so the catalog landing stays light no matter how many brands exist. Public and
// read-only — it returns ready-to-render cards (final image URL + catalog href),
// so the client component needs no media/href helpers of its own.

export type BrandCard = {
  code: string;
  name: string;
  count: number;
  hex?: string | null;
  imageUrl?: string | null;
  href: string;
};
export type BrandRowData = { key: string; label: string; isColor: boolean; cards: BrandCard[] };

function brandHref(locale: string, brandCode: string, key: string, valueCode: string): string {
  const params = new URLSearchParams();
  params.set('brand', brandCode);
  params.set(key, valueCode);
  return `/${locale}/catalog?${params.toString()}`;
}

export async function loadBrandRows(locale: string, brandCode: string): Promise<BrandRowData[]> {
  if (!isLocale(locale) || !brandCode) return [];

  const [config, dict, facets, reps] = await Promise.all([
    getBrandShopConfig(),
    getDictionary(locale, 'catalog'),
    facetValues(locale, { brand: [brandCode], page: 1, sort: 'featured', perPage: 48 }),
    brandShopRepImages(brandCode),
  ]);

  const rows: BrandRowData[] = [];
  for (const row of config) {
    if (!row.visible) continue;
    const isColor = row.key === 'color';
    const values: FacetValue[] = [...facets[row.key]].sort((a, b) => b.count - a.count).slice(0, row.limit);
    if (values.length === 0) continue;
    const repMap = isColor ? null : reps[row.key as keyof typeof reps];

    const cards: BrandCard[] = values.map((v) => {
      const rep = repMap?.get(v.code);
      return {
        code: v.code,
        name: v.name,
        count: v.count,
        hex: v.hex ?? null,
        imageUrl: rep ? productMediaUrl(rep.s3Key, rep.sourceCode) : null,
        href: brandHref(locale, brandCode, row.key, v.code),
      };
    });

    rows.push({ key: row.key, label: t(dict, `shop.${row.key}`), isColor, cards });
  }
  return rows;
}
