'use client';

import { useActionState, useState } from 'react';
import { LOCALES, dirOf, type Locale } from '@/i18n/config';
import type { ServiceFormInitial } from '@/lib/servicesAdmin';
import type { FormState } from './actions';
import ServiceMediaUploader from './ServiceMediaUploader';

const LOCALE_LABEL: Record<Locale, string> = { en: 'English', ar: 'Arabic', fr: 'French', ru: 'Russian' };
const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

type ServerAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export default function ServiceForm({
  action,
  initial,
  submitLabel,
}: {
  action: ServerAction;
  initial?: ServiceFormInitial;
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, {});
  const [busy, setBusy] = useState(false);
  const t = (locale: Locale) => initial?.translations[locale];

  return (
    <form action={formAction} className="max-w-3xl space-y-8">
      {state.error && (
        <p className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-200 text-sm">
          {state.error}
        </p>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-heading">Title &amp; copy</h2>
        {LOCALES.map((locale) => {
          const tr = t(locale);
          const body = (
            <div className="space-y-3 pt-3">
              <label className="block">
                <span className={labelCls}>
                  Title {locale === 'en' && <span className="text-accent">*</span>}
                </span>
                <input name={`title_${locale}`} defaultValue={tr?.title} required={locale === 'en'} dir={dirOf(locale)} className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>Description</span>
                <textarea name={`description_${locale}`} defaultValue={tr?.description} rows={3} dir={dirOf(locale)} className={inputCls} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={labelCls}>Meta title (SEO)</span>
                  <input name={`metaTitle_${locale}`} defaultValue={tr?.metaTitle} dir={dirOf(locale)} className={inputCls} />
                </label>
                <label className="block">
                  <span className={labelCls}>Meta description (SEO)</span>
                  <input name={`metaDescription_${locale}`} defaultValue={tr?.metaDescription} dir={dirOf(locale)} className={inputCls} />
                </label>
              </div>
            </div>
          );
          return locale === 'en' ? (
            <div key={locale}>
              <p className="text-sm font-medium text-heading">{LOCALE_LABEL[locale]}</p>
              {body}
            </div>
          ) : (
            <details key={locale} className="border-t border-line pt-3">
              <summary className="text-sm font-medium text-heading cursor-pointer">{LOCALE_LABEL[locale]}</summary>
              {body}
            </details>
          );
        })}
      </section>

      <ServiceMediaUploader
        initialKey={initial?.mediaKey}
        initialType={initial?.mediaType}
        initialUrl={initial?.mediaUrl ?? null}
        onBusyChange={setBusy}
      />

      <section className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className={labelCls}>Slug (leave blank to auto-generate)</span>
          <input name="slug" defaultValue={initial?.slug} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Sort order</span>
          <input name="sortOrder" type="number" defaultValue={initial?.sortOrder ?? '0'} className={inputCls} />
        </label>
      </section>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="isPublished" defaultChecked={initial?.isPublished ?? true} /> Published
      </label>

      <div>
        <button
          disabled={isPending || busy}
          className="px-6 py-2.5 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white disabled:opacity-60"
        >
          {isPending ? 'Saving…' : busy ? 'Uploading…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
