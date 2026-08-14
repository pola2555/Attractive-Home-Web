import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { prisma } from './prisma';
import { FACET_KEYS, type FacetKey } from './catalog';

// Phase 7 — the admin-configurable catalog layer. Which sidebar facets show,
// their order, their widget, and an optional custom label are DATA, stored in
// settings['catalog.filters'] (JSON, zod-validated). This is purely ADDITIVE:
// when the setting is absent or malformed we fall back to DEFAULT_CATALOG_FILTERS
// (today's hardcoded behaviour), so a bad edit can never break the live catalog.
// The query mapping per facet still lives in catalog.ts — this only drives
// presentation.

export const FILTER_WIDGETS = ['list', 'swatch', 'collection', 'dropdown'] as const;
export type FilterWidget = (typeof FILTER_WIDGETS)[number];

export type CatalogFilterEntry = {
  facetKey: FacetKey;
  visible: boolean;
  widget: FilterWidget;
  defaultOpen: boolean;
  label?: string; // overrides the i18n facet label when set
};

export const CATALOG_FILTERS_KEY = 'catalog.filters';

// Mirrors the previously hardcoded sidebar: colour → swatches, collection →
// searchable island, everything else → link list; Type opens by default.
export const DEFAULT_CATALOG_FILTERS: CatalogFilterEntry[] = [
  { facetKey: 'type', visible: true, widget: 'list', defaultOpen: true },
  { facetKey: 'material', visible: true, widget: 'list', defaultOpen: false },
  { facetKey: 'look', visible: true, widget: 'list', defaultOpen: false },
  { facetKey: 'color', visible: true, widget: 'swatch', defaultOpen: false },
  { facetKey: 'application', visible: true, widget: 'list', defaultOpen: false },
  { facetKey: 'size', visible: true, widget: 'list', defaultOpen: false },
  { facetKey: 'collection', visible: true, widget: 'collection', defaultOpen: false },
  { facetKey: 'brand', visible: true, widget: 'list', defaultOpen: false },
  { facetKey: 'source', visible: true, widget: 'list', defaultOpen: false },
];

const entrySchema = z.object({
  facetKey: z.enum(FACET_KEYS),
  visible: z.boolean(),
  widget: z.enum(FILTER_WIDGETS),
  defaultOpen: z.boolean(),
  label: z.string().trim().max(40).optional(),
});
export const catalogFiltersSchema = z.array(entrySchema);

// Merge a (possibly partial / stale) stored config with the defaults:
//  - keep the stored order, dropping unknown/duplicate facet keys
//  - append any facet the stored config is missing (a newly added facet always
//    surfaces rather than silently disappearing), using its default entry
export function normalizeCatalogFilters(stored: CatalogFilterEntry[]): CatalogFilterEntry[] {
  const seen = new Set<FacetKey>();
  const out: CatalogFilterEntry[] = [];
  for (const entry of stored) {
    if (!FACET_KEYS.includes(entry.facetKey) || seen.has(entry.facetKey)) continue;
    seen.add(entry.facetKey);
    out.push(entry);
  }
  for (const def of DEFAULT_CATALOG_FILTERS) {
    if (!seen.has(def.facetKey)) out.push(def);
  }
  return out;
}

// The normalized, ordered full list (visible + hidden). Public catalog filters
// on `visible`; the dashboard editor shows every row. Cached per request.
export const getCatalogFilterConfig = cache(async (): Promise<CatalogFilterEntry[]> => {
  const row = await prisma.setting.findUnique({ where: { key: CATALOG_FILTERS_KEY } });
  const parsed = catalogFiltersSchema.safeParse(row?.value);
  return normalizeCatalogFilters(parsed.success ? parsed.data : []);
});
