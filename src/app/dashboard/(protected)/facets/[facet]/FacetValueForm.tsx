'use client';

import UnsavedChangesGuard from '../../UnsavedChangesGuard';

import { useActionState } from 'react';
import { LOCALES, dirOf, type Locale } from '@/i18n/config';
import type { FacetValueEdit } from '@/lib/facetsAdmin';
import type { FacetFormState } from './actions';

const LOCALE_LABEL: Record<Locale, string> = { en: 'English', ar: 'Arabic', fr: 'French', ru: 'Russian' };
const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

type ServerAction = (prev: FacetFormState, formData: FormData) => Promise<FacetFormState>;

export default function FacetValueForm({
  action,
  initial,
  hasHex,
  submitLabel,
}: {
  action: ServerAction;
  initial?: FacetValueEdit;
  hasHex: boolean;
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState<FacetFormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4 max-w-xl">
      <UnsavedChangesGuard />
      {state.error && (
        <p className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-200 text-sm">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelCls}>Code <span className="text-accent">*</span></span>
          <input name="code" defaultValue={initial?.code} required className={inputCls} placeholder="e.g. Porcelain" />
        </label>
        <label className="block">
          <span className={labelCls}>Sort order</span>
          <input name="sortOrder" type="number" defaultValue={initial?.sortOrder ?? '0'} className={inputCls} />
        </label>
      </div>

      {hasHex && (
        <label className="block">
          <span className={labelCls}>Hex colour (for the swatch)</span>
          <input name="hex" type="text" defaultValue={initial?.hex} placeholder="#aabbcc" className={inputCls} />
        </label>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {LOCALES.map((l) => (
          <label key={l} className="block">
            <span className={labelCls}>
              {LOCALE_LABEL[l]} name {l === 'en' && <span className="text-accent">*</span>}
            </span>
            <input
              name={`name_${l}`}
              defaultValue={initial?.names[l]}
              required={l === 'en'}
              dir={dirOf(l)}
              className={inputCls}
            />
          </label>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} /> Active (shown as a filter)
      </label>

      <button
        disabled={isPending}
        className="px-6 py-2.5 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white disabled:opacity-60"
      >
        {isPending ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
