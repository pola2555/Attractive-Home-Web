'use client';

import { useActionState } from 'react';
import { saveTemplate, type FormState } from '../actions';

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

export default function TemplateForm({
  template,
  hsCodes = [],
}: {
  template?: {
    id: string;
    code: string;
    name: string;
    currency: string;
    isActive: boolean;
    hsCodeId: string | null;
  };
  hsCodes?: { id: string; code: string; description: string }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveTemplate, {});

  return (
    <form action={formAction} className="space-y-3">
      {template && <input type="hidden" name="id" value={template.id} />}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls} htmlFor="t-code">
            Code <span className="text-accent">*</span>
          </label>
          <input
            id="t-code"
            name="code"
            required
            defaultValue={template?.code ?? ''}
            placeholder="door"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="t-name">
            Name <span className="text-accent">*</span>
          </label>
          <input
            id="t-name"
            name="name"
            required
            defaultValue={template?.name ?? ''}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="t-currency">
            Currency
          </label>
          <input
            id="t-currency"
            name="currency"
            maxLength={3}
            defaultValue={template?.currency ?? 'USD'}
            className={inputCls}
          />
          {/* One currency per template keeps the pricing engine a pure function
              with no FX lookup mid-calculation. */}
          <p className="text-muted text-xs mt-1">Every rule on this template uses it.</p>
        </div>
        <label className="flex items-end gap-2 text-sm text-ink pb-2">
          <input type="checkbox" name="isActive" defaultChecked={template?.isActive ?? true} />{' '}
          Active
        </label>
      </div>

      <div className="max-w-lg">
        <label className={labelCls} htmlFor="t-hs">
          Customs classification
        </label>
        <select
          id="t-hs"
          name="hsCodeId"
          defaultValue={template?.hsCodeId ?? ''}
          className={inputCls}
        >
          <option value="">None — duty falls back to 5% with a warning</option>
          {hsCodes.map((hs) => (
            <option key={hs.id} value={hs.id}>
              {hs.code} — {hs.description}
            </option>
          ))}
        </select>
        <p className="text-muted text-xs mt-1">
          An item configured here carries no product, so this is its only route to a real duty
          rate.
        </p>
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
        {pending ? 'Saving…' : template ? 'Save' : 'Create template'}
      </button>
    </form>
  );
}
