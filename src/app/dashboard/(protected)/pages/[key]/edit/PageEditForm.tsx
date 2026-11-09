'use client';

import { useActionState, useState } from 'react';
import { LOCALES, dirOf, type Locale } from '@/i18n/config';
import type { PageEditData } from '@/lib/sitePagesAdmin';
import type { FormState } from '../../actions';
import UnsavedChangesGuard from '../../../UnsavedChangesGuard';

const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
  fr: 'Français',
  ru: 'Русский',
};

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';
const hintCls = 'mt-1 text-xs text-muted';

type ServerAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export default function PageEditForm({
  action,
  initial,
  saved,
}: {
  action: ServerAction;
  initial: PageEditData;
  saved: boolean;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, {});
  const [tab, setTab] = useState<Locale>('en');

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      <UnsavedChangesGuard />

      {saved && !state.error && (
        <p className="rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-200">
          Saved. The public site has been updated.
        </p>
      )}
      {state.error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {state.error}
        </p>
      )}

      {/* Language tabs — all panels stay mounted so one Save submits every language. */}
      <div role="tablist" aria-label="Language" className="flex flex-wrap gap-2 border-b border-line">
        {LOCALES.map((loc) => (
          <button
            key={loc}
            type="button"
            role="tab"
            aria-selected={tab === loc}
            onClick={() => setTab(loc)}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm transition-colors ${
              tab === loc
                ? 'border-accent text-heading font-medium'
                : 'border-transparent text-muted hover:text-heading'
            }`}
          >
            {LOCALE_LABEL[loc]}
          </button>
        ))}
      </div>

      {LOCALES.map((loc) => (
        <div key={loc} hidden={tab !== loc} dir={dirOf(loc)} className="space-y-5">
          {initial.navEligible && (
            <label className="block">
              <span className={labelCls}>Menu label</span>
              <input
                name={`nav_${loc}`}
                defaultValue={initial.translations[loc]?.navLabel ?? ''}
                placeholder={loc === 'en' ? 'The name shown in the top menu' : 'Leave blank to fall back to English'}
                maxLength={80}
                className={inputCls}
              />
              <span className={hintCls}>The name shown in the navigation bar{initial.footerEligible ? '' : ''}.</span>
            </label>
          )}

          <label className="block">
            <span className={labelCls}>SEO title</span>
            <input
              name={`metaTitle_${loc}`}
              defaultValue={initial.translations[loc]?.metaTitle ?? ''}
              placeholder="Shown in the browser tab and search results"
              maxLength={160}
              className={inputCls}
            />
            <span className={hintCls}>Leave blank to use the page’s default title.</span>
          </label>

          <label className="block">
            <span className={labelCls}>SEO description</span>
            <textarea
              name={`metaDescription_${loc}`}
              defaultValue={initial.translations[loc]?.metaDescription ?? ''}
              rows={2}
              placeholder="A short summary for search engines and link previews"
              maxLength={320}
              className={inputCls}
            />
          </label>

          {initial.contentBlocks.length > 0 && (
            <div className="space-y-4 border-t border-line pt-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Page text</h3>
              {initial.contentBlocks.map((block) => (
                <label key={block.id} className="block">
                  <span className={labelCls}>{block.notes || block.key}</span>
                  <textarea
                    name={`content:${block.id}:${loc}`}
                    data-block-key={block.key}
                    defaultValue={block.bodies[loc] ?? ''}
                    rows={3}
                    placeholder={loc === 'en' ? 'Shown when a language has no translation' : 'Leave blank to fall back to English'}
                    className={inputCls}
                  />
                  <span className={hintCls}>
                    <code className="font-mono">{block.key}</code>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      <button
        disabled={isPending}
        className="rounded-lg bg-brand-brown px-6 py-2.5 text-white hover:bg-brand-brown-hover disabled:opacity-60"
      >
        {isPending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
