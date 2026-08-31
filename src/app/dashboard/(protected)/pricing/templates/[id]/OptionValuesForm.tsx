'use client';

import { useActionState, useState } from 'react';
import { saveTemplateOptionValues, type FormState } from '../../actions';

// Curate which of a group's values a bound question actually offers. Binding a
// question seeds it with every value (see saveTemplateOption); this is where an
// editor narrows that set — "this door only comes in five of the eleven
// colours". Any per-value condition already set (the availability "tree", which
// the seed and upgrade effects can create) is preserved verbatim, so trimming
// the offered set never silently drops one.

type Value = { id: string; code: string; name: string };

export default function OptionValuesForm({
  templateOptionId,
  allValues,
  offered,
}: {
  templateOptionId: string;
  allValues: Value[];
  offered: { valueId: string; condition: unknown }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveTemplateOptionValues,
    {},
  );
  const [checked, setChecked] = useState<Set<string>>(() => new Set(offered.map((o) => o.valueId)));
  const conditionById = new Map(offered.map((o) => [o.valueId, o.condition ?? null]));

  // Kept in the group's own order; the sort_order is the position among the
  // ones actually offered. Conditions ride along untouched.
  const valuesJson = JSON.stringify(
    allValues
      .filter((v) => checked.has(v.id))
      .map((v, index) => ({
        valueId: v.id,
        sortOrder: index,
        condition: conditionById.get(v.id) ?? null,
      })),
  );

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={formAction} className="pt-3 space-y-2">
      <input type="hidden" name="templateOptionId" value={templateOptionId} />
      <input type="hidden" name="valuesJson" value={valuesJson} />
      <p className="text-xs uppercase tracking-wider text-muted">Offered values</p>
      {allValues.length === 0 ? (
        <p className="text-muted text-xs">
          This group has no values yet — add them under Option vocabulary first.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {allValues.map((value) => {
            const on = checked.has(value.id);
            const conditional = conditionById.get(value.id);
            return (
              <label
                key={value.id}
                className={`px-2 py-0.5 rounded-full text-xs border cursor-pointer ${
                  on ? 'border-accent text-heading bg-accent-2/10' : 'border-line text-ink hover:border-accent/60'
                }`}
              >
                <input
                  type="checkbox"
                  className="me-1"
                  checked={on}
                  onChange={() => toggle(value.id)}
                />
                {value.name}
                {conditional ? <span className="text-accent"> ·cond</span> : null}
              </label>
            );
          })}
        </div>
      )}
      {checked.size === 0 && allValues.length > 0 && (
        <p className="text-xs text-amber-300">
          A question with no values can never be answered — leave at least one ticked.
        </p>
      )}
      {state.error && <p className="text-xs text-red-300">{state.error}</p>}
      {state.ok && <p className="text-xs text-accent">Saved.</p>}
      <button
        disabled={pending}
        className="px-3 py-1.5 rounded border border-line-strong text-ink hover:border-accent text-sm disabled:opacity-50"
      >
        Save values
      </button>
    </form>
  );
}
