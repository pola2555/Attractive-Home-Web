'use client';

import { useActionState } from 'react';
import { saveBand, type FormState } from '../../actions';

// Step 6 of the editor walkthrough: size priced the way the supplier prices it.
//
// Benison includes a standard opening and charges a step above it, so width and
// height are numbers a salesperson types while the price comes from whichever
// band the number lands in. Three fields, not a formula and not a condition.

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

export default function BandForm({
  templateId,
  variants,
  measurements,
}: {
  templateId: string;
  variants: { id: string; code: string; name: string }[];
  measurements: { id: string; code: string; unit: string | null }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveBand, {});

  if (measurements.length === 0) {
    return (
      <p className="text-muted text-sm">
        Bands need a measurement to hang off. Bind a number question — a width or a height — to this
        template first.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="templateId" value={templateId} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className={labelCls} htmlFor="b-code">
            Code
          </label>
          <input id="b-code" name="code" className={inputCls} placeholder="size_h_2170" required />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls} htmlFor="b-label">
            Name
          </label>
          <input
            id="b-label"
            name="label"
            className={inputCls}
            placeholder="Height 2170–2240 mm"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="col-span-2">
          <label className={labelCls} htmlFor="b-option">
            Measurement
          </label>
          <select id="b-option" name="templateOptionId" className={inputCls}>
            {measurements.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code}
                {m.unit ? ` (${m.unit})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="b-min">
            From
          </label>
          <input
            id="b-min"
            name="minValue"
            type="number"
            step="any"
            className={inputCls}
            placeholder="2170"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="b-max">
            Up to
          </label>
          <input
            id="b-max"
            name="maxValue"
            type="number"
            step="any"
            className={inputCls}
            placeholder="2240"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="b-amount">
            Adds
          </label>
          <input
            id="b-amount"
            name="amount"
            type="number"
            step="0.01"
            className={inputCls}
            placeholder="12.00"
            required
          />
        </div>
      </div>

      <p className="text-muted text-xs">
        &ldquo;Up to&rdquo; is exclusive, so 950&ndash;1050 and 1050&ndash;1220 do not both claim a
        door of exactly 1050&nbsp;mm. Leave either end blank for an open band. A measurement that
        matches no band is reported on the quote rather than charged as zero.
      </p>

      <div className="max-w-xs">
        <label className={labelCls} htmlFor="b-variant">
          Applies to
        </label>
        <select id="b-variant" name="variantId" className={inputCls}>
          <option value="">Every variant</option>
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-sm text-accent">Saved.</p>}

      <button
        disabled={pending}
        className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save band'}
      </button>
    </form>
  );
}
