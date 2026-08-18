'use client';

import UnsavedChangesGuard from '../UnsavedChangesGuard';

import { useActionState, useState } from 'react';
import type { CatalogFilterEntry, FilterWidget } from '@/lib/catalogConfig';
import type { FormState } from './actions';

const WIDGET_LABELS: Record<FilterWidget, string> = {
  list: 'List',
  swatch: 'Swatches',
  collection: 'Searchable list',
  dropdown: 'Dropdown',
};

const selectCls =
  'px-2 py-1.5 text-sm bg-surface text-ink rounded border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';

export default function CatalogFiltersForm({
  action,
  initial,
  defaults,
  facetLabels,
  widgets,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: CatalogFilterEntry[];
  defaults: CatalogFilterEntry[];
  facetLabels: Record<string, string>;
  widgets: FilterWidget[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [rows, setRows] = useState<CatalogFilterEntry[]>(initial);

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

  return (
    <form action={formAction} className="space-y-6 max-w-3xl">
      <UnsavedChangesGuard />
      <input type="hidden" name="configJson" value={JSON.stringify(rows)} />

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div
            key={row.facetKey}
            className={`flex flex-wrap items-center gap-4 rounded-lg border border-line p-3 ${
              row.visible ? '' : 'opacity-60'
            }`}
          >
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Move up"
                className="px-2 leading-none text-muted hover:text-ink disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === rows.length - 1}
                aria-label="Move down"
                className="px-2 leading-none text-muted hover:text-ink disabled:opacity-30"
              >
                ▼
              </button>
            </div>

            <div className="w-28 font-medium text-heading">{facetLabels[row.facetKey] ?? row.facetKey}</div>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={row.visible}
                onChange={(e) => update(i, { visible: e.target.checked })}
              />
              Visible
            </label>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={row.defaultOpen}
                onChange={(e) => update(i, { defaultOpen: e.target.checked })}
              />
              Open by default
            </label>

            <select
              value={row.widget}
              onChange={(e) => update(i, { widget: e.target.value as FilterWidget })}
              className={selectCls}
              aria-label="Widget"
            >
              {widgets.map((w) => (
                <option key={w} value={w}>
                  {WIDGET_LABELS[w]}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={row.label ?? ''}
              onChange={(e) => update(i, { label: e.target.value ? e.target.value : undefined })}
              placeholder={facetLabels[row.facetKey] ?? row.facetKey}
              maxLength={40}
              className={`${selectCls} flex-1 min-w-[10rem]`}
              aria-label="Custom label"
            />
          </div>
        ))}
      </div>

      {state.error && <p className="text-red-400 text-sm">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 rounded-lg bg-brand-brown text-white hover:bg-brand-brown-hover disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setRows(defaults)}
          className="px-4 py-2 rounded-lg border border-line-strong text-ink text-sm hover:border-accent/60"
        >
          Reset to defaults
        </button>
      </div>
    </form>
  );
}
