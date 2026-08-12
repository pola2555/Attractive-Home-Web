'use client';

import { useActionState } from 'react';
import { resetStaffPassword, type ResetState } from './actions';

const inputCls =
  'w-full px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';

export default function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(resetStaffPassword, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className={inputCls}
        />
        <p className="text-muted text-xs mt-1">At least 8 characters</p>
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium mb-1">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          className={inputCls}
        />
      </div>
      {state.error && <p className="text-red-400 text-sm">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-brand-brown text-white py-2 rounded-lg hover:bg-brand-brown-hover disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  );
}
