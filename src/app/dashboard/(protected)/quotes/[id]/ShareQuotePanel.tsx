'use client';

import { useState, useSyncExternalStore, useTransition } from 'react';
import {
  createQuoteShareLink,
  emailQuoteToClient,
  revokeQuoteShareLink,
  type ShareState,
} from '../actions';

const btnCls =
  'px-3 py-1.5 rounded-lg border border-line-strong text-sm text-ink hover:bg-surface disabled:opacity-50';

// "Share with client": issue / copy / revoke the tokenized public link, and
// email it to the client. The origin is read in the browser so the displayed
// link always points at the site the staff member is actually on.
export default function ShareQuotePanel({
  quoteId,
  initialToken,
  clientEmail,
}: {
  quoteId: string;
  initialToken: string | null;
  clientEmail: string | null;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, start] = useTransition();

  // The absolute link needs the browser origin, which doesn't exist during SSR.
  // useSyncExternalStore hands back the server snapshot ('') for the first client
  // render so hydration matches, then swaps in the real origin — no mismatch, and
  // no setState-in-effect. Until it resolves the link is a valid relative path,
  // which the "Open" anchor still follows.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  );
  const url = token ? `${origin}/en/quote/${token}` : '';

  function run(action: (id: string) => Promise<ShareState>, after?: (r: ShareState) => void) {
    setNotice(null);
    start(async () => {
      const r = await action(quoteId);
      if (r.error) setNotice({ kind: 'error', text: r.error });
      else {
        after?.(r);
        if (r.message) setNotice({ kind: 'ok', text: r.message });
      }
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNotice({ kind: 'ok', text: 'Link copied.' });
    } catch {
      setNotice({ kind: 'error', text: 'Copy failed — select the link and copy it manually.' });
    }
  }

  return (
    <section className="border border-line rounded-lg p-4 space-y-3" data-testid="share-quote">
      <div>
        <h2 className="text-lg font-semibold text-heading">Share with client</h2>
        <p className="text-muted text-sm">
          Anyone with the link can view this quotation (read-only, no login). Sharing marks the
          quote as sent and freezes its pricing.
        </p>
      </div>

      {token ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={url}
              aria-label="Public quote link"
              data-testid="share-url"
              dir="ltr"
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-[16rem] px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong text-sm"
            />
            <button type="button" className={btnCls} onClick={copy}>
              Copy link
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" className={btnCls}>
              Open
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btnCls}
              disabled={pending || !clientEmail}
              title={clientEmail ? `Send to ${clientEmail}` : 'This quote has no client email'}
              onClick={() => run(emailQuoteToClient)}
            >
              Email to client
            </button>
            {!clientEmail && (
              <span className="text-xs text-muted">No client email on the lead / customer.</span>
            )}
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg text-sm text-red-300 hover:underline disabled:opacity-50"
              disabled={pending}
              onClick={() => {
                if (window.confirm('Revoke the link? The client will no longer be able to open it.'))
                  run(revokeQuoteShareLink, () => setToken(null));
              }}
            >
              Revoke link
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={btnCls}
          disabled={pending}
          onClick={() => run(createQuoteShareLink, (r) => setToken(r.token ?? null))}
        >
          Generate share link
        </button>
      )}

      {notice && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`text-sm ${notice.kind === 'error' ? 'text-red-300' : 'text-accent'}`}
        >
          {notice.text}
        </p>
      )}
    </section>
  );
}
