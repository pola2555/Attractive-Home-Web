'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogFilterEntry, FilterWidget } from '@/lib/catalogConfig';
import type { ShopBySection, ShopKey } from '@/lib/catalogShopByConfig';
import { saveCatalogFilterConfig, saveShopByConfig, searchProductsForPick, type PickResult } from './catalogEditorActions';

// In-context catalog layout editor. Mounted on the public catalog page but only
// activates for a signed-in staff member (same client session probe the navbar
// uses). Anonymous visitors see nothing, so the page stays static/ISR.
//
//  - Filters tab: order / widget / visibility / default-open / label.
//  - Shop-by tab: section order & visibility, cards-per-section, and card order.
// Both persist to their settings config and revalidate the catalog.

type ShopValue = { code: string; name: string; count: number };

const WIDGETS: { value: FilterWidget; label: string }[] = [
  { value: 'list', label: 'List (checkboxes)' },
  { value: 'swatch', label: 'Swatches' },
  { value: 'collection', label: 'Searchable list' },
  { value: 'dropdown', label: 'Dropdown' },
];

const ctl = 'px-2 py-1.5 text-sm bg-surface text-ink rounded border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const arrowBtn = 'px-1 leading-none text-muted hover:text-ink disabled:opacity-30';

// Manual-order prefix, then count order — matches ShopByTiles on the server.
function orderValues(values: ShopValue[], order: string[]): ShopValue[] {
  if (!order.length) return [...values].sort((a, b) => b.count - a.count);
  const idx = new Map(order.map((c, i) => [c, i]));
  return [...values].sort((a, b) => {
    const ai = idx.has(a.code) ? (idx.get(a.code) as number) : Infinity;
    const bi = idx.has(b.code) ? (idx.get(b.code) as number) : Infinity;
    if (ai !== bi) return ai - bi;
    return b.count - a.count;
  });
}

export default function CatalogEditor({
  initialConfig,
  labels,
  initialShopBy,
  shopFacets,
  shopLabels,
  pickLabels,
}: {
  initialConfig: CatalogFilterEntry[];
  labels: Record<string, string>;
  initialShopBy: ShopBySection[];
  shopFacets: Record<ShopKey, ShopValue[]>;
  shopLabels: Record<ShopKey, string>;
  pickLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [staff, setStaff] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'filters' | 'shopby'>('filters');
  const [rows, setRows] = useState<CatalogFilterEntry[]>(initialConfig);
  const [shop, setShop] = useState<ShopBySection[]>(initialShopBy);
  const [expanded, setExpanded] = useState<ShopKey | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Product-pick flow (Shop-by tile image override).
  const [picking, setPicking] = useState<{ sectionIdx: number; code: string } | null>(null);
  const [pickQ, setPickQ] = useState('');
  const [pickResults, setPickResults] = useState<PickResult[]>([]);
  const [pickBusy, setPickBusy] = useState(false);
  const [newLabels, setNewLabels] = useState<Record<string, string>>({});
  const labelFor = (id: string) => newLabels[id] ?? pickLabels[id] ?? 'chosen product';

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dashboard/session', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { canAccess: false }))
      .then((d: { canAccess?: boolean }) => {
        if (!cancelled) setStaff(Boolean(d.canAccess));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!staff) return null;

  // -- Filters helpers --
  const moveRow = (i: number, dir: -1 | 1) =>
    setRows((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const updateRow = (i: number, patch: Partial<CatalogFilterEntry>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // -- Shop-by helpers --
  const moveSection = (i: number, dir: -1 | 1) =>
    setShop((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const updateSection = (i: number, patch: Partial<ShopBySection>) =>
    setShop((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const moveCard = (sectionIdx: number, cardIdx: number, dir: -1 | 1) =>
    setShop((prev) =>
      prev.map((s, si) => {
        if (si !== sectionIdx) return s;
        const codes = orderValues(shopFacets[s.key], s.order)
          .slice(0, s.limit)
          .map((v) => v.code);
        const j = cardIdx + dir;
        if (j < 0 || j >= codes.length) return s;
        const next = [...codes];
        [next[cardIdx], next[j]] = [next[j], next[cardIdx]];
        return { ...s, order: next };
      }),
    );

  const setPick = (sectionIdx: number, code: string, product: PickResult) => {
    setShop((prev) =>
      prev.map((s, si) => (si !== sectionIdx ? s : { ...s, picks: { ...s.picks, [code]: product.id } })),
    );
    setNewLabels((prev) => ({ ...prev, [product.id]: product.name || product.code || 'chosen product' }));
    setPicking(null);
    setPickResults([]);
    setPickQ('');
  };
  const clearPick = (sectionIdx: number, code: string) =>
    setShop((prev) =>
      prev.map((s, si) => {
        if (si !== sectionIdx) return s;
        const picks = { ...s.picks };
        delete picks[code];
        return { ...s, picks };
      }),
    );
  const runSearch = async () => {
    setPickBusy(true);
    try {
      setPickResults(await searchProductsForPick(pickQ));
    } catch {
      setPickResults([]);
    } finally {
      setPickBusy(false);
    }
  };

  const save = () =>
    start(async () => {
      const res = tab === 'filters' ? await saveCatalogFilterConfig(rows) : await saveShopByConfig(shop);
      if (!res.ok) {
        setError(res.error ?? 'Could not save.');
        return;
      }
      setError('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    });

  const tabBtn = (id: 'filters' | 'shopby', label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={tab === id ? '-mb-px px-4 py-2 text-sm font-medium text-heading border-b-2 border-accent' : 'px-4 py-2 text-sm text-muted hover:text-heading'}
    >
      {label}
    </button>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 end-6 z-[1030] rounded-full bg-heading text-bg shadow-lg px-4 py-2.5 text-sm font-semibold hover:brightness-110"
      >
        ✎ Edit layout
      </button>

      {open && (
        <div className="fixed inset-0 z-[1140]" role="dialog" aria-modal="true" aria-label="Edit catalog layout">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 end-0 w-full max-w-md bg-bg border-s border-line shadow-2xl flex flex-col">
            {picking && (
              <div className="absolute inset-0 z-10 bg-bg flex flex-col">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
                  <button type="button" onClick={() => setPicking(null)} className="text-muted hover:text-ink text-sm">
                    ← Back
                  </button>
                  <span className="font-medium text-heading">Pick a product image</span>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runSearch();
                  }}
                  className="px-5 py-3 flex gap-2 border-b border-line"
                >
                  <input value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="Search by name or code…" className={`${ctl} flex-1`} autoFocus />
                  <button type="submit" disabled={pickBusy} className="px-3 py-1.5 rounded bg-brand-brown text-white text-sm disabled:opacity-50">
                    Search
                  </button>
                </form>
                <div className="flex-1 overflow-y-auto px-5 py-3">
                  {pickBusy ? (
                    <p className="text-muted text-sm">Searching…</p>
                  ) : pickResults.length === 0 ? (
                    <p className="text-muted text-sm">Search a product name or code, then tap a result to use its image.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {pickResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => picking && setPick(picking.sectionIdx, picking.code, p)}
                          className="rounded-lg border border-line overflow-hidden hover:border-accent text-start"
                        >
                          <div className="aspect-square bg-surface-2">
                            {p.thumb && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.thumb} alt="" className="w-full h-full object-cover" />
                            )}
                          </div>
                          <div className="p-1.5">
                            <p className="text-[11px] text-ink truncate" title={p.name}>
                              {p.name}
                            </p>
                            {p.code && <p className="text-[10px] text-muted truncate">{p.code}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between px-5 pt-4 border-b border-line">
              <div className="flex gap-1">
                {tabBtn('filters', 'Filters')}
                {tabBtn('shopby', 'Shop by')}
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-ink text-xl leading-none pb-2">
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {tab === 'filters' ? (
                <>
                  <p className="text-muted text-xs mb-3">
                    Reorder filters, switch each one&apos;s widget, hide a filter, set which open by default, or rename
                    it.
                  </p>
                  {rows.map((row, i) => (
                    <div key={row.facetKey} className={`rounded-lg border border-line p-3 ${row.visible ? '' : 'opacity-60'}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <button type="button" onClick={() => moveRow(i, -1)} disabled={i === 0} aria-label="Move up" className={arrowBtn}>
                            ▲
                          </button>
                          <button type="button" onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1} aria-label="Move down" className={arrowBtn}>
                            ▼
                          </button>
                        </div>
                        <span className="font-medium text-heading flex-1">{labels[row.facetKey] ?? row.facetKey}</span>
                        <label className="flex items-center gap-1.5 text-xs text-ink">
                          <input type="checkbox" checked={row.visible} onChange={(e) => updateRow(i, { visible: e.target.checked })} />
                          Show
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-ink">
                          <input type="checkbox" checked={row.defaultOpen} onChange={(e) => updateRow(i, { defaultOpen: e.target.checked })} />
                          Open
                        </label>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select value={row.widget} onChange={(e) => updateRow(i, { widget: e.target.value as FilterWidget })} className={ctl} aria-label="Widget">
                          {WIDGETS.map((w) => (
                            <option key={w.value} value={w.value}>
                              {w.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={row.label ?? ''}
                          onChange={(e) => updateRow(i, { label: e.target.value ? e.target.value : undefined })}
                          placeholder={`Label: ${labels[row.facetKey] ?? row.facetKey}`}
                          maxLength={40}
                          className={`${ctl} flex-1 min-w-[8rem]`}
                          aria-label="Custom label"
                        />
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <p className="text-muted text-xs mb-3">
                    Reorder the &ldquo;Shop by&rdquo; sections, hide any, set how many cards each shows, and expand a
                    section to reorder its cards. Card images are picked automatically (choosing a specific product is
                    coming next).
                  </p>
                  {shop.map((section, i) => {
                    const cards = orderValues(shopFacets[section.key], section.order).slice(0, section.limit);
                    return (
                      <div key={section.key} className={`rounded-lg border border-line ${section.visible ? '' : 'opacity-60'}`}>
                        <div className="flex items-center gap-3 p-3">
                          <div className="flex flex-col">
                            <button type="button" onClick={() => moveSection(i, -1)} disabled={i === 0} aria-label="Move section up" className={arrowBtn}>
                              ▲
                            </button>
                            <button type="button" onClick={() => moveSection(i, 1)} disabled={i === shop.length - 1} aria-label="Move section down" className={arrowBtn}>
                              ▼
                            </button>
                          </div>
                          <span className="font-medium text-heading flex-1">{shopLabels[section.key]}</span>
                          <label className="flex items-center gap-1.5 text-xs text-ink">
                            <input type="checkbox" checked={section.visible} onChange={(e) => updateSection(i, { visible: e.target.checked })} />
                            Show
                          </label>
                          <label className="flex items-center gap-1 text-xs text-muted">
                            Cards
                            <input
                              type="number"
                              min={1}
                              max={60}
                              value={section.limit}
                              onChange={(e) => updateSection(i, { limit: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })}
                              className={`${ctl} w-16`}
                            />
                          </label>
                          <button type="button" onClick={() => setExpanded((k) => (k === section.key ? null : section.key))} className="text-muted hover:text-ink text-sm" aria-label="Toggle cards">
                            {expanded === section.key ? '▴' : '▾'}
                          </button>
                        </div>
                        {expanded === section.key && (
                          <div className="border-t border-line p-3 space-y-1 max-h-64 overflow-y-auto">
                            {cards.map((v, ci) => (
                              <div key={v.code} className="flex items-center gap-2 text-sm">
                                <button type="button" onClick={() => moveCard(i, ci, -1)} disabled={ci === 0} aria-label="Move card up" className={arrowBtn}>
                                  ▲
                                </button>
                                <button type="button" onClick={() => moveCard(i, ci, 1)} disabled={ci === cards.length - 1} aria-label="Move card down" className={arrowBtn}>
                                  ▼
                                </button>
                                <span className="flex-1 truncate text-ink">{v.name}</span>
                                <span className="text-muted text-xs">{v.count}</span>
                                {section.key !== 'color' &&
                                  (section.picks[v.code] ? (
                                    <span className="flex items-center gap-1 text-xs text-accent max-w-[9rem]">
                                      <span className="truncate" title={labelFor(section.picks[v.code])}>
                                        ★ {labelFor(section.picks[v.code])}
                                      </span>
                                      <button type="button" onClick={() => clearPick(i, v.code)} aria-label="Clear picked image" className="text-muted hover:text-ink">
                                        ×
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPicking({ sectionIdx: i, code: v.code });
                                        setPickResults([]);
                                        setPickQ('');
                                      }}
                                      className="text-xs text-muted hover:text-accent whitespace-nowrap"
                                    >
                                      Pick image
                                    </button>
                                  ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <div className="border-t border-line px-5 py-4 flex items-center gap-3">
              <button type="button" disabled={pending} onClick={save} className="px-5 py-2 rounded-lg bg-brand-brown text-white hover:bg-brand-brown-hover disabled:opacity-50">
                {pending ? 'Saving…' : `Save ${tab === 'filters' ? 'filters' : 'Shop by'}`}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-ink text-sm">
                Close
              </button>
              {saved && <span className="text-green-500 text-sm">Saved ✓</span>}
              {error && <span className="text-red-400 text-sm">{error}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
