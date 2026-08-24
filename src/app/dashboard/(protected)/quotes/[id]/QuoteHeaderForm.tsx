'use client';

import { useActionState } from 'react';
import { updateQuote, type FormState } from '../actions';
import { QUOTE_STATUSES, QUOTE_STATUS_LABELS } from '@/lib/quotes/status';
import UnsavedChangesGuard from '../../UnsavedChangesGuard';

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

// Primitives only. A Prisma Decimal or Date reaching a client component is a
// React serialization error, so the server component flattens them first.
type QuoteHeader = {
  id: string;
  title: string | null;
  notes: string | null;
  status: string;
  assignedTo: string | null;
  contingencyPercent: string;
  validUntil: string | null;
  updatedAt: string;
  fxRatesAt: string | null;
  fxRates: Record<string, number>;
  quoteCurrency: string;
};

export default function QuoteHeaderForm({
  quote,
  staff,
  canWrite,
}: {
  quote: QuoteHeader;
  staff: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateQuote, {});
  const fxRates = quote.fxRates;

  return (
    <form action={formAction} className="space-y-4 border border-line rounded-lg p-4">
      <UnsavedChangesGuard />
      <input type="hidden" name="quoteId" value={quote.id} />
      {/* Optimistic lock: two people can have this quote open at once. */}
      <input type="hidden" name="expectedUpdatedAt" value={quote.updatedAt} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className={labelCls} htmlFor="q-title">
            Title
          </label>
          <input
            id="q-title"
            name="title"
            defaultValue={quote.title ?? ''}
            disabled={!canWrite}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="q-status">
            Status
          </label>
          <select
            id="q-status"
            name="status"
            defaultValue={quote.status}
            disabled={!canWrite}
            className={inputCls}
          >
            {QUOTE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {QUOTE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="q-assigned">
            Assigned to
          </label>
          <select
            id="q-assigned"
            name="assignedTo"
            defaultValue={quote.assignedTo ?? ''}
            disabled={!canWrite}
            className={inputCls}
          >
            <option value="">Unassigned</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="q-contingency">
            Contingency %
          </label>
          <input
            id="q-contingency"
            name="contingencyPercent"
            type="number"
            step="0.1"
            min="0"
            max="100"
            defaultValue={quote.contingencyPercent}
            disabled={!canWrite}
            className={inputCls}
          />
          <p className="text-muted text-xs mt-1">
            Widens the estimate band only where a rate card gave no low/high of its own.
          </p>
        </div>
        <div>
          <label className={labelCls} htmlFor="q-valid">
            Valid until
          </label>
          <input
            id="q-valid"
            name="validUntil"
            type="date"
            defaultValue={quote.validUntil ?? ''}
            disabled={!canWrite}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="q-notes">
          Internal notes
        </label>
        <textarea
          id="q-notes"
          name="notes"
          rows={2}
          defaultValue={quote.notes ?? ''}
          disabled={!canWrite}
          className={inputCls}
        />
      </div>

      <p className="text-muted text-xs">
        {/* Snapshotted, not live: a later FX move must not rewrite a sent quote. */}
        FX snapshot ({quote.quoteCurrency} per unit):{' '}
        {Object.entries(fxRates)
          .filter(([code]) => code !== quote.quoteCurrency)
          .map(([code, rate]) => `${code} ${rate}`)
          .join(' · ') || 'none'}
        {quote.fxRatesAt && ` · taken ${quote.fxRatesAt}`}
      </p>

      {state.error && (
        <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-sm text-accent">Saved.</p>}

      {canWrite && (
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      )}
    </form>
  );
}
