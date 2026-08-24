'use client';

import { useActionState } from 'react';
import { saveGridAxes, type FormState } from '../../../../actions';

// Which questions form the grid's axes, and in what order.
//
// A client component rather than a bare form action because the action needs
// to be able to REFUSE — picking a number question as an axis is the mistake
// worth catching, and it has to say why rather than silently doing nothing.

export default function AxesForm({
  templateId,
  variantId,
  options,
  selected,
}: {
  templateId: string;
  variantId: string;
  options: { id: string; label: string; count: number }[];
  selected: string[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveGridAxes, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="variantId" value={variantId} />

      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.id}
            className="px-3 py-1.5 rounded-full text-sm border border-line text-ink cursor-pointer hover:border-accent/60"
          >
            <input
              type="checkbox"
              name="optionIds"
              value={option.id}
              defaultChecked={selected.includes(option.id)}
              className="me-1.5"
            />
            {option.label}
            <span className="text-muted text-xs"> ({option.count})</span>
          </label>
        ))}
      </div>

      {options.length === 0 && (
        <p className="text-muted text-sm">
          No single-choice questions are bound to this variant yet.
        </p>
      )}

      {state.error && (
        <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-sm text-accent">Axes set. Fill the grid below.</p>}

      <button
        disabled={pending || options.length === 0}
        className="px-4 py-2 rounded-lg border border-line-strong text-ink hover:border-accent text-sm disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Set axes'}
      </button>
    </form>
  );
}
