'use client';

import { useActionState } from 'react';
import { LOCALES, dirOf, type Locale } from '@/i18n/config';
import type { ContentBlockFormInitial } from '@/lib/contentAdmin';
import type { FormState } from './actions';

const LOCALE_LABEL: Record<Locale, string> = { en: 'English', ar: 'Arabic', fr: 'French', ru: 'Russian' };
const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

type ServerAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export default function ContentBlockForm({
  action,
  initial,
}: {
  action: ServerAction;
  initial: ContentBlockFormInitial;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      {state.error && (
        <p className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-200 text-sm">
          {state.error}
        </p>
      )}

      <label className="block">
        <span className={labelCls}>Notes (internal — where this appears)</span>
        <input name="notes" defaultValue={initial.notes} className={inputCls} />
      </label>

      <div className="space-y-4">
        {LOCALES.map((locale) => (
          <label key={locale} className="block">
            <span className={labelCls}>{LOCALE_LABEL[locale]}</span>
            <textarea
              name={`body_${locale}`}
              defaultValue={initial.bodies[locale]}
              rows={3}
              dir={dirOf(locale)}
              placeholder={locale === 'en' ? 'Shown when a language has no translation' : 'Leave blank to fall back to English'}
              className={inputCls}
            />
          </label>
        ))}
      </div>

      <button
        disabled={isPending}
        className="px-6 py-2.5 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white disabled:opacity-60"
      >
        {isPending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
