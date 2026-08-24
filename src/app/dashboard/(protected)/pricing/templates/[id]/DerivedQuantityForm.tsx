'use client';

import { useActionState } from 'react';
import { saveDerivedQuantity, type FormState } from '../../actions';
import { ALLOWED_FUNCTIONS } from '@/lib/configurator/formula';
import type { TemplateDef } from '@/lib/configurator/types';

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

export default function DerivedQuantityForm({
  templateId,
  template,
}: {
  templateId: string;
  template: TemplateDef;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveDerivedQuantity, {});

  // Exactly what the formula parser will accept, shown inline with units so the
  // implicit millimetres in `height * width / 1000000` are visible.
  const variables: string[] = [];
  for (const option of template.options) {
    variables.push(option.unit ? `${option.groupCode} (${option.unit})` : option.groupCode);
    for (const value of option.values) {
      for (const key of Object.keys(value.attributes ?? {})) {
        const name = `${option.groupCode}_${key}`;
        if (!variables.includes(name)) variables.push(name);
      }
    }
  }
  for (const quantity of template.derivedQuantities) {
    variables.push(quantity.unit ? `${quantity.code} (${quantity.unit})` : quantity.code);
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="templateId" value={templateId} />
      <h3 className="font-medium text-heading">New derived quantity</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls} htmlFor="dq-code">
            Code
          </label>
          <input id="dq-code" name="code" required className={inputCls} placeholder="weight_kg" />
        </div>
        <div>
          <label className={labelCls} htmlFor="dq-unit">
            Unit
          </label>
          <input id="dq-unit" name="unit" className={inputCls} placeholder="kg" />
        </div>
        <div>
          <label className={labelCls} htmlFor="dq-order">
            Order
          </label>
          <input id="dq-order" name="sortOrder" type="number" defaultValue={1} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="dq-formula">
          Formula
        </label>
        <input
          id="dq-formula"
          name="formula"
          required
          className={`${inputCls} font-mono`}
          placeholder="volume_m3 * door_material_density"
        />
        <p className="text-muted text-xs mt-1">
          Available: <code>{variables.join(', ') || 'none yet'}</code>. Functions:{' '}
          <code>{ALLOWED_FUNCTIONS.join(', ')}</code>. Only quantities with a{' '}
          <em>lower order</em> may be referenced.
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
        {pending ? 'Saving…' : 'Add quantity'}
      </button>
    </form>
  );
}
