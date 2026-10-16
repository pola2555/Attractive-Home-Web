'use client';

import { useState } from 'react';
import { deleteQuote, purgeQuote, restoreQuote } from './actions';

// Row actions for the quote inbox and its Trash. Delete is a SOFT delete (kept
// 30 days, restorable), so it needs no confirmation. Permanent delete, in the
// Trash, is irreversible — so it asks for an in-UI confirmation (never a browser
// popup) before the destructive submit.
export default function QuoteRowActions({
  quoteId,
  trash = false,
  daysLeft,
}: {
  quoteId: string;
  trash?: boolean;
  daysLeft?: number;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!trash) {
    return (
      <form action={deleteQuote}>
        <input type="hidden" name="quoteId" value={quoteId} />
        <button type="submit" className="text-xs text-muted hover:text-red-400">
          Delete
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-end gap-3 text-xs whitespace-nowrap">
      {typeof daysLeft === 'number' && (
        <span className="text-muted">{daysLeft <= 0 ? 'expires today' : `${daysLeft}d left`}</span>
      )}
      <form action={restoreQuote}>
        <input type="hidden" name="quoteId" value={quoteId} />
        <button type="submit" className="text-accent hover:underline">
          Restore
        </button>
      </form>
      {confirming ? (
        <form action={purgeQuote} className="flex items-center gap-2">
          <input type="hidden" name="quoteId" value={quoteId} />
          <button type="submit" className="text-red-400 hover:underline">
            Confirm
          </button>
          <button
            type="button"
            className="text-muted hover:text-ink"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="text-muted hover:text-red-400"
          onClick={() => setConfirming(true)}
        >
          Delete forever
        </button>
      )}
    </div>
  );
}
