'use client';

import { useActionState } from 'react';
import { saveTemplateOption, type FormState } from '../../actions';
import type { OptionGroupRow } from '@/lib/configuratorAdmin';

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

export default function TemplateOptionForm({
  templateId,
  groups,
  earlierCodes,
}: {
  templateId: string;
  groups: OptionGroupRow[];
  earlierCodes: string[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveTemplateOption, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="templateId" value={templateId} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls} htmlFor="to-group">
            Option group
          </label>
          <select id="to-group" name="groupId" className={inputCls}>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.code} ({group.inputKind})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="to-order">
            Order
          </label>
          <input id="to-order" name="sortOrder" type="number" defaultValue={0} className={inputCls} />
        </div>
        <label className="flex items-end gap-2 text-sm text-ink pb-2">
          <input type="checkbox" name="isRequired" defaultChecked /> Required
        </label>
      </div>

      <div>
        <label className={labelCls} htmlFor="to-condition">
          Shown when (JSON condition)
        </label>
        <input
          id="to-condition"
          name="condition"
          className={inputCls}
          placeholder='{"group": "door_type", "in": ["glazed"]}'
        />
        <p className="text-muted text-xs mt-1">
          Hides the whole group, not just its values. Blank means always shown. May only reference:{' '}
          {earlierCodes.length ? <code>{earlierCodes.join(', ')}</code> : 'nothing yet'}.
        </p>
      </div>

      <div>
        <label className={labelCls} htmlFor="to-ranges">
          Numeric ranges (JSON array)
        </label>
        <input
          id="to-ranges"
          name="ranges"
          className={inputCls}
          placeholder='[{"condition": {"group":"thickness","op":"<","value":45}, "min":600, "max":1200, "step":10}, {"condition": null, "min":600, "max":1400, "step":10}]'
        />
        <p className="text-muted text-xs mt-1">
          First match wins; a null condition is the default. This is the only place a limit can
          depend on an earlier choice, because a number input has no values to hang one on.
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
        {pending ? 'Saving…' : 'Bind option'}
      </button>
    </form>
  );
}
