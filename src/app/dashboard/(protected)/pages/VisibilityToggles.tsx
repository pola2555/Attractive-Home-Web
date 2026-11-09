'use client';

import { useState, useTransition } from 'react';
import { setPageFlag } from './actions';

type Flag = 'isPublished' | 'showInNav' | 'showInFooter';

export type ToggleRow = {
  key: string;
  canHide: boolean;
  navEligible: boolean;
  footerEligible: boolean;
  isPublished: boolean;
  showInNav: boolean;
  showInFooter: boolean;
};

function Switch({
  checked,
  disabled,
  label,
  onToggle,
  pending,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={disabled ? 'This page cannot be hidden' : label}
      disabled={disabled || pending}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-brand-brown' : 'bg-line-strong'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// Three visibility switches for one page. Each flip calls the server action and
// reflects the saved result locally (home's "Visible" switch is locked, and the
// server refuses to hide it even if the control were forced).
export default function VisibilityToggles({
  row,
  layout = 'row',
}: {
  row: ToggleRow;
  layout?: 'row' | 'stack';
}) {
  const [state, setState] = useState({
    isPublished: row.isPublished,
    showInNav: row.showInNav,
    showInFooter: row.showInFooter,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (flag: Flag) => {
    const next = !state[flag];
    setError(null);
    setState((s) => ({ ...s, [flag]: next })); // optimistic
    startTransition(async () => {
      const res = await setPageFlag(row.key, flag, next);
      if (!res.ok) {
        setState((s) => ({ ...s, [flag]: !next })); // revert
        setError(res.error ?? 'Could not save.');
      }
    });
  };

  const wrap = layout === 'stack' ? 'flex flex-col gap-3' : 'flex items-center gap-5';

  return (
    <div>
      <div className={wrap}>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={state.isPublished}
            disabled={!row.canHide}
            pending={pending}
            label={`Visible — ${row.key}`}
            onToggle={() => toggle('isPublished')}
          />
          <span className="text-muted">
            Visible{!row.canHide && <span className="ms-1 text-xs">🔒</span>}
          </span>
        </label>

        {row.navEligible && (
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={state.showInNav}
              pending={pending}
              label={`In menu — ${row.key}`}
              onToggle={() => toggle('showInNav')}
            />
            <span className="text-muted">In menu</span>
          </label>
        )}

        {row.footerEligible && (
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={state.showInFooter}
              pending={pending}
              label={`In footer — ${row.key}`}
              onToggle={() => toggle('showInFooter')}
            />
            <span className="text-muted">In footer</span>
          </label>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}
