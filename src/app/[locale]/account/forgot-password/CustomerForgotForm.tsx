'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import type { RequestState } from '../actions';

type Labels = {
  email: string;
  submit: string;
  submitting: string;
  requested: string;
  backToSignIn: string;
};

const inputCls =
  'w-full px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';

export default function CustomerForgotForm({
  action,
  labels,
  dir,
  signInHref,
}: {
  action: (prev: RequestState, formData: FormData) => Promise<RequestState>;
  labels: Labels;
  dir: 'ltr' | 'rtl';
  signInHref: string;
}) {
  const [state, formAction, pending] = useActionState<RequestState, FormData>(action, { done: false });

  if (state.done) {
    return (
      <div className="space-y-4" dir={dir}>
        <p className="text-sm text-ink">{labels.requested}</p>
        <p className="text-center text-sm">
          <Link href={signInHref} className="text-accent hover:underline">
            {labels.backToSignIn}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" dir={dir}>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
          {labels.email}
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={inputCls} />
      </div>
      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-brand-brown text-white py-2 rounded-lg hover:bg-brand-brown-hover disabled:opacity-50"
      >
        {pending ? labels.submitting : labels.submit}
      </button>
      <p className="text-center text-sm">
        <Link href={signInHref} className="text-accent hover:underline">
          {labels.backToSignIn}
        </Link>
      </p>
    </form>
  );
}
