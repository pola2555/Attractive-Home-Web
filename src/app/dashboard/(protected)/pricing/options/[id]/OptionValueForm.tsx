'use client';

import { useActionState } from 'react';
import { saveOptionValue, type FormState } from '../../actions';

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

export default function OptionValueForm({
  groupId,
  groupCode,
  colors,
}: {
  groupId: string;
  groupCode: string;
  colors: { id: string; label: string; hex: string | null }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveOptionValue, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="groupId" value={groupId} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls} htmlFor="ov-code">
            Code <span className="text-accent">*</span>
          </label>
          <input id="ov-code" name="code" required className={inputCls} placeholder="solid_oak" />
        </div>
        <div>
          <label className={labelCls} htmlFor="ov-name">
            Name <span className="text-accent">*</span>
          </label>
          <input id="ov-name" name="name" required className={inputCls} placeholder="Solid oak" />
        </div>
        <div>
          <label className={labelCls} htmlFor="ov-numeric">
            Numeric value
          </label>
          <input id="ov-numeric" name="numericValue" type="number" step="any" className={inputCls} />
          <p className="text-muted text-xs mt-1">
            When the value <em>is</em> a number — a 45 mm thickness. Read by formulas as{' '}
            <code>{groupCode}</code>.
          </p>
        </div>
        <div>
          <label className={labelCls} htmlFor="ov-order">
            Sort order
          </label>
          <input id="ov-order" name="sortOrder" type="number" defaultValue={0} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="ov-attrs">
          Attributes (JSON)
        </label>
        <input
          id="ov-attrs"
          name="attributes"
          className={inputCls}
          placeholder='{"density": 700}'
        />
        <p className="text-muted text-xs mt-1">
          {/* Flat identifiers because the formula grammar has no member access. */}
          Each key becomes a formula variable named <code>{groupCode}_&lt;key&gt;</code> — so{' '}
          <code>density</code> here is <code>{groupCode}_density</code> in a formula.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="ov-color">
            Linked colour
          </label>
          <select id="ov-color" name="colorId" defaultValue="" className={inputCls}>
            <option value="">None</option>
            {colors.map((color) => (
              <option key={color.id} value={color.id}>
                {color.label}
                {color.hex ? ` (${color.hex})` : ''}
              </option>
            ))}
          </select>
          <p className="text-muted text-xs mt-1">
            Reuses the catalog colour vocabulary instead of forking a second one.
          </p>
        </div>
        <label className="flex items-end gap-2 text-sm text-ink pb-2">
          <input type="checkbox" name="isActive" defaultChecked /> Active
        </label>
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
        {pending ? 'Saving…' : 'Add value'}
      </button>
    </form>
  );
}
