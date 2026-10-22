'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogFilterEntry, FilterWidget } from '@/lib/catalogConfig';
import type { ShopBySection, ShopKey } from '@/lib/catalogShopByConfig';
import type { BrandRow } from '@/lib/catalogBrandShopConfig';
import {
  saveCatalogFilterConfig,
  saveShopByConfig,
  saveBrandShopConfig,
  shopPickProducts,
  type PickResult,
} from './catalogEditorActions';

// In-context catalog layout editor. Instead of a side drawer, staff edit the
// real filters and "Shop by" tiles WHERE THEY SIT: a provider wraps the page,
// and two slots swap the live (server-rendered) filters/tiles for an editable
// version the moment edit mode is on. Reorder by dragging the ⠿ handle or the
// ▲▼ arrows; per-item settings live inline; a slim bottom bar saves. Anonymous
// visitors never load any of this (the staff session probe gates it), so the
// page stays static/ISR.

type ShopValue = { code: string; name: string; count: number };

const WIDGETS: { value: FilterWidget; label: string }[] = [
  { value: 'list', label: 'List (checkboxes)' },
  { value: 'swatch', label: 'Swatches' },
  { value: 'collection', label: 'Searchable list' },
  { value: 'dropdown', label: 'Dropdown' },
];

const ctl =
  'px-2 py-1.5 text-sm bg-surface text-ink rounded border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const stepBtn = 'px-1 leading-none text-muted hover:text-ink disabled:opacity-30';
const handleCls =
  'cursor-grab active:cursor-grabbing text-muted hover:text-ink px-0.5 leading-none select-none text-base';

// Move an array item from → to (returns the same ref on a no-op, so a state
// setter fed with it skips the re-render).
function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

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

type EditContextValue = {
  editing: boolean;
  labels: Record<string, string>;
  shopFacets: Record<ShopKey, ShopValue[]>;
  shopAutoImages: Record<ShopKey, Record<string, string>>;
  pickThumbFor: (id: string) => string | undefined;
  shopLabels: Record<ShopKey, string>;
  rows: CatalogFilterEntry[];
  moveRow: (from: number, to: number) => void;
  updateRow: (i: number, patch: Partial<CatalogFilterEntry>) => void;
  shop: ShopBySection[];
  moveSection: (from: number, to: number) => void;
  updateSection: (i: number, patch: Partial<ShopBySection>) => void;
  moveCard: (sectionIdx: number, from: number, to: number) => void;
  openPick: (sectionIdx: number, code: string, key: ShopKey, label: string) => void;
  clearPick: (sectionIdx: number, code: string) => void;
  pickLabelFor: (id: string) => string;
  brandShop: BrandRow[];
  moveBrandRow: (from: number, to: number) => void;
  updateBrandRow: (i: number, patch: Partial<BrandRow>) => void;
  addBrandRow: (key: ShopKey) => void;
  removeBrandRow: (i: number) => void;
};

const EditContext = createContext<EditContextValue | null>(null);
export function useCatalogEdit(): EditContextValue | null {
  return useContext(EditContext);
}

export function CatalogEditProvider({
  children,
  initialConfig,
  labels,
  initialShopBy,
  initialBrandShop,
  shopFacets,
  shopAutoImages,
  shopPickThumbs,
  shopLabels,
  pickLabels,
}: {
  children: ReactNode;
  initialConfig: CatalogFilterEntry[];
  labels: Record<string, string>;
  initialShopBy: ShopBySection[];
  initialBrandShop: BrandRow[];
  shopFacets: Record<ShopKey, ShopValue[]>;
  shopAutoImages: Record<ShopKey, Record<string, string>>;
  shopPickThumbs: Record<string, string>;
  shopLabels: Record<ShopKey, string>;
  pickLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [staff, setStaff] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<CatalogFilterEntry[]>(initialConfig);
  const [shop, setShop] = useState<ShopBySection[]>(initialShopBy);
  const [brandShop, setBrandShop] = useState<BrandRow[]>(initialBrandShop);
  const [newLabels, setNewLabels] = useState<Record<string, string>>({});
  const [newThumbs, setNewThumbs] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Product-pick overlay (Shop-by tile cover image). Opening it loads the products
  // that carry this facet value, shown as image cards to scroll and click.
  const [picking, setPicking] = useState<{
    sectionIdx: number;
    code: string;
    key: ShopKey;
    label: string;
  } | null>(null);
  const [pickQ, setPickQ] = useState('');
  const [pickResults, setPickResults] = useState<PickResult[]>([]);
  const [pickBusy, setPickBusy] = useState(false);

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

  // Lock scroll + Escape only while the pick overlay is open.
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(null);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [picking]);

  const filtersDirty = useMemo(
    () => JSON.stringify(rows) !== JSON.stringify(initialConfig),
    [rows, initialConfig],
  );
  const shopDirty = useMemo(
    () => JSON.stringify(shop) !== JSON.stringify(initialShopBy),
    [shop, initialShopBy],
  );
  const brandShopDirty = useMemo(
    () => JSON.stringify(brandShop) !== JSON.stringify(initialBrandShop),
    [brandShop, initialBrandShop],
  );
  const dirty = filtersDirty || shopDirty || brandShopDirty;

  const moveRow = useCallback((from: number, to: number) => setRows((prev) => move(prev, from, to)), []);
  const updateRow = useCallback(
    (i: number, patch: Partial<CatalogFilterEntry>) =>
      setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r))),
    [],
  );

  const moveSection = useCallback((from: number, to: number) => setShop((prev) => move(prev, from, to)), []);
  const updateSection = useCallback(
    (i: number, patch: Partial<ShopBySection>) =>
      setShop((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s))),
    [],
  );
  const moveCard = useCallback(
    (sectionIdx: number, from: number, to: number) =>
      setShop((prev) =>
        prev.map((s, si) => {
          if (si !== sectionIdx) return s;
          const codes = orderValues(shopFacets[s.key], s.order)
            .slice(0, s.limit)
            .map((v) => v.code);
          const reordered = move(codes, from, to);
          if (reordered === codes) return s;
          return { ...s, order: reordered };
        }),
      ),
    [shopFacets],
  );

  const moveBrandRow = useCallback((from: number, to: number) => setBrandShop((prev) => move(prev, from, to)), []);
  const updateBrandRow = useCallback(
    (i: number, patch: Partial<BrandRow>) =>
      setBrandShop((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r))),
    [],
  );
  const addBrandRow = useCallback(
    (key: ShopKey) =>
      setBrandShop((prev) =>
        prev.some((r) => r.key === key) ? prev : [...prev, { key, visible: true, limit: 12 }],
      ),
    [],
  );
  const removeBrandRow = useCallback(
    (i: number) => setBrandShop((prev) => prev.filter((_, idx) => idx !== i)),
    [],
  );

  const openPick = useCallback((sectionIdx: number, code: string, key: ShopKey, label: string) => {
    setPicking({ sectionIdx, code, key, label });
    setPickQ('');
    setPickResults([]);
    setPickBusy(true);
    shopPickProducts(key, code)
      .then((r) => setPickResults(r))
      .catch(() => setPickResults([]))
      .finally(() => setPickBusy(false));
  }, []);
  const clearPick = useCallback(
    (sectionIdx: number, code: string) =>
      setShop((prev) =>
        prev.map((s, si) => {
          if (si !== sectionIdx) return s;
          const picks = { ...s.picks };
          delete picks[code];
          return { ...s, picks };
        }),
      ),
    [],
  );
  const applyPick = (product: PickResult) => {
    if (!picking) return;
    const { sectionIdx, code } = picking;
    setShop((prev) =>
      prev.map((s, si) => (si !== sectionIdx ? s : { ...s, picks: { ...s.picks, [code]: product.id } })),
    );
    setNewLabels((prev) => ({ ...prev, [product.id]: product.name || product.code || 'chosen product' }));
    if (product.thumb) setNewThumbs((prev) => ({ ...prev, [product.id]: product.thumb as string }));
    setPicking(null);
    setPickResults([]);
    setPickQ('');
  };
  const runSearch = async () => {
    if (!picking) return;
    setPickBusy(true);
    try {
      setPickResults(await shopPickProducts(picking.key, picking.code, pickQ));
    } catch {
      setPickResults([]);
    } finally {
      setPickBusy(false);
    }
  };

  const pickLabelFor = useCallback(
    (id: string) => newLabels[id] ?? pickLabels[id] ?? 'chosen product',
    [newLabels, pickLabels],
  );
  const pickThumbFor = useCallback(
    (id: string) => newThumbs[id] ?? shopPickThumbs[id],
    [newThumbs, shopPickThumbs],
  );

  const value = useMemo<EditContextValue>(
    () => ({
      editing,
      labels,
      shopFacets,
      shopAutoImages,
      pickThumbFor,
      shopLabels,
      rows,
      moveRow,
      updateRow,
      shop,
      moveSection,
      updateSection,
      moveCard,
      openPick,
      clearPick,
      pickLabelFor,
      brandShop,
      moveBrandRow,
      updateBrandRow,
      addBrandRow,
      removeBrandRow,
    }),
    [
      editing,
      labels,
      shopFacets,
      shopAutoImages,
      pickThumbFor,
      shopLabels,
      rows,
      moveRow,
      updateRow,
      shop,
      moveSection,
      updateSection,
      moveCard,
      openPick,
      clearPick,
      pickLabelFor,
      brandShop,
      moveBrandRow,
      updateBrandRow,
      addBrandRow,
      removeBrandRow,
    ],
  );

  const doSave = () =>
    start(async () => {
      let ok = true;
      let err = '';
      if (filtersDirty) {
        const r = await saveCatalogFilterConfig(rows);
        if (!r.ok) {
          ok = false;
          err = r.error ?? '';
        }
      }
      if (ok && shopDirty) {
        const r = await saveShopByConfig(shop);
        if (!r.ok) {
          ok = false;
          err = r.error ?? '';
        }
      }
      if (ok && brandShopDirty) {
        const r = await saveBrandShopConfig(brandShop);
        if (!r.ok) {
          ok = false;
          err = r.error ?? '';
        }
      }
      if (!ok) {
        setError(err || 'Could not save.');
        return;
      }
      setError('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    });

  const cancel = () => {
    setRows(initialConfig);
    setShop(initialShopBy);
    setBrandShop(initialBrandShop);
    setNewLabels({});
    setNewThumbs({});
    setError('');
    setEditing(false);
  };

  return (
    <EditContext.Provider value={value}>
      {children}

      {staff && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="fixed bottom-6 end-6 z-[1030] rounded-full bg-heading text-bg shadow-lg px-4 py-2.5 text-sm font-semibold hover:brightness-110"
        >
          ✎ Edit layout
        </button>
      )}

      {staff && editing && (
        <div className="fixed inset-x-0 bottom-0 z-[1030] border-t border-line bg-bg/95 backdrop-blur px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.25)]">
          <div className="max-w-[110rem] mx-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-sm text-heading font-semibold">Editing layout</span>
            <span className="text-xs text-muted hidden sm:inline">
              Drag the ⠿ handle or use ▲▼ to reorder · changes go live only when you save
            </span>
            <div className="ms-auto flex items-center gap-3">
              {saved && <span className="text-green-500 text-sm">Saved ✓</span>}
              {error && <span className="text-red-400 text-sm">{error}</span>}
              {dirty && !saved && <span className="text-amber-500 text-xs">Unsaved</span>}
              <button type="button" onClick={cancel} className="text-muted hover:text-ink text-sm">
                {dirty ? 'Discard' : 'Done'}
              </button>
              <button
                type="button"
                disabled={pending || !dirty}
                onClick={doSave}
                className="px-5 py-2 rounded-lg bg-brand-brown text-white hover:bg-brand-brown-hover disabled:opacity-50 text-sm font-semibold"
              >
                {pending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {picking && (
        <div
          className="fixed inset-0 z-[1140] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Pick a product image"
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => setPicking(null)} />
          <div className="relative w-full max-w-2xl max-h-[85vh] bg-bg border border-line rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-start justify-between px-5 py-4 border-b border-line">
              <div>
                <p className="font-medium text-heading">Choose a cover product</p>
                <p className="text-xs text-muted mt-0.5">
                  Pick the product whose image represents <b className="text-ink">{picking.label}</b>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPicking(null)}
                aria-label="Close"
                className="text-muted hover:text-ink text-xl leading-none"
              >
                ×
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch();
              }}
              className="px-5 py-3 flex gap-2 border-b border-line"
            >
              <input
                value={pickQ}
                onChange={(e) => setPickQ(e.target.value)}
                placeholder="Filter these products by name or code…"
                className={`${ctl} flex-1`}
                autoFocus
              />
              <button
                type="submit"
                disabled={pickBusy}
                className="px-3 py-1.5 rounded bg-brand-brown text-white text-sm disabled:opacity-50"
              >
                Filter
              </button>
            </form>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {pickBusy && pickResults.length === 0 ? (
                <p className="text-muted text-sm py-4 text-center">Loading products…</p>
              ) : pickResults.length === 0 ? (
                <p className="text-muted text-sm py-4 text-center">No products found.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {pickResults.map((p) => {
                    const chosen = picking.code in shop[picking.sectionIdx].picks
                      ? shop[picking.sectionIdx].picks[picking.code] === p.id
                      : false;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPick(p)}
                        className={`rounded-lg border overflow-hidden text-start transition-colors ${chosen ? 'border-accent ring-2 ring-accent' : 'border-line hover:border-accent'}`}
                      >
                        <div className="aspect-square bg-surface-2">
                          {p.thumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                          )}
                        </div>
                        <div className="p-1.5">
                          <p className="text-[11px] text-ink truncate" title={p.name}>
                            {p.name}
                          </p>
                          {p.code && <p className="text-[10px] text-muted truncate">{p.code}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </EditContext.Provider>
  );
}

// -- In-place slots: render the live server markup until edit mode flips on. --

export function FiltersSlot({ children }: { children: ReactNode }) {
  const ctx = useCatalogEdit();
  if (!ctx || !ctx.editing) return <>{children}</>;
  return <EditableFilters ctx={ctx} />;
}

export function ShopBySlot({ children }: { children: ReactNode }) {
  const ctx = useCatalogEdit();
  if (!ctx || !ctx.editing) return <>{children}</>;
  return <EditableShopBy ctx={ctx} />;
}

export function BrandShopSlot({ children }: { children: ReactNode }) {
  const ctx = useCatalogEdit();
  if (!ctx || !ctx.editing) return <>{children}</>;
  return <EditableBrandShop ctx={ctx} />;
}

// Edit which rows appear inside every brand panel (Shop by type / collection / …),
// their order and how many cards each shows. A row is always one of the existing
// facet dimensions (shopLabels' keys), so "add a row" just adds a dimension not yet
// used. The per-brand cards themselves are auto-filled from the catalog, so there's
// nothing to pick here — this edits the shared layout, not any one brand.
function EditableBrandShop({ ctx }: { ctx: EditContextValue }) {
  const { brandShop, shopLabels, moveBrandRow, updateBrandRow, addBrandRow, removeBrandRow } = ctx;
  const rowFrom = useRef<number | null>(null);
  const allKeys = Object.keys(shopLabels) as ShopKey[];
  const available = allKeys.filter((k) => !brandShop.some((r) => r.key === k));

  return (
    <div className="mb-10 space-y-3" aria-label="Edit Shop by brand">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="font-extrabold text-heading text-[15px]">Shop by brand</h3>
        <span className="text-xs text-muted">
          Rows shown inside every brand. Reorder with ⠿ or ▲▼; the cards fill in automatically.
        </span>
      </div>
      {brandShop.map((row, i) => (
        <div
          key={row.key}
          onDragOver={(e) => {
            if (rowFrom.current !== null) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (rowFrom.current !== null) moveBrandRow(rowFrom.current, i);
            rowFrom.current = null;
          }}
          className={`rounded-lg border border-line bg-surface px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2 ${row.visible ? '' : 'opacity-60'}`}
        >
          <span
            draggable
            onDragStart={() => {
              rowFrom.current = i;
            }}
            onDragEnd={() => {
              rowFrom.current = null;
            }}
            className={handleCls}
            aria-hidden="true"
            title="Drag to reorder row"
          >
            ⠿
          </span>
          <span className="font-medium text-heading text-sm">{shopLabels[row.key]}</span>
          {!row.visible && <span className="text-[10px] text-muted">(hidden)</span>}
          <label className="flex items-center gap-1.5 text-xs text-ink">
            <input type="checkbox" checked={row.visible} onChange={(e) => updateBrandRow(i, { visible: e.target.checked })} />
            Show
          </label>
          <label className="flex items-center gap-1 text-xs text-muted">
            Cards
            <input
              type="number"
              min={1}
              max={60}
              value={row.limit}
              onChange={(e) => updateBrandRow(i, { limit: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })}
              className={`${ctl} w-16`}
            />
          </label>
          <div className="ms-auto flex items-center">
            <button type="button" onClick={() => moveBrandRow(i, i - 1)} disabled={i === 0} aria-label="Move row up" className={stepBtn}>
              ▲
            </button>
            <button
              type="button"
              onClick={() => moveBrandRow(i, i + 1)}
              disabled={i === brandShop.length - 1}
              aria-label="Move row down"
              className={stepBtn}
            >
              ▼
            </button>
            <button
              type="button"
              onClick={() => removeBrandRow(i)}
              aria-label="Remove row"
              className="ms-1 px-1 leading-none text-muted hover:text-red-400"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      {available.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted">
          Add a row
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addBrandRow(e.target.value as ShopKey);
            }}
            className={ctl}
            aria-label="Add a row"
          >
            <option value="">Choose a dimension…</option>
            {available.map((k) => (
              <option key={k} value={k}>
                {shopLabels[k]}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function EditableFilters({ ctx }: { ctx: EditContextValue }) {
  const { rows, labels, moveRow, updateRow } = ctx;
  const [settingsIdx, setSettingsIdx] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);

  return (
    <aside className="space-y-1.5" aria-label="Edit filters">
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Filters</p>
      {rows.map((row, i) => {
        const name = row.label || labels[row.facetKey] || row.facetKey;
        const open = settingsIdx === i;
        return (
          <div
            key={row.facetKey}
            onDragOver={(e) => {
              if (dragFrom.current !== null) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom.current !== null) moveRow(dragFrom.current, i);
              dragFrom.current = null;
            }}
            className={`rounded-lg border border-line bg-surface px-2 py-1.5 ${row.visible ? '' : 'opacity-60'}`}
          >
            <div className="flex items-center gap-1">
              <span
                draggable
                onDragStart={() => {
                  dragFrom.current = i;
                }}
                onDragEnd={() => {
                  dragFrom.current = null;
                }}
                className={handleCls}
                aria-hidden="true"
                title="Drag to reorder"
              >
                ⠿
              </span>
              <span className="flex-1 text-sm font-medium text-heading truncate" title={name}>
                {name}
                {!row.visible && <span className="ms-1 text-[10px] text-muted">(hidden)</span>}
              </span>
              <button type="button" onClick={() => moveRow(i, i - 1)} disabled={i === 0} aria-label="Move up" className={stepBtn}>
                ▲
              </button>
              <button
                type="button"
                onClick={() => moveRow(i, i + 1)}
                disabled={i === rows.length - 1}
                aria-label="Move down"
                className={stepBtn}
              >
                ▼
              </button>
              <button
                type="button"
                onClick={() => setSettingsIdx(open ? null : i)}
                aria-label="Filter settings"
                aria-expanded={open}
                className={`px-1 leading-none ${open ? 'text-accent' : 'text-muted hover:text-ink'}`}
              >
                ⚙
              </button>
            </div>

            {open && (
              <div className="mt-2 space-y-2 border-t border-line pt-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={row.visible} onChange={(e) => updateRow(i, { visible: e.target.checked })} />
                    Show
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={row.defaultOpen}
                      onChange={(e) => updateRow(i, { defaultOpen: e.target.checked })}
                    />
                    Open by default
                  </label>
                </div>
                <select
                  value={row.widget}
                  onChange={(e) => updateRow(i, { widget: e.target.value as FilterWidget })}
                  className={`${ctl} w-full`}
                  aria-label="Widget"
                >
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
                  className={`${ctl} w-full`}
                  aria-label="Custom label"
                />
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}

function EditableShopBy({ ctx }: { ctx: EditContextValue }) {
  const { shop, shopFacets, shopAutoImages, pickThumbFor, shopLabels, moveSection, updateSection, moveCard, openPick, clearPick } = ctx;
  const sectionFrom = useRef<number | null>(null);
  const cardFrom = useRef<{ section: number; index: number } | null>(null);

  return (
    <div className="mb-10 space-y-5" aria-label="Edit Shop by">
      <p className="text-xs text-muted">
        Reorder sections and cards by dragging the ⠿ handle or the ▲▼ arrows. Each tile shows its current cover
        image — click the image to choose a different product for it, or reset it to the automatic pick.
      </p>
      {shop.map((section, i) => {
        const cards = orderValues(shopFacets[section.key], section.order).slice(0, section.limit);
        const isColor = section.key === 'color';
        return (
          <section
            key={section.key}
            onDragOver={(e) => {
              if (sectionFrom.current !== null) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (sectionFrom.current !== null) moveSection(sectionFrom.current, i);
              sectionFrom.current = null;
            }}
            className={`rounded-xl border border-line p-3 ${section.visible ? '' : 'opacity-60'}`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
              <span
                draggable
                onDragStart={() => {
                  sectionFrom.current = i;
                }}
                onDragEnd={() => {
                  sectionFrom.current = null;
                }}
                className={handleCls}
                aria-hidden="true"
                title="Drag to reorder section"
              >
                ⠿
              </span>
              <h3 className="font-extrabold text-heading text-[15px]">{shopLabels[section.key]}</h3>
              {!section.visible && <span className="text-[10px] text-muted">(hidden)</span>}
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
              <div className="ms-auto flex items-center">
                <button type="button" onClick={() => moveSection(i, i - 1)} disabled={i === 0} aria-label="Move section up" className={stepBtn}>
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => moveSection(i, i + 1)}
                  disabled={i === shop.length - 1}
                  aria-label="Move section down"
                  className={stepBtn}
                >
                  ▼
                </button>
              </div>
            </div>

            {cards.length === 0 ? (
              <p className="text-xs text-muted">No values to show for this section.</p>
            ) : (
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${isColor ? '120px' : '150px'}, 1fr))` }}
              >
                {cards.map((v, ci) => {
                  const picked = section.picks[v.code];
                  const cover = !isColor
                    ? (picked ? pickThumbFor(picked) : undefined) ?? shopAutoImages[section.key]?.[v.code]
                    : undefined;
                  return (
                    <div
                      key={v.code}
                      onDragOver={(e) => {
                        if (cardFrom.current && cardFrom.current.section === i) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (cardFrom.current && cardFrom.current.section === i) moveCard(i, cardFrom.current.index, ci);
                        cardFrom.current = null;
                      }}
                      className="rounded-lg border border-line bg-surface p-2 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center gap-1">
                        <span
                          draggable
                          onDragStart={() => {
                            cardFrom.current = { section: i, index: ci };
                          }}
                          onDragEnd={() => {
                            cardFrom.current = null;
                          }}
                          className={handleCls}
                          aria-hidden="true"
                          title="Drag to reorder card"
                        >
                          ⠿
                        </span>
                        <span className="flex-1 text-xs font-medium text-ink truncate" title={v.name}>
                          {v.name}
                        </span>
                        <button type="button" onClick={() => moveCard(i, ci, ci - 1)} disabled={ci === 0} aria-label="Move card up" className={stepBtn}>
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCard(i, ci, ci + 1)}
                          disabled={ci === cards.length - 1}
                          aria-label="Move card down"
                          className={stepBtn}
                        >
                          ▼
                        </button>
                      </div>

                      {!isColor && (
                        <button
                          type="button"
                          onClick={() => openPick(i, v.code, section.key, v.name)}
                          title="Click to choose this tile's cover image"
                          className="group relative block w-full aspect-[4/3] rounded-md overflow-hidden border border-line bg-surface-2 bg-cover bg-center"
                          style={cover ? { backgroundImage: `url('${cover}')` } : undefined}
                        >
                          {!cover && (
                            <span className="absolute inset-0 grid place-items-center text-[11px] text-muted">
                              No image
                            </span>
                          )}
                          <span className="absolute inset-x-0 bottom-0 py-0.5 text-center text-[10px] font-medium text-white bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity">
                            {picked ? 'Change cover' : 'Set cover'}
                          </span>
                          {picked && (
                            <span
                              className="absolute top-1 end-1 text-[10px] text-white bg-accent/90 rounded px-1 leading-tight"
                              title="Manually chosen"
                            >
                              ★
                            </span>
                          )}
                        </button>
                      )}

                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] text-muted">{v.count}</span>
                        {!isColor && picked && (
                          <button
                            type="button"
                            onClick={() => clearPick(i, v.code)}
                            className="text-[11px] text-muted hover:text-accent whitespace-nowrap"
                          >
                            Reset to auto
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
