import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { prisma } from './prisma';
import { SHOP_KEYS, type ShopKey } from './catalogShopByConfig';

// Admin-configurable "Shop by brand" layer, stored in settings['catalog.shopbybrand']
// (JSON, zod-validated). The catalog landing shows every brand as a collapsible
// panel; opening one reveals a set of ROWS — the same facet dimensions the outside
// "Shop by …" tiles use (Type, Collection, Look, Colour, Application) — but scoped
// to that brand, each a row of cards that link into the filtered catalog.
//
// This config drives WHICH rows show inside every brand, their order, and how many
// cards each row shows. It reuses ShopKey so a row is always a real facet
// dimension ("a combination from the existing data"). Purely additive: an
// absent/invalid config falls back to DEFAULT_BRANDSHOP, so a bad edit can never
// break the landing.

export type BrandRow = {
  key: ShopKey;
  visible: boolean;
  limit: number;
};

export const BRANDSHOP_KEY = 'catalog.shopbybrand';

export const DEFAULT_BRANDSHOP: BrandRow[] = [
  { key: 'type', visible: true, limit: 12 },
  { key: 'collection', visible: true, limit: 12 },
  { key: 'look', visible: true, limit: 12 },
  { key: 'color', visible: true, limit: 24 },
  { key: 'application', visible: true, limit: 12 },
];

const rowSchema = z.object({
  key: z.enum(SHOP_KEYS),
  visible: z.boolean(),
  limit: z.number().int().min(1).max(60),
});
export const brandShopSchema = z.array(rowSchema);

// Merge stored config with defaults: keep stored order, drop unknown/duplicate
// keys, and append any dimension the stored config is missing so a newly added
// facet never silently vanishes from the editor.
export function normalizeBrandShop(stored: BrandRow[]): BrandRow[] {
  const seen = new Set<ShopKey>();
  const out: BrandRow[] = [];
  for (const r of stored) {
    if (!SHOP_KEYS.includes(r.key) || seen.has(r.key)) continue;
    seen.add(r.key);
    out.push(r);
  }
  for (const def of DEFAULT_BRANDSHOP) if (!seen.has(def.key)) out.push({ ...def, visible: false });
  return out;
}

export const getBrandShopConfig = cache(async (): Promise<BrandRow[]> => {
  const row = await prisma.setting.findUnique({ where: { key: BRANDSHOP_KEY } });
  const parsed = brandShopSchema.safeParse(row?.value);
  // No (or invalid) config → the full defaults, shown. Only a real stored config
  // goes through normalize, where a missing dimension is appended hidden.
  return parsed.success ? normalizeBrandShop(parsed.data) : DEFAULT_BRANDSHOP;
});
