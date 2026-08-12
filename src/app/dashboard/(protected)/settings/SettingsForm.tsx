'use client';

import { useActionState, useState } from 'react';
import type { SettingsForm as SettingsData } from '@/lib/settingsAdmin';
import type { FormState } from './actions';

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';
const rmCls = 'px-2 text-red-300 shrink-0';
const addCls = 'text-sm text-accent hover:underline';

type ServerAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export default function SettingsForm({
  action,
  initial,
  saved,
}: {
  action: ServerAction;
  initial: SettingsData;
  saved?: boolean;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, {});

  const [phones, setPhones] = useState(initial.phones.length ? initial.phones : [{ number: '', label: '' }]);
  const [social, setSocial] = useState(initial.social.length ? initial.social : [{ platform: '', url: '' }]);
  const [emails, setEmails] = useState(initial.notifyEmails.length ? initial.notifyEmails : ['']);

  return (
    <form action={formAction} className="max-w-3xl space-y-10">
      {saved && !state.error && (
        <p className="px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/40 text-green-200 text-sm">
          Settings saved.
        </p>
      )}
      {state.error && (
        <p className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-200 text-sm">
          {state.error}
        </p>
      )}

      {/* Contact */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-heading">Contact</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className={labelCls}>Public email</span>
            <input name="email" type="email" defaultValue={initial.email} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>WhatsApp (digits only, with country code)</span>
            <input name="whatsapp" defaultValue={initial.whatsapp} placeholder="971544666066" className={inputCls} />
          </label>
        </div>

        <div>
          <span className={labelCls}>Phone numbers</span>
          <div className="space-y-2">
            {phones.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={p.number}
                  onChange={(e) => setPhones((prev) => prev.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))}
                  placeholder="+971 54 4666066"
                  className={inputCls}
                />
                <input
                  value={p.label}
                  onChange={(e) => setPhones((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  placeholder="label (primary / landline)"
                  className={inputCls}
                />
                <button type="button" onClick={() => setPhones((prev) => prev.filter((_, j) => j !== i))} className={rmCls}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setPhones((prev) => [...prev, { number: '', label: '' }])} className={`${addCls} mt-2`}>
            + Add phone
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className={labelCls}>Map latitude</span>
            <input name="geoLat" type="number" step="any" defaultValue={initial.geo?.lat ?? ''} placeholder="25.1286" className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Map longitude</span>
            <input name="geoLng" type="number" step="any" defaultValue={initial.geo?.lng ?? ''} placeholder="55.4192" className={inputCls} />
          </label>
        </div>
      </section>

      {/* Social */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-heading">Social links</h2>
        <div className="space-y-2">
          {social.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={s.platform}
                onChange={(e) => setSocial((prev) => prev.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x)))}
                placeholder="instagram"
                className="w-40 shrink-0 px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong"
              />
              <input
                value={s.url}
                onChange={(e) => setSocial((prev) => prev.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                placeholder="https://…"
                className={inputCls}
              />
              <button type="button" onClick={() => setSocial((prev) => prev.filter((_, j) => j !== i))} className={rmCls}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setSocial((prev) => [...prev, { platform: '', url: '' }])} className={addCls}>
          + Add link
        </button>
      </section>

      {/* Lead notifications */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-heading">New-lead notifications</h2>
        <p className="text-muted text-xs">Email addresses that receive a message when the contact form is submitted.</p>
        <div className="space-y-2">
          {emails.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={e}
                onChange={(ev) => setEmails((prev) => prev.map((x, j) => (j === i ? ev.target.value : x)))}
                placeholder="name@attractivehome.ae"
                className={inputCls}
              />
              <button type="button" onClick={() => setEmails((prev) => prev.filter((_, j) => j !== i))} className={rmCls}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setEmails((prev) => [...prev, ''])} className={addCls}>
          + Add recipient
        </button>
      </section>

      {/* Tracking & SEO */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-heading">Tracking &amp; SEO</h2>
        <p className="text-muted text-xs">
          Leave a field blank to disable that tag. GA4 and Meta Pixel are best configured inside the Tag
          Manager container rather than added separately.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className={labelCls}>Google Tag Manager id</span>
            <input name="gtmId" defaultValue={initial.gtmId} placeholder="GTM-XXXXXXX" className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>GA4 measurement id (only if not using GTM)</span>
            <input name="ga4Id" defaultValue={initial.ga4Id} placeholder="G-XXXXXXXXXX" className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Meta Pixel id (only if not managed in GTM)</span>
            <input name="metaPixelId" defaultValue={initial.metaPixelId} placeholder="1234567890" className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Google Search Console token</span>
            <input name="googleVerification" defaultValue={initial.googleVerification} placeholder="google-site-verification value" className={inputCls} />
          </label>
        </div>
      </section>

      {/* Serialised lists */}
      <input type="hidden" name="phonesJson" value={JSON.stringify(phones.filter((p) => p.number.trim()))} />
      <input type="hidden" name="socialJson" value={JSON.stringify(social.filter((s) => s.platform.trim() && s.url.trim()))} />
      <input type="hidden" name="notifyJson" value={JSON.stringify(emails.map((e) => e.trim()).filter(Boolean))} />

      <button
        disabled={isPending}
        className="px-6 py-2.5 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white disabled:opacity-60"
      >
        {isPending ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
}
