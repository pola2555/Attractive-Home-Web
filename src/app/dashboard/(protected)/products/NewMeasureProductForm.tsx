'use client';

import { useActionState, useMemo, useState } from 'react';
import { createMeasureProduct, type ProductFormState } from './actions';
import type { FacetOption } from '@/lib/catalogAdmin';

// The front door for a by-measure item — a wall panel sold per m², a grille sold
// per piece. Deliberately tiny: a name, a supplier, a unit and a price. The whole
// point is that it is NOT configurable, so there is no canvas and no tree; the
// quantity (which may be fractional) is typed on the quote line instead.

const inputCls =
  'w-full px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm font-medium text-ink mb-1';

// Common units, offered as suggestions. priceUnit is free text, so staff can type
// anything else (e.g. "set", "roll") without a code change.
const UNIT_SUGGESTIONS = ['m²', 'piece', 'm', 'set'];

export default function NewMeasureProductForm({ sources }: { sources: FacetOption[] }) {
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(
    createMeasureProduct,
    {},
  );
  const [unitPrice, setUnitPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState('m²');
  const [currency, setCurrency] = useState('USD');

  const example = useMemo(() => {
    const p = Number(unitPrice);
    if (!Number.isFinite(p) || p <= 0) return null;
    return `10 ${priceUnit} × ${currency} ${p.toFixed(2)} = ${currency} ${(p * 10).toFixed(2)}`;
  }, [unitPrice, priceUnit, currency]);

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <div className="rounded-lg border border-line bg-surface/40 p-4 text-sm text-muted">
        A <b className="text-ink">by-measure item</b> is sold by a unit — square metres, pieces,
        metres. On a quote you pick it and type the amount (e.g. <b className="text-ink">10.5 m²</b>),
        and it is costed as price × amount, shipped and taxed like any other goods.
      </div>

      <div>
        <label className={labelCls} htmlFor="name">
          Item name
        </label>
        <input
          id="name"
          name="name"
          required
          className={inputCls}
          placeholder="e.g. Wall panel — Polywood"
        />
      </div>

      <div>
        <label className={labelCls} htmlFor="sourceId">
          Supplier / source
        </label>
        <select id="sourceId" name="sourceId" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            Choose a supplier…
          </option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls} htmlFor="unitPrice">
            Price per unit
          </label>
          <input
            id="unitPrice"
            name="unitPrice"
            inputMode="decimal"
            required
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className={inputCls}
            placeholder="e.g. 26"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="priceUnit">
            Per
          </label>
          <input
            id="priceUnit"
            name="priceUnit"
            required
            list="measure-units"
            value={priceUnit}
            onChange={(e) => setPriceUnit(e.target.value)}
            className={inputCls}
            placeholder="m², piece…"
          />
          <datalist id="measure-units">
            {UNIT_SUGGESTIONS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={labelCls} htmlFor="currency">
            Currency
          </label>
          <input
            id="currency"
            name="currency"
            maxLength={3}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className={inputCls}
          />
        </div>
      </div>

      {example && (
        <p className="text-muted text-sm" dir="ltr">
          Example: {example}
        </p>
      )}

      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand-brown text-white px-5 py-2 rounded-lg hover:bg-brand-brown-hover disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create item'}
      </button>
    </form>
  );
}
