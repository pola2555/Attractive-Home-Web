'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogFilterEntry, FilterWidget } from '@/lib/catalogConfig';
import { saveCatalogFilterConfig } from './catalogEditorActions';

// In-context catalog layout editor. Mounted on the public catalog page but only
// activates for a signed-in staff member (same client session probe the navbar
// uses). It never affects anonymous visitors, so the page stays static/ISR: the
// button and panel only render once the session check confirms dashboard access.
//
// Phase 1 edits the FILTERS (order / widget type / visibility / default-open /
// label), reusing the existing settings['catalog.filters'] config. Shop-by and
// card settings are added to this same panel in later phases.

const WIDGETS: { value: FilterWidget; label: string }[] = [
  { value: 'list', label: 'List (checkboxes)' },
  { value: 'swatch', label: 'Swatches' },
  { value: 'collection', label: 'Searchable list' },
  { value: 'dropdown', label: 'Dropdown' },
];

const ctl = 'px-2 py-1.5 text-sm bg-surface text-ink rounded border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';

export default function CatalogEditor({
  initialConfig,
  labels,
}: {
  initialConfig: CatalogFilterEntry[];
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [staff, setStaff] = useState(false);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CatalogFilterEntry[]>(initialConfig);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Staff probe (same endpoint as the navbar Dashboard link).
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

  // Lock background scroll while the panel is open; close on Escape.
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

  const move = (i: number, dir: -1 | 1) =>
    setRows((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const update = (i: number, patch: Partial<CatalogFilterEntry>) =>
    setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const save = () =>
    start(async () => {
      const res = await saveCatalogFilterConfig(rows);
      if (!res.ok) {
        setError(res.error ?? 'Could not save.');
        return;
      }
      setError('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    });

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
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h2 className="text-lg font-semibold text-heading">Edit filters</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-ink text-xl leading-none">
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              <p className="text-muted text-xs mb-3">
                Reorder filters, switch each one&apos;s widget, hide a filter, set which open by default, or rename it.
                Changes go live for everyone after you save.
              </p>
              {rows.map((row, i) => (
                <div
                  key={row.facetKey}
                  className={`rounded-lg border border-line p-3 ${row.visible ? '' : 'opacity-60'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="px-1 leading-none text-muted hover:text-ink disabled:opacity-30">
                        ▲
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down" className="px-1 leading-none text-muted hover:text-ink disabled:opacity-30">
                        ▼
                      </button>
                    </div>
                    <span className="font-medium text-heading flex-1">{labels[row.facetKey] ?? row.facetKey}</span>
                    <label className="flex items-center gap-1.5 text-xs text-ink">
                      <input type="checkbox" checked={row.visible} onChange={(e) => update(i, { visible: e.target.checked })} />
                      Show
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-ink">
                      <input type="checkbox" checked={row.defaultOpen} onChange={(e) => update(i, { defaultOpen: e.target.checked })} />
                      Open
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select value={row.widget} onChange={(e) => update(i, { widget: e.target.value as FilterWidget })} className={ctl} aria-label="Widget">
                      {WIDGETS.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={row.label ?? ''}
                      onChange={(e) => update(i, { label: e.target.value ? e.target.value : undefined })}
                      placeholder={`Label: ${labels[row.facetKey] ?? row.facetKey}`}
                      maxLength={40}
                      className={`${ctl} flex-1 min-w-[8rem]`}
                      aria-label="Custom label"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-line px-5 py-4 flex items-center gap-3">
              <button type="button" disabled={pending} onClick={save} className="px-5 py-2 rounded-lg bg-brand-brown text-white hover:bg-brand-brown-hover disabled:opacity-50">
                {pending ? 'Saving…' : 'Save changes'}
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
