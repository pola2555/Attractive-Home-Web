'use client';

import { useActionState, useEffect, useState } from 'react';
import { submitLead, type LeadFormState } from './actions';
import { track } from '@/lib/analytics/track';

export type ContactFormLabels = {
  nameLabel: string;
  namePlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  send: string;
  sending: string;
  thankYou: string;
  thankYouSub: string;
  errorGeneric: string;
};

// Ported form behavior: country code auto-detected once via ipapi.co and
// cached in localStorage, exactly like the old Contacts.jsx.
export default function ContactForm({
  locale,
  sourcePath,
  labels,
}: {
  locale: string;
  sourcePath: string;
  labels: ContactFormLabels;
}) {
  const [state, formAction, pending] = useActionState<LeadFormState, FormData>(submitLead, {
    status: 'idle',
  });
  const [countryCode, setCountryCode] = useState('+971');

  useEffect(() => {
    let alive = true;
    const apply = (code: string) => {
      if (alive) setCountryCode(code);
    };
    queueMicrotask(async () => {
      const cached = localStorage.getItem('countryCode');
      if (cached) {
        apply(cached);
        return;
      }
      try {
        const response = await fetch('https://ipapi.co/json/');
        if (!response.ok) return;
        const data = (await response.json()) as { country_calling_code?: string };
        if (data.country_calling_code) {
          localStorage.setItem('countryCode', data.country_calling_code);
          apply(data.country_calling_code);
        }
      } catch {
        /* keep the +971 default */
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Fire the conversion event once the lead is stored.
  useEffect(() => {
    if (state.status === 'success') {
      track('generate_lead', { method: 'contact_form' }, { locale, path: sourcePath });
    }
  }, [state.status, locale, sourcePath]);

  if (state.status === 'success') {
    return (
      <div className="py-8 text-start">
        <p className="text-accent text-xl font-semibold mb-2">{labels.thankYou}</p>
        <p className="text-heading">{labels.thankYouSub}</p>
      </div>
    );
  }

  return (
    <form className="space-y-4" action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="sourcePath" value={sourcePath} />
      {/* Honeypot field — hidden from real users */}
      <input type="text" name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          {labels.nameLabel}
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          placeholder={labels.namePlaceholder}
          className="w-full mt-1 px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div>
        <label htmlFor="phone" className="block text-sm font-medium">
          {labels.phoneLabel}
        </label>
        <div className="flex items-center mt-1">
          <input
            type="text"
            name="countryCode"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            className="bg-surface text-ink px-4 py-2 rounded-s-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent w-20"
            aria-label="Country code"
          />
          <input
            type="text"
            id="phone"
            name="phone"
            required
            placeholder={labels.phonePlaceholder}
            className="w-full px-4 py-2 bg-surface text-ink rounded-e-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>
      {state.status === 'error' && <p className="text-red-400 text-sm">{labels.errorGeneric}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-brand-brown text-white py-2 rounded-lg hover:bg-brand-brown-hover focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? labels.sending : labels.send}
      </button>
    </form>
  );
}
