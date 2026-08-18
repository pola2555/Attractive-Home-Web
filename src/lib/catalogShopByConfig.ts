import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { prisma } from './prisma';

// Admin-configurable "Shop by …" layer, stored in settings['catalog.shopby']
// (JSON, zod-validated). Purely additive: absent/invalid config falls back to
// DEFAULT_SHOPBY (today's hardcoded behaviour), so a bad edit can't break the
// catalog landing. Drives which sections show, their order, how many cards each
// shows, a manual card order (prefix; the rest fall back to count order), and an
// optional per-value product pick that overrides the auto-chosen tile image.

export const SHOP_KEYS = ['application', 'look', 'color', 'type', 'collection'] as const;
export type ShopKey = (typeof SHOP_KEYS)[number];

export type ShopBySection = {
  key: ShopKey;
  visible: boolean;
  limit: number;
  order: string[]; // facet-value codes, manual-order prefix
  picks: Record<string, string>; // facetValueCode → productId (image override)
};

export const SHOPBY_KEY = 'catalog.shopby';

export const DEFAULT_SHOPBY: ShopBySection[] = [
  { key: 'application', visible: true, limit: 8, order: [], picks: {} },
  { key: 'look', visible: true, limit: 10, order: [], picks: {} },
  { key: 'color', visible: true, limit: 30, order: [], picks: {} },
  { key: 'type', visible: true, limit: 8, order: [], picks: {} },
  { key: 'collection', visible: true, limit: 8, order: [], picks: {} },
];

const sectionSchema = z.object({
  key: z.enum(SHOP_KEYS),
  visible: z.boolean(),
  limit: z.number().int().min(1).max(60),
  order: z.array(z.string().max(80)).max(300).catch([]),
  picks: z.record(z.string().max(80), z.string().uuid()).catch({}),
});
export const shopBySchema = z.array(sectionSchema);

// Merge stored config with defaults: keep stored order, drop unknown/dupe keys,
// append any section the stored config is missing (a new section never vanishes).
export function normalizeShopBy(stored: ShopBySection[]): ShopBySection[] {
  const seen = new Set<ShopKey>();
  const out: ShopBySection[] = [];
  for (const s of stored) {
    if (!SHOP_KEYS.includes(s.key) || seen.has(s.key)) continue;
    seen.add(s.key);
    out.push(s);
  }
  for (const def of DEFAULT_SHOPBY) if (!seen.has(def.key)) out.push(def);
  return out;
}

export const getShopByConfig = cache(async (): Promise<ShopBySection[]> => {
  const row = await prisma.setting.findUnique({ where: { key: SHOPBY_KEY } });
  const parsed = shopBySchema.safeParse(row?.value);
  return normalizeShopBy(parsed.success ? parsed.data : []);
});

// All product ids referenced by picks across visible sections (for image lookup).
export function pickedProductIds(sections: ShopBySection[]): string[] {
  const ids = new Set<string>();
  for (const s of sections) for (const id of Object.values(s.picks)) ids.add(id);
  return [...ids];
}
