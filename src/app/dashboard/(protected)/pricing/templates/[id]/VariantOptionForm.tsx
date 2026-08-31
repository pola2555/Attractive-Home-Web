'use client';

import { useActionState } from 'react';
import { saveVariantOption, type FormState } from '../../actions';
import type { OptionGroupRow } from '@/lib/configuratorAdmin';

// Bind a question to ONE branch. This is what makes a real fork authorable:
// the aluminium frame asks Thickness, the wood frame asks Grade, and neither
// leaks into the other. A newly bound branch question offers every value its
// group defines (curate the set with the "Offered values" editor once it is
// added); number groups take their bounds from the shared binding instead.

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

export default function VariantOptionForm({
  templateId,
  variantId,
  groups,
  nextOrder,
}: {
  templateId: string;
  variantId: string;
  groups: OptionGroupRow[];
  nextOrder: number;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveVariantOption, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="variantId" value={variantId} />

      <div className="min-w-[10rem]">
        <label className={labelCls} htmlFor={`vq-group-${variantId}`}>
          Add a question
        </label>
        <select id={`vq-group-${variantId}`} name="groupId" className={inputCls}>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.code} ({group.inputKind})
            </option>
          ))}
        </select>
      </div>
      <div className="w-20">
        <label className={labelCls} htmlFor={`vq-order-${variantId}`}>
          Order
        </label>
        <input
          id={`vq-order-${variantId}`}
          name="sortOrder"
          type="number"
          defaultValue={nextOrder}
          className={inputCls}
        />
      </div>
      <div className="min-w-[14rem] flex-1">
        <label className={labelCls} htmlFor={`vq-config-${variantId}`}>
          Configuration text
        </label>
        <input
          id={`vq-config-${variantId}`}
          name="configText"
          className={inputCls}
          placeholder="What this branch includes for this question"
        />
      </div>

      <button
        disabled={pending}
        className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add to branch'}
      </button>

      {state.error && <p className="w-full text-sm text-red-300">{state.error}</p>}
      {state.ok && <p className="w-full text-sm text-accent">Added.</p>}
    </form>
  );
}
