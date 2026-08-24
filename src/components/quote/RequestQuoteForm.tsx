'use client';

import { useActionState } from 'react';
import { submitQuoteRequest, type QuoteRequestState } from './actions';

export type RequestQuoteLabels = {
  title: string;
  intro: string;
  name: string;
  phone: string;
  email: string;
  emailOptional: string;
  message: string;
  submit: string;
  submitting: string;
  success: string;
  error: string;
  cancel: string;
};

const inputCls =
  'w-full px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm font-medium text-ink mb-1';

export default function RequestQuoteForm({
  productIds,
  locale,
  sourcePath,
  labels,
  onDone,
}: {
  productIds: string[];
  locale: string;
  sourcePath: string;
  labels: RequestQuoteLabels;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState<QuoteRequestState, FormData>(
    submitQuoteRequest,
    { status: 'idle' },
  );

  if (state.status === 'success') {
    return (
      <div className="space-y-4">
        <p className="text-heading">
          {labels.success}
          {state.message && <span className="text-muted"> ({state.message})</span>}
        </p>
        {onDone && (
          <button type="button" onClick={onDone} className="text-accent hover:underline text-sm">
            {labels.cancel}
          </button>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-muted text-sm">{labels.intro}</p>

      <input type="hidden" name="productIds" value={productIds.join(',')} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="sourcePath" value={sourcePath} />
      {/* Honeypot — hidden from people, irresistible to bots. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute w-0 h-0 opacity-0 pointer-events-none"
      />

      <div>
        <label className={labelCls} htmlFor="rq-name">
          {labels.name}
        </label>
        <input id="rq-name" name="name" required autoComplete="name" className={inputCls} />
      </div>

      <div>
        <label className={labelCls} htmlFor="rq-phone">
          {labels.phone}
        </label>
        <input
          id="rq-phone"
          name="phone"
          required
          type="tel"
          autoComplete="tel"
          dir="ltr"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor="rq-email">
          {labels.email} <span className="text-muted font-normal">{labels.emailOptional}</span>
        </label>
        <input id="rq-email" name="email" type="email" autoComplete="email" className={inputCls} />
      </div>

      <div>
        <label className={labelCls} htmlFor="rq-message">
          {labels.message}
        </label>
        <textarea id="rq-message" name="message" rows={3} className={inputCls} />
      </div>

      {state.status === 'error' && <p className="text-sm text-red-300">{labels.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-brown hover:bg-brand-brown-hover text-ink font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {pending ? labels.submitting : labels.submit}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="text-muted hover:text-ink text-sm">
            {labels.cancel}
          </button>
        )}
      </div>
    </form>
  );
}
