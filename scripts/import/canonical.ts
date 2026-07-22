// Canonical alias map — docs/DATABASE.md §8 step 3: facet vocabularies are
// canonicalized via this single map; an unknown facet value at import time is
// a HARD FAILURE (never a silent NULL). Junk one-off brands import as NULL
// with the original retained in products.legacy_meta.

// Data typos observed in the live merged catalog (catalog-listing.json).
export const MATERIAL_ALIASES: Record<string, string | null> = {
  Procelain: 'Porcelain', // typo in supplier data
  Porcelian: 'Porcelain', // typo in supplier data
  '—': null, // em-dash placeholder = no material
};

export const COLOR_ALIASES: Record<string, string | null> = {
  Gray: 'Grey', // US spelling variant in supplier data
};

// docs/DATABASE.md §5 — brands 6→4: two junk one-off "brands" are product
// descriptions, not brands. They become brand_id NULL; the original string is
// kept in legacy_meta.original_brand.
export const JUNK_BRANDS = new Set([
  'Original Spainish Porcelaicn (Ceramic) Tile',
  'Artisanal Porcelian (Ceramic) Tile',
]);

export type CanonicalResult = { value: string | null; aliased: boolean };

function applyAliases(raw: string, aliases: Record<string, string | null>): CanonicalResult {
  const value = raw.trim();
  if (!value) return { value: null, aliased: false };
  if (value in aliases) return { value: aliases[value], aliased: true };
  return { value, aliased: false };
}

export function canonicalMaterial(raw: string): CanonicalResult {
  return applyAliases(raw, MATERIAL_ALIASES);
}

export function canonicalColor(raw: string): CanonicalResult {
  return applyAliases(raw, COLOR_ALIASES);
}

export function canonicalBrand(raw: string): CanonicalResult & { junk: boolean } {
  const value = raw.trim();
  if (!value) return { value: null, aliased: false, junk: false };
  if (JUNK_BRANDS.has(value)) return { value: null, aliased: true, junk: true };
  return { value, aliased: false, junk: false };
}
