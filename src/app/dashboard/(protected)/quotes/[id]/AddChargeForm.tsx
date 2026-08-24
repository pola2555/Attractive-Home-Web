'use client';

import { useActionState } from 'react';
import { addCostComponent, type FormState } from '../actions';
import { COST_KINDS } from '@/lib/landed/types';

const inputCls =
  'px-2 py-1 bg-surface text-ink rounded border border-line-strong focus:outline-none focus:ring-1 focus:ring-accent text-sm';

// A client island purely so a bad amount reports itself instead of silently
// doing nothing — the rest of the breakdown stays a server component.
export default function AddChargeForm({
  quoteId,
  currency,
}: {
  quoteId: string;
  currency: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addCostComponent, {});

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="quoteId" value={quoteId} />
        <div>
          <label className="block text-xs text-muted mb-1" htmlFor="c-label">
            Add a charge
          </label>
          <input id="c-label" name="label" placeholder="Label" className={inputCls} />
        </div>
        <select name="kind" defaultValue="other" className={inputCls} aria-label="Charge kind">
          {COST_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
        <input
          name="amount"
          type="number"
          step="0.01"
          placeholder="Amount"
          className={inputCls}
          aria-label="Amount"
        />
        <input
          name="currency"
          defaultValue={currency}
          className={`${inputCls} w-20`}
          aria-label="Currency"
        />
        {/* Only goods, freight and insurance belong in the customs base; a
            post-import charge ticked in here inflates duty AND VAT. */}
        <label className="flex items-center gap-1 text-xs text-muted">
          <input type="checkbox" name="inCustomsBase" /> in CIF
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          <input type="checkbox" name="isLocked" /> actual
        </label>
        <button
          disabled={pending}
          className="px-3 py-1.5 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink text-sm disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add'}
        </button>
      </form>
      {state.error && <p className="text-sm text-red-300 mt-2">{state.error}</p>}
    </div>
  );
}
