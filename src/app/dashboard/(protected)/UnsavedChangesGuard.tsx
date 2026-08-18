'use client';

import { useEffect, useRef } from 'react';
import { useDashboardGuard } from './DashboardGuard';

// Drop this inside any dashboard <form> to protect it from accidental
// navigation while it has unsaved edits. It snapshots the form's values on
// mount and reports "dirty" whenever the current values differ, registering
// with <DashboardGuard> which owns the actual navigation interception.
//
// Dirtiness is derived from the live form, so it needs no per-field wiring:
// editing a field marks the form dirty; editing back to the original clears it;
// submitting clears it (the action either redirects away or re-renders with an
// error, after which further edits mark it dirty again).

function serialize(form: HTMLFormElement): string {
  const parts: string[] = [];
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === 'string') parts.push(`${key}=${value}`);
  }
  return parts.join('&');
}

export default function UnsavedChangesGuard() {
  const { register, unregister } = useDashboardGuard();
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = anchorRef.current?.closest('form');
    if (!form) return;

    const snapshot = serialize(form);
    let dirty = false;
    let submitted = false;

    const recompute = () => {
      submitted = false;
      dirty = serialize(form) !== snapshot;
    };
    const onSubmit = () => {
      submitted = true;
      dirty = false;
    };

    form.addEventListener('input', recompute);
    form.addEventListener('change', recompute);
    form.addEventListener('submit', onSubmit);

    const reg = {
      isDirty: () => dirty && !submitted,
      requestSubmit: () => form.requestSubmit(),
    };
    register(reg);

    return () => {
      form.removeEventListener('input', recompute);
      form.removeEventListener('change', recompute);
      form.removeEventListener('submit', onSubmit);
      unregister(reg);
    };
  }, [register, unregister]);

  return <span ref={anchorRef} hidden aria-hidden="true" />;
}
