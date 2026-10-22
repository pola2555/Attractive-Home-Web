'use client';

import { useMemo, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { LOCALES, type Locale } from '@/i18n/config';
import type { FacetType, FacetValue, FacetProductPreview } from '@/lib/facetsAdmin';
import {
  saveFacetInline,
  toggleFacet,
  moveFacetInline,
  deleteFacetInline,
  previewFacetProducts,
} from './actions';

// Column sorting is a VIEW aid only — it reorders the rows on screen without
// touching the saved sort_order. Manual reordering (the ▲▼ arrows) therefore only
// makes sense in the default/manual view, so it's disabled while a column sort is
// active.
type SortKey = 'code' | 'name' | 'uses' | 'status';
type Sort = { key: SortKey; dir: 'asc' | 'desc' };

function compareBy(a: FacetValue, b: FacetValue, key: SortKey): number {
  switch (key) {
    case 'code':
      return a.code.localeCompare(b.code);
    case 'name':
      return a.name.localeCompare(b.name);
    case 'uses':
      return a.uses - b.uses;
    case 'status':
      return Number(a.isActive) - Number(b.isActive);
  }
}

// Inline-editable facet vocabulary table. Every value is edited in place — code,
// English name, other-locale names (expandable), colour, active state, order —
// with no page navigation. A persistent bottom row adds new values.

const LOCALE_LABEL: Record<Locale, string> = { en: 'English', ar: 'Arabic', fr: 'French', ru: 'Russian' };
const OTHER_LOCALES = LOCALES.filter((l) => l !== 'en');

const cellInput =
  'w-full px-2 py-1 bg-surface text-ink rounded border border-line-strong focus:outline-none focus:ring-1 focus:ring-accent';
const iconBtn = 'w-7 h-7 grid place-items-center rounded border border-line text-ink hover:border-accent/60 disabled:opacity-30';

function emptyNames(): Record<Locale, string> {
  return Object.fromEntries(LOCALES.map((l) => [l, ''])) as Record<Locale, string>;
}

export default function FacetTable({
  facet,
  values,
  hasHex,
  singular,
  canWrite,
}: {
  facet: FacetType;
  values: FacetValue[];
  hasHex: boolean;
  singular: string;
  canWrite: boolean;
}) {
  const [error, setError] = useState('');
  const [sort, setSort] = useState<Sort | null>(null);

  // Third click on the same column clears back to the manual order.
  const onSort = (key: SortKey) =>
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: 'asc' };
      if (cur.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });

  const sortedValues = useMemo(() => {
    if (!sort) return values;
    const out = [...values].sort((a, b) => compareBy(a, b, sort.key));
    if (sort.dir === 'desc') out.reverse();
    return out;
  }, [values, sort]);

  const reorderEnabled = canWrite && !sort;

  return (
    <div className="space-y-4">
      {error && (
        <p className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-200 text-sm">{error}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-muted bg-surface/60 border-b border-line">
              {canWrite && <th className="w-16 py-2.5 px-2 text-center font-medium">Order</th>}
              {hasHex && <th className="w-14 py-2.5 px-2 text-center font-medium">Colour</th>}
              <SortHeader label="Code" col="code" sort={sort} onSort={onSort} align="start" />
              <SortHeader label="Name (English)" col="name" sort={sort} onSort={onSort} align="start" />
              <SortHeader label="Uses" col="uses" sort={sort} onSort={onSort} align="center" className="w-20" />
              <SortHeader label="Status" col="status" sort={sort} onSort={onSort} align="center" className="w-24" />
              {canWrite && <th className="w-40 py-2.5 px-2 text-end font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sortedValues.map((v, i) => (
              <Row
                key={`${v.id}:${v.sortOrder}:${v.code}:${v.isActive}:${JSON.stringify(v.names)}`}
                facet={facet}
                value={v}
                hasHex={hasHex}
                canWrite={canWrite}
                reorderEnabled={reorderEnabled}
                isFirst={i === 0}
                isLast={i === sortedValues.length - 1}
                onError={setError}
              />
            ))}
            {values.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted">
                  No values yet — add the first one below.
                </td>
              </tr>
            )}
            {canWrite && (
              <AddRow facet={facet} hasHex={hasHex} singular={singular} nextOrder={values.length} onError={setError} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// A clickable column header: cycles unsorted → ascending → descending → unsorted,
// with an arrow showing the current direction.
function SortHeader({
  label,
  col,
  sort,
  onSort,
  align,
  className = '',
}: {
  label: string;
  col: SortKey;
  sort: Sort | null;
  onSort: (key: SortKey) => void;
  align: 'start' | 'center';
  className?: string;
}) {
  const dir = sort && sort.key === col ? sort.dir : null;
  const arrow = dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : '↕';
  return (
    <th
      className={`py-2.5 px-2 font-medium ${align === 'center' ? 'text-center' : 'text-start'} ${className}`}
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 hover:text-ink ${align === 'center' ? 'justify-center' : ''} ${dir ? 'text-ink' : ''}`}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <span className={`text-[10px] ${dir ? 'text-accent' : 'opacity-50'}`} aria-hidden="true">
          {arrow}
        </span>
      </button>
    </th>
  );
}

function Row({
  facet,
  value,
  hasHex,
  canWrite,
  reorderEnabled,
  isFirst,
  isLast,
  onError,
}: {
  facet: FacetType;
  value: FacetValue;
  hasHex: boolean;
  canWrite: boolean;
  reorderEnabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState(value.code);
  const [names, setNames] = useState<Record<Locale, string>>({ ...value.names });
  const [hex, setHex] = useState(value.hex ?? '#000000');
  const [expanded, setExpanded] = useState(false);
  const [armed, setArmed] = useState(false);
  // "Uses" hover preview — lazy-loaded once, shown in a fixed-position portal so
  // the table's overflow can't clip it; hidden the moment the cursor leaves.
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [preview, setPreview] = useState<FacetProductPreview[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const showPreview = (el: HTMLElement) => {
    if (value.uses === 0) return;
    setHoverRect(el.getBoundingClientRect());
    if (preview === null && !previewLoading) {
      setPreviewLoading(true);
      previewFacetProducts(facet, value.id)
        .then((items) => setPreview(items))
        .catch(() => setPreview([]))
        .finally(() => setPreviewLoading(false));
    }
  };
  const hidePreview = () => setHoverRect(null);

  const dirty =
    canWrite &&
    (code !== value.code ||
      (hasHex && hex !== (value.hex ?? '#000000')) ||
      LOCALES.some((l) => (names[l] ?? '') !== (value.names[l] ?? '')));

  const setName = (l: Locale, val: string) => setNames((prev) => ({ ...prev, [l]: val }));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, refreshOnOk = true) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        onError(res.error ?? 'Something went wrong.');
        return;
      }
      onError('');
      if (refreshOnOk) router.refresh();
    });

  const save = () =>
    run(() =>
      saveFacetInline(facet, value.id, {
        code: code.trim(),
        isActive: value.isActive,
        hex: hasHex ? hex : null,
        names,
        sortOrder: value.sortOrder, // preserve current order on an edit
      }),
    );

  const revert = () => {
    setCode(value.code);
    setNames({ ...value.names });
    setHex(value.hex ?? '#000000');
    onError('');
  };

  const remove = () => {
    setArmed(false);
    run(() => deleteFacetInline(facet, value.id));
  };

  return (
    <>
      <tr className="border-b border-line/50 align-middle">
        {canWrite && (
          <td className="py-1.5 px-2">
            <div className="flex items-center justify-center gap-1" title={reorderEnabled ? undefined : 'Clear the column sort to reorder'}>
              <button type="button" aria-label="Move up" disabled={!reorderEnabled || isFirst || pending} onClick={() => run(() => moveFacetInline(facet, value.id, 'up'))} className={iconBtn}>
                ↑
              </button>
              <button type="button" aria-label="Move down" disabled={!reorderEnabled || isLast || pending} onClick={() => run(() => moveFacetInline(facet, value.id, 'down'))} className={iconBtn}>
                ↓
              </button>
            </div>
          </td>
        )}
        {hasHex && (
          <td className="py-1.5 px-2 text-center">
            {canWrite ? (
              <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent" aria-label="Colour" />
            ) : (
              <span className="inline-block w-5 h-5 rounded-full border border-line-strong align-middle" style={{ backgroundColor: value.hex ?? 'transparent' }} />
            )}
          </td>
        )}
        <td className="py-1.5 px-2">
          {canWrite ? (
            <input value={code} onChange={(e) => setCode(e.target.value)} className={`${cellInput} font-mono`} aria-label="Code" />
          ) : (
            <span className="font-mono">{value.code}</span>
          )}
        </td>
        <td className="py-1.5 px-2">
          <div className="flex items-center gap-2">
            {canWrite ? (
              <input value={names.en} onChange={(e) => setName('en', e.target.value)} className={cellInput} aria-label="English name" />
            ) : (
              <span>{value.name}</span>
            )}
            {canWrite && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                title="Other languages"
                className="shrink-0 text-xs text-muted hover:text-accent whitespace-nowrap"
              >
                {expanded ? '▴ langs' : '▾ langs'}
              </button>
            )}
          </div>
        </td>
        <td
          className="py-1.5 px-2 text-center text-muted"
          onMouseEnter={(e) => showPreview(e.currentTarget)}
          onMouseLeave={hidePreview}
        >
          {value.uses > 0 ? (
            <span className="underline decoration-dotted underline-offset-2 cursor-help">{value.uses}</span>
          ) : (
            value.uses
          )}
          {hoverRect &&
            value.uses > 0 &&
            createPortal(
              <div
                style={{
                  position: 'fixed',
                  top: hoverRect.bottom + 6,
                  left: Math.max(8, Math.min(hoverRect.left, window.innerWidth - 236)),
                  width: 228,
                  zIndex: 80,
                }}
                className="rounded-lg border border-line bg-surface shadow-xl p-2 pointer-events-none"
              >
                {previewLoading && !preview && <p className="text-xs text-muted px-1 py-1.5">Loading…</p>}
                {preview && preview.length === 0 && (
                  <p className="text-xs text-muted px-1 py-1.5">No products found.</p>
                )}
                {preview && preview.length > 0 && (
                  <ul className="space-y-1">
                    {preview.map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        <span
                          className="w-9 h-9 rounded bg-surface-2 bg-cover bg-center shrink-0 border border-line"
                          style={p.thumb ? { backgroundImage: `url('${p.thumb}')` } : undefined}
                        />
                        <span className="text-xs text-ink truncate">{p.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>,
              document.body,
            )}
        </td>
        <td className="py-1.5 px-2 text-center">
          {canWrite ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => toggleFacet(facet, value.id, !value.isActive))}
              className={`px-2 py-0.5 rounded-full text-xs border ${value.isActive ? 'border-green-500/50 text-green-300' : 'border-line text-muted'}`}
            >
              {value.isActive ? 'Active' : 'Hidden'}
            </button>
          ) : value.isActive ? (
            'Active'
          ) : (
            'Hidden'
          )}
        </td>
        {canWrite && (
          <td className="py-1.5 px-2">
            <div className="flex items-center justify-end gap-2">
              {dirty ? (
                <>
                  <button type="button" disabled={pending} onClick={save} className="px-3 py-1 rounded bg-brand-brown hover:bg-brand-brown-hover text-white text-xs disabled:opacity-60">
                    Save
                  </button>
                  <button type="button" disabled={pending} onClick={revert} className="text-muted hover:text-ink text-xs">
                    Revert
                  </button>
                </>
              ) : (
                armed ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="text-xs text-muted">Delete? The link is cleared.</span>
                    <button type="button" disabled={pending} onClick={remove} className="text-red-300 hover:text-red-200 text-sm">
                      Confirm
                    </button>
                    <button type="button" onClick={() => setArmed(false)} className="text-muted hover:text-ink text-sm">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button type="button" disabled={pending} onClick={() => setArmed(true)} aria-label="Delete" className="text-red-300 hover:text-red-200 text-sm">
                    Delete
                  </button>
                )
              )}
            </div>
          </td>
        )}
      </tr>
      {canWrite && expanded && (
        <tr className="border-b border-line/50 bg-surface/40">
          <td colSpan={hasHex ? 3 : 2} />
          <td colSpan={4} className="py-2 px-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {OTHER_LOCALES.map((l) => (
                <label key={l} className="block">
                  <span className="block text-xs text-muted mb-1">{LOCALE_LABEL[l]}</span>
                  <input value={names[l]} onChange={(e) => setName(l, e.target.value)} dir={l === 'ar' ? 'rtl' : 'ltr'} className={cellInput} />
                </label>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AddRow({
  facet,
  hasHex,
  singular,
  nextOrder,
  onError,
}: {
  facet: FacetType;
  hasHex: boolean;
  singular: string;
  nextOrder: number;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [hex, setHex] = useState('#808080');

  const add = () => {
    if (!code.trim() || !nameEn.trim()) {
      onError('A new value needs a code and an English name.');
      return;
    }
    start(async () => {
      const res = await saveFacetInline(facet, null, {
        code: code.trim(),
        isActive: true,
        hex: hasHex ? hex : null,
        names: { ...emptyNames(), en: nameEn.trim() },
        sortOrder: nextOrder,
      });
      if (!res.ok) {
        onError(res.error ?? 'Could not add the value.');
        return;
      }
      onError('');
      setCode('');
      setNameEn('');
      setHex('#808080');
      router.refresh();
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };

  return (
    <tr className="bg-surface/30">
      <td className="py-2 px-2 text-center text-muted text-xs">new</td>
      {hasHex && (
        <td className="py-2 px-2 text-center">
          <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent" aria-label="Colour" />
        </td>
      )}
      <td className="py-2 px-2">
        <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onKeyDown} placeholder="code" className={`${cellInput} font-mono`} />
      </td>
      <td className="py-2 px-2">
        <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} onKeyDown={onKeyDown} placeholder={`New ${singular.toLowerCase()} name`} className={cellInput} />
      </td>
      <td />
      <td />
      <td className="py-2 px-2">
        <div className="flex justify-end">
          <button type="button" disabled={pending} onClick={add} className="px-3 py-1 rounded bg-brand-brown hover:bg-brand-brown-hover text-white text-xs disabled:opacity-60">
            + Add
          </button>
        </div>
      </td>
    </tr>
  );
}
