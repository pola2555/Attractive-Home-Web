'use client';

import { useActionState, useState } from 'react';
import { createTreeProduct, type ProductFormState } from './actions';
import type { FacetOption } from '@/lib/catalogAdmin';

// The lightweight front door for a configurable product. It asks for almost
// nothing — a name, a supplier, and whether to start blank or copy an existing
// tree product — then hands off to the tree canvas, where the real building
// happens. Deliberately NOT the full ProductForm: a door has no single price or
// size to fill in here.

const inputCls =
  'w-full px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm font-medium text-ink mb-1';

type TreeOption = { id: string; name: string };

export default function NewTreeProductForm({
  sources,
  treeProducts,
}: {
  sources: FacetOption[];
  treeProducts: TreeOption[];
}) {
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(
    createTreeProduct,
    {},
  );
  const [mode, setMode] = useState<'scratch' | 'copy'>('scratch');
  const canCopy = treeProducts.length > 0;

  const cardBase = 'flex-1 rounded-lg border p-3 text-start transition-colors cursor-pointer';
  const active = 'border-accent bg-accent-2/10';
  const idle = 'border-line hover:border-accent/60';

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <div className="rounded-lg border border-line bg-surface/40 p-4 text-sm text-muted">
        A <b className="text-ink">tree product</b> is priced by the choices a customer makes — like a
        door with thicknesses, edge bandings, colours and add-ons. You build it on a canvas next.
      </div>

      {/* Start from scratch / copy an existing tree */}
      <div>
        <span className={labelCls}>How to start</span>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => setMode('scratch')}
            className={`${cardBase} ${mode === 'scratch' ? active : idle}`}
          >
            <div className="font-medium text-heading">Start from scratch</div>
            <p className="text-muted text-xs mt-1">An empty canvas.</p>
          </button>
          <button
            type="button"
            onClick={() => canCopy && setMode('copy')}
            disabled={!canCopy}
            className={`${cardBase} ${mode === 'copy' ? active : idle} ${!canCopy ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="font-medium text-heading">Copy an existing tree</div>
            <p className="text-muted text-xs mt-1">
              {canCopy ? 'Duplicate another tree product, then tweak.' : 'No tree products yet.'}
            </p>
          </button>
        </div>
      </div>

      {mode === 'copy' && canCopy && (
        <div>
          <label className={labelCls} htmlFor="sourceProductId">
            Copy from
          </label>
          <select
            id="sourceProductId"
            name="sourceProductId"
            required
            defaultValue=""
            className={inputCls}
          >
            <option value="" disabled>
              Choose a tree product…
            </option>
            {treeProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="text-muted text-xs mt-1">
            Its whole tree — price table, add-ons, size steps — is copied into the new product.
          </p>
        </div>
      )}

      <div>
        <label className={labelCls} htmlFor="name">
          Product name
        </label>
        <input id="name" name="name" required className={inputCls} placeholder="e.g. Aluminium Door" />
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
        <p className="text-muted text-xs mt-1">
          Every product comes from a supplier — even a made-to-order one.
        </p>
      </div>

      <div>
        <label className={labelCls} htmlFor="code">
          Code <span className="text-muted font-normal">(optional)</span>
        </label>
        <input id="code" name="code" className={inputCls} placeholder="auto from the name" />
        <p className="text-muted text-xs mt-1">
          Internal id for the configurator. Leave blank to generate it.
        </p>
      </div>

      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand-brown text-white px-5 py-2 rounded-lg hover:bg-brand-brown-hover disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create & open canvas'}
      </button>
    </form>
  );
}
