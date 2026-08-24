'use client';

import { useActionState } from 'react';
import { saveConstraint, type FormState } from '../../actions';

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

export default function ConstraintForm({ templateId }: { templateId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveConstraint, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="templateId" value={templateId} />
      <h3 className="font-medium text-heading">New constraint</h3>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className={labelCls} htmlFor="ct-code">
            Code
          </label>
          <input id="ct-code" name="code" required className={inputCls} placeholder="mdf_wide_thick" />
        </div>
        <div>
          <label className={labelCls} htmlFor="ct-kind">
            Kind
          </label>
          <select id="ct-kind" name="kind" defaultValue="forbid" className={inputCls}>
            <option value="forbid">forbid — block when this matches</option>
            <option value="require">require — block unless this matches</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="ct-condition">
          Condition (JSON)
        </label>
        <input
          id="ct-condition"
          name="condition"
          required
          className={`${inputCls} font-mono`}
          placeholder='{"all":[{"group":"door_material","in":["mdf"]},{"group":"width","op":">","value":1200}]}'
        />
      </div>

      <div>
        <label className={labelCls} htmlFor="ct-message">
          Message shown to whoever is configuring
        </label>
        <input id="ct-message" name="message" required className={inputCls} />
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
        {pending ? 'Saving…' : 'Add constraint'}
      </button>
    </form>
  );
}
