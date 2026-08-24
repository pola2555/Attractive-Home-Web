'use client';

import { useActionState, useState } from 'react';
import { createQuote, type FormState } from './actions';

// A small inline create form rather than a separate /new page: a quote has one
// meaningful field at creation time (its title), and everything else is filled
// in on the assembly page.
export default function NewQuoteButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(createQuote, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink"
      >
        New quote
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input
        name="title"
        autoFocus
        placeholder="Quote title (optional)"
        className="px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
        Cancel
      </button>
      {state.error && <span className="text-sm text-red-300">{state.error}</span>}
    </form>
  );
}
