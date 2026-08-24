'use client';

import { useActionState } from 'react';
import { saveOptionGroup, type FormState } from '../actions';
import { INPUT_KINDS } from '@/lib/configurator/types';

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

export default function OptionGroupForm({
  group,
}: {
  group?: {
    id: string;
    code: string;
    name: string;
    inputKind: string;
    unit: string | null;
    sortOrder: number;
    isActive: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveOptionGroup, {});

  return (
    <form action={formAction} className="space-y-3">
      {group && <input type="hidden" name="id" value={group.id} />}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className={labelCls} htmlFor="og-code">
            Code <span className="text-accent">*</span>
          </label>
          <input
            id="og-code"
            name="code"
            required
            defaultValue={group?.code ?? ''}
            placeholder="door_material"
            className={inputCls}
          />
          {/* `__` is reserved for `__qty`, the line-quantity pseudo-variable. */}
          <p className="text-muted text-xs mt-1">
            Lowercase, underscores. This is the variable name formulas and conditions use.
          </p>
        </div>
        <div>
          <label className={labelCls} htmlFor="og-name">
            Name <span className="text-accent">*</span>
          </label>
          <input
            id="og-name"
            name="name"
            required
            defaultValue={group?.name ?? ''}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="og-kind">
            Input kind
          </label>
          <select
            id="og-kind"
            name="inputKind"
            defaultValue={group?.inputKind ?? 'select'}
            className={inputCls}
          >
            {INPUT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="og-unit">
            Unit
          </label>
          <input
            id="og-unit"
            name="unit"
            defaultValue={group?.unit ?? ''}
            placeholder="mm"
            className={inputCls}
          />
          <p className="text-muted text-xs mt-1">
            Shown next to the input so a formula&apos;s implicit units stay visible.
          </p>
        </div>
        <div>
          <label className={labelCls} htmlFor="og-order">
            Sort order
          </label>
          <input
            id="og-order"
            name="sortOrder"
            type="number"
            defaultValue={group?.sortOrder ?? 0}
            className={inputCls}
          />
        </div>
        <label className="flex items-end gap-2 text-sm text-ink pb-2">
          <input type="checkbox" name="isActive" defaultChecked={group?.isActive ?? true} /> Active
        </label>
      </div>

      <div>
        <label className={labelCls} htmlFor="og-help">
          Help text
        </label>
        <input id="og-help" name="helpText" className={inputCls} />
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
        {pending ? 'Saving…' : group ? 'Save' : 'Create group'}
      </button>
    </form>
  );
}
