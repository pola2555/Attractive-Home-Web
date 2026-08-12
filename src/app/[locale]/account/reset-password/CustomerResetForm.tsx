'use client';

import { useActionState } from 'react';
import type { AuthState } from '../actions';

type Labels = {
  newPassword: string;
  confirmPassword: string;
  submit: string;
  submitting: string;
  passwordHint: string;
};

const inputCls =
  'w-full px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';

export default function CustomerResetForm({
  action,
  token,
  labels,
  dir,
}: {
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  token: string;
  labels: Labels;
  dir: 'ltr' | 'rtl';
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4" dir={dir}>
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
          {labels.newPassword}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className={inputCls}
        />
        <p className="text-muted text-xs mt-1">{labels.passwordHint}</p>
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-ink mb-1">
          {labels.confirmPassword}
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
      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-brand-brown text-white py-2 rounded-lg hover:bg-brand-brown-hover disabled:opacity-50"
      >
        {pending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
