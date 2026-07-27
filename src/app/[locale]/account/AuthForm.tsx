'use client';

import { useActionState } from 'react';
import type { AuthState } from './actions';

type Labels = {
  email: string;
  password: string;
  name: string;
  submit: string;
  submitting: string;
  passwordHint: string;
};

const inputCls =
  'w-full px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';

type ServerAction = (prev: AuthState, formData: FormData) => Promise<AuthState>;

export default function AuthForm({
  action,
  mode,
  labels,
  dir,
}: {
  action: ServerAction;
  mode: 'sign-in' | 'sign-up';
  labels: Labels;
  dir: 'ltr' | 'rtl';
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4" dir={dir}>
      {mode === 'sign-up' && (
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-ink mb-1">
            {labels.name}
          </label>
          <input id="name" name="name" type="text" autoComplete="name" className={inputCls} />
        </div>
      )}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
          {labels.email}
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={inputCls} />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
          {labels.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          className={inputCls}
        />
        {mode === 'sign-up' && <p className="text-muted text-xs mt-1">{labels.passwordHint}</p>}
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
