'use client';

import { useActionState } from 'react';
import { saveVariant, type FormState } from '../../actions';

// Step 2 of the editor walkthrough: the fork.
//
// A product with no real branches never sees this form — the template page
// only shows it once someone chooses to add one — so a simple product is not
// made to pay for a capability it does not use.

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

export default function VariantForm({ templateId }: { templateId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveVariant, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="templateId" value={templateId} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls} htmlFor="v-code">
            Code
          </label>
          <input id="v-code" name="code" className={inputCls} placeholder="alu_wpc" required />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls} htmlFor="v-name">
            Name
          </label>
          <input
            id="v-name"
            name="name"
            className={inputCls}
            placeholder="Aluminum Frame + WPC Connecting Board"
            required
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="v-order">
            Order
          </label>
          <input
            id="v-order"
            name="sortOrder"
            type="number"
            defaultValue={0}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="v-included">
          What the base price already includes
        </label>
        <input
          id="v-included"
          name="includedSpec"
          className={inputCls}
          placeholder="Frame + 1 lock + 3× 2D hinges, wood keel + graphite board"
        />
        <p className="text-muted text-xs mt-1">
          Copy the supplier&rsquo;s &ldquo;Configuration&rdquo; column. It is what tells a
          salesperson what an upgrade is actually changing.
        </p>
      </div>

      {state.error && (
        <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-sm text-accent">Saved. Its price grid is ready to fill.</p>}

      <button
        disabled={pending}
        className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Add variant'}
      </button>
    </form>
  );
}
