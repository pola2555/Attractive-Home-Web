'use client';

import UnsavedChangesGuard from '../../UnsavedChangesGuard';

import { useActionState, useState } from 'react';
import { LOCALES, dirOf, type Locale } from '@/i18n/config';
import type { ProjectFormInitial } from '@/lib/portfolioAdmin';
import type { FormState } from '../actions';
import CoverUploader from './CoverUploader';
import ProjectContentManager from './ProjectContentManager';

const LOCALE_LABEL: Record<Locale, string> = { en: 'English', ar: 'Arabic', fr: 'French', ru: 'Russian' };
const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

type ServerAction = (prev: FormState, formData: FormData) => Promise<FormState>;

function Field({
  name,
  label,
  defaultValue,
  type = 'text',
  required,
  placeholder,
  dir,
  step,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  dir?: 'ltr' | 'rtl';
  step?: string;
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label} {required && <span className="text-accent">*</span>}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        dir={dir}
        step={step}
        className={inputCls}
      />
    </label>
  );
}

export default function ProjectForm({
  action,
  categories,
  initial,
  submitLabel,
}: {
  action: ServerAction;
  categories: { id: string; title: string }[];
  initial?: ProjectFormInitial;
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, {});
  const [coverBusy, setCoverBusy] = useState(false);
  const [contentBusy, setContentBusy] = useState(false);
  const busy = coverBusy || contentBusy;

  const t = (locale: Locale) => initial?.translations[locale];

  return (
    <form action={formAction} className="max-w-4xl space-y-10">
      <UnsavedChangesGuard />
      {initial && <input type="hidden" name="expectedUpdatedAt" value={initial.updatedAt} />}
      {state.error && (
        <p className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-200 text-sm">
          {state.error}
        </p>
      )}

      {/* Translations */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-heading">Title &amp; copy</h2>
        {LOCALES.map((locale) => {
          const tr = t(locale);
          const body = (
            <div className="space-y-3 pt-3">
              <Field name={`title_${locale}`} label="Title" required={locale === 'en'} defaultValue={tr?.title} dir={dirOf(locale)} />
              <div className="grid grid-cols-2 gap-3">
                <Field name={`areaLabel_${locale}`} label="Area label" defaultValue={tr?.areaLabel} placeholder="500 m²" dir={dirOf(locale)} />
              </div>
              <Field name={`description_${locale}`} label="Description" defaultValue={tr?.description} dir={dirOf(locale)} />
              <div className="grid grid-cols-2 gap-3">
                <Field name={`metaTitle_${locale}`} label="Meta title (SEO)" defaultValue={tr?.metaTitle} dir={dirOf(locale)} />
                <Field name={`metaDescription_${locale}`} label="Meta description (SEO)" defaultValue={tr?.metaDescription} dir={dirOf(locale)} />
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

      {/* Details */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-heading">Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <label className="block">
            <span className={labelCls}>
              Category <span className="text-accent">*</span>
            </span>
            <select name="categoryId" defaultValue={initial?.categoryId ?? ''} required className={inputCls}>
              <option value="" disabled>
                — select —
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <Field name="sortOrder" label="Sort order" type="number" defaultValue={initial?.sortOrder} />
          <Field name="latitude" label="Latitude" type="number" step="any" defaultValue={initial?.latitude} placeholder="25.2048" />
          <Field name="longitude" label="Longitude" type="number" step="any" defaultValue={initial?.longitude} placeholder="55.2708" />
        </div>
        <Field name="slug" label="Slug (leave blank to auto-generate from the English title)" defaultValue={initial?.slug} />
        <label className="flex items-center gap-2 text-sm text-ink pt-1">
          <input type="checkbox" name="isPublished" defaultChecked={initial?.isPublished ?? true} /> Published
        </label>
      </section>

      {/* Cover */}
      <CoverUploader
        initialKey={initial?.coverKey}
        initialType={initial?.coverType}
        initialUrl={initial?.coverUrl ?? null}
        onBusyChange={setCoverBusy}
      />

      {/* Sections + media */}
      <ProjectContentManager initialSections={initial?.sections} initialMedia={initial?.media} onBusyChange={setContentBusy} />

      <div className="flex items-center gap-4 pt-2">
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
