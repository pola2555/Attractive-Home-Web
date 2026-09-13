'use client';

import { useState } from 'react';

// A delete control that confirms IN THE UI, not with a browser popup. First
// click arms it (the button becomes a Remove/Cancel pair, or a ✓/✕ pair in
// compact mode for chips); only the confirm button submits the form. Styles are
// scoped under `.ah-tree` in TreeEditor's stylesheet, which wraps every place
// this is used.

type DeleteAction = (fd: FormData) => void | Promise<void>;

export default function ConfirmDelete({
  action,
  hidden,
  label,
  prompt = 'Remove this?',
  compact = false,
}: {
  action: DeleteAction;
  hidden: Record<string, string>;
  label: string;
  prompt?: string;
  compact?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <form action={action} className="cd" onSubmit={() => setArmed(false)}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {!armed ? (
        <button
          type="button"
          className={compact ? 'cd-x' : 'cd-trigger'}
          onClick={() => setArmed(true)}
          aria-label={compact ? 'Remove' : undefined}
        >
          {label}
        </button>
      ) : compact ? (
        <span className="cd-armed">
          <button type="submit" className="cd-yes" aria-label="Confirm remove">
            ✓
          </button>
          <button type="button" className="cd-no" onClick={() => setArmed(false)} aria-label="Cancel">
            ✕
          </button>
        </span>
      ) : (
        <span className="cd-armed">
          <span className="cd-q">{prompt}</span>
          <button type="submit" className="cd-yes">
            Remove
          </button>
          <button type="button" className="cd-no" onClick={() => setArmed(false)}>
            Cancel
          </button>
        </span>
      )}
    </form>
  );
}
