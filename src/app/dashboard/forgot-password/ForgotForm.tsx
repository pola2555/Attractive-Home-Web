'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestStaffReset, type ForgotState } from './actions';

const inputCls =
  'w-full px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';

export default function ForgotForm() {
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(requestStaffReset, { done: false });

  if (state.done) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink">
          If an account exists for that email, a reset link is on its way. Check your inbox — the link expires in 1 hour.
        </p>
        <p className="text-center text-sm">
          <Link href="/dashboard/login" className="text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="username" className={inputCls} />
      </div>
      {state.error && <p className="text-red-400 text-sm">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-brand-brown text-white py-2 rounded-lg hover:bg-brand-brown-hover disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
      <p className="text-center text-sm">
        <Link href="/dashboard/login" className="text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
