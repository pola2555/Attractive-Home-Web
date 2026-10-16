'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { addMeasureItem, type FormState } from '../actions';

// Adds a by-measure item (wall panel, grille…) to the quote as its own line. The
// amount can be fractional — 10.5 m² — and the running total is shown before the
// line is added, so the number is never a surprise.
export type MeasureProduct = {
  id: string;
  name: string;
  unitPrice: number;
  priceUnit: string;
  currency: string;
};

const inputCls =
  'px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-xs font-medium text-muted mb-1';

export default function AddMeasureLine({
  quoteId,
  products,
}: {
  quoteId: string;
  products: MeasureProduct[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addMeasureItem, {});
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');

  const selected = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [productId, products],
  );
  const total = useMemo(() => {
    const q = Number(quantity);
    if (!selected || !Number.isFinite(q) || q <= 0) return null;
    return selected.unitPrice * q;
  }, [selected, quantity]);

  if (products.length === 0) {
    return (
      <p className="text-muted text-sm">
        No by-measure items yet. Create one under{' '}
        <Link href="/dashboard/products/new?type=measure" className="text-accent hover:underline">
          Products → New → By-measure item
        </Link>
        .
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="quoteId" value={quoteId} />

      <div className="min-w-[14rem] flex-1">
        <label className={labelCls} htmlFor="measure-product">
          Item
        </label>
        <select
          id="measure-product"
          name="productId"
          required
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className={`${inputCls} w-full`}
        >
          <option value="" disabled>
            Choose an item…
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.currency} {p.unitPrice.toFixed(2)} / {p.priceUnit}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls} htmlFor="measure-qty">
          Quantity{selected ? ` (${selected.priceUnit})` : ''}
        </label>
        <input
          id="measure-qty"
          name="quantity"
          type="number"
          min="0.001"
          step="any"
          required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="e.g. 10.5"
          className={`${inputCls} w-28`}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white text-sm disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add extra'}
      </button>

      {total != null && selected && (
        <span className="text-heading text-sm pb-2" dir="ltr">
          = {selected.currency} {total.toFixed(2)}
        </span>
      )}

      {state.error && <p className="w-full text-red-500 text-sm">{state.error}</p>}
    </form>
  );
}
