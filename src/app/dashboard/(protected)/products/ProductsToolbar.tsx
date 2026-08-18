'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FacetOption } from '@/lib/catalogAdmin';

// Client toolbar for the products list: search, sort, page size, quick-filter
// chips and facet dropdowns. Every control writes to the URL query (server-side
// filtering); changing any filter resets to page 1.

export type ToolbarFacets = {
  sources: FacetOption[];
  types: FacetOption[];
  materials: FacetOption[];
  looks: FacetOption[];
  colors: FacetOption[];
  brands: FacetOption[];
  collections: FacetOption[];
};

const SORTS: { value: string; label: string }[] = [
  { value: 'new', label: 'Newest' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'priceAsc', label: 'Price ↑' },
  { value: 'priceDesc', label: 'Price ↓' },
  { value: 'featured', label: 'Featured rank' },
  { value: 'code', label: 'Code A–Z' },
];

const CHIPS: { key: string; value: string; label: string }[] = [
  { key: 'pub', value: 'no', label: 'Unpublished' },
  { key: 'avail', value: 'no', label: 'Out of stock' },
  { key: 'img', value: 'no', label: 'No image' },
  { key: 'priced', value: 'no', label: 'No price' },
  { key: 'featured', value: '1', label: 'Featured' },
  { key: 'noname', value: '1', label: 'Missing name' },
];

const FACET_KEYS = ['source', 'type', 'material', 'look', 'color', 'brand', 'collection'] as const;
const FACET_LABEL: Record<(typeof FACET_KEYS)[number], string> = {
  source: 'Source',
  type: 'Type',
  material: 'Material',
  look: 'Look',
  color: 'Colour',
  brand: 'Brand',
  collection: 'Collection',
};

const selectCls =
  'px-2 py-1.5 bg-surface text-ink rounded-lg border border-line-strong text-sm focus:outline-none focus:ring-2 focus:ring-accent';

export default function ProductsToolbar({ facets, total }: { facets: ToolbarFacets; total: number }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(params.get('q') ?? '');

  const facetOptions: Record<(typeof FACET_KEYS)[number], FacetOption[]> = {
    source: facets.sources,
    type: facets.types,
    material: facets.materials,
    look: facets.looks,
    color: facets.colors,
    brand: facets.brands,
    collection: facets.collections,
  };

  const push = (next: URLSearchParams) => {
    next.delete('page'); // any filter change returns to the first page
    const s = next.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  };

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  };

  const toggleChip = (key: string, value: string) => setParam(key, params.get(key) === value ? '' : value);

  // Which params count as "filters" (for the Clear-all affordance).
  const filterKeys = [
    'q',
    'sort',
    'size',
    ...CHIPS.map((c) => c.key),
    ...FACET_KEYS,
  ];
  const hasFilters = filterKeys.some((k) => params.get(k));

  const clearAll = () => {
    const next = new URLSearchParams();
    const view = params.get('view');
    if (view) next.set('view', view);
    push(next);
  };

  return (
    <div className="space-y-3 mb-6">
      {/* Search + sort + size */}
      <div className="flex flex-wrap items-center gap-3">
        <form
          className="flex-1 min-w-[16rem]"
          onSubmit={(e) => {
            e.preventDefault();
            setParam('q', q.trim());
          }}
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${total.toLocaleString()} products by code or name…`}
            className="w-full max-w-md px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </form>

        <label className="text-sm text-muted flex items-center gap-2">
          Sort
          <select value={params.get('sort') ?? 'new'} onChange={(e) => setParam('sort', e.target.value)} className={selectCls}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-muted flex items-center gap-2">
          Show
          <select value={params.get('size') ?? '50'} onChange={(e) => setParam('size', e.target.value)} className={selectCls}>
            {['50', '100', '200'].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Quick chips */}
      <div className="flex flex-wrap items-center gap-2">
        {CHIPS.map((c) => {
          const active = params.get(c.key) === c.value;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => toggleChip(c.key, c.value)}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                active ? 'border-accent text-heading bg-accent-2/15' : 'border-line text-ink hover:border-accent/60'
              }`}
            >
              {c.label}
            </button>
          );
        })}
        {hasFilters && (
          <button type="button" onClick={clearAll} className="ms-1 text-sm text-muted hover:text-accent underline">
            Clear all
          </button>
        )}
      </div>

      {/* Facet dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        {FACET_KEYS.map((key) => (
          <select
            key={key}
            value={params.get(key) ?? ''}
            onChange={(e) => setParam(key, e.target.value)}
            className={`${selectCls} ${params.get(key) ? 'border-accent text-heading' : ''}`}
            aria-label={FACET_LABEL[key]}
          >
            <option value="">{FACET_LABEL[key]}: all</option>
            {facetOptions[key].map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ))}
      </div>
    </div>
  );
}
