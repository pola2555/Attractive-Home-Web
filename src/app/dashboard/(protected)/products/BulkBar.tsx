'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FacetOption } from '@/lib/catalogAdmin';
import { bulkSetPublished, bulkSetReviewStatus, bulkDeleteProducts } from './actions';
import { REVIEW_OPTIONS } from './reviewUi';

// A compact select that fires on change, then resets to the placeholder so the
// same control can be reused for the next batch.
function PickSelect({
  label,
  options,
  disabled,
  onPick,
}: {
  label: string;
  options: FacetOption[];
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <select
      value=""
      disabled={disabled}
      aria-label={label}
      className="px-2 py-1 bg-surface text-ink rounded border border-line-strong text-sm focus:outline-none focus:ring-1 focus:ring-accent"
      onChange={(e) => {
        const v = e.target.value;
        e.target.value = '';
        if (v) onPick(v);
      }}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

// Shared selection action bar for the products table and card grid. Focused on
// the review workflow: move between lists, publish/unpublish, delete.
export default function BulkBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDel, setConfirmDel] = useState(false);
  if (!ids.length) return null;

  const run = (fn: () => Promise<void>, keep = false) =>
    start(async () => {
      await fn();
      router.refresh();
      if (!keep) onDone();
    });

  const btn =
    'rounded border border-line px-2 py-1 text-ink hover:border-accent/60 disabled:opacity-40';

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent-2/10 px-3 py-2 text-sm backdrop-blur">
      <span className="font-medium text-heading">{ids.length} selected</span>

      <span className="mx-1 h-5 w-px bg-line" />
      <PickSelect
        label="Move to list…"
        options={REVIEW_OPTIONS}
        disabled={pending}
        onPick={(s) => run(() => bulkSetReviewStatus(ids, s))}
      />

      <span className="mx-1 h-5 w-px bg-line" />
      <button type="button" disabled={pending} onClick={() => run(() => bulkSetPublished(ids, true))} className={btn}>
        Publish
      </button>
      <button type="button" disabled={pending} onClick={() => run(() => bulkSetPublished(ids, false))} className={btn}>
        Unpublish
      </button>

      <span className="mx-1 h-5 w-px bg-line" />
      {confirmDel ? (
        <span className="inline-flex items-center gap-2">
          <span className="text-xs text-red-500">Delete {ids.length}? This can&rsquo;t be undone.</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setConfirmDel(false);
              run(() => bulkDeleteProducts(ids));
            }}
            className="rounded border border-red-500/50 px-2 py-1 text-red-500 hover:bg-red-500/10"
          >
            Yes, delete
          </button>
          <button type="button" onClick={() => setConfirmDel(false)} className={btn}>
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmDel(true)}
          className="rounded border border-red-500/50 px-2 py-1 text-red-500 hover:bg-red-500/10"
        >
          Delete
        </button>
      )}

      <button type="button" onClick={onDone} className="ms-auto text-muted hover:text-ink">
        Clear
      </button>
    </div>
  );
}
