'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, { error: null });

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="w-full px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      {state.error && <p className="text-red-400 text-sm">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-brand-brown text-white py-2 rounded-lg hover:bg-brand-brown-hover disabled:opacity-50"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
