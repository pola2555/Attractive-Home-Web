'use client';

import { useActionState, useState } from 'react';
import { saveUpgrade, type FormState } from '../../actions';

// Step 5 of the editor walkthrough, and the form that removes the last reason
// anyone had to type JSON.
//
// "Only available on 45 mm and 55 mm" is authored as a question plus a set of
// values, and the action assembles `{group, in: [...]}` from that. The editor
// never sees a condition; they see a sentence.

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

export type UpgradeFormOption = {
  groupCode: string;
  name: string;
  values: { code: string; name: string }[];
};

export default function UpgradeForm({
  templateId,
  variants,
  options,
  derivedCodes,
}: {
  templateId: string;
  variants: { id: string; code: string; name: string }[];
  options: UpgradeFormOption[];
  derivedCodes: string[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveUpgrade, {});
  const [unit, setUnit] = useState('flat');
  const [whenGroup, setWhenGroup] = useState('');

  const whenValues = options.find((o) => o.groupCode === whenGroup)?.values ?? [];

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="templateId" value={templateId} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls} htmlFor="u-code">
            Code
          </label>
          <input
            id="u-code"
            name="code"
            className={inputCls}
            placeholder="alu_same_color"
            required
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls} htmlFor="u-label">
            Name
          </label>
          <input
            id="u-label"
            name="label"
            className={inputCls}
            placeholder="All same colour"
            required
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="u-section">
            Section
          </label>
          <input id="u-section" name="section" className={inputCls} placeholder="Upgrade Items" />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="u-detail">
          Details
        </label>
        <input
          id="u-detail"
          name="detail"
          className={inputCls}
          placeholder="Frame, leaf, edge banding, lock, hinges ×3"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls} htmlFor="u-variant">
            Applies to
          </label>
          <select id="u-variant" name="variantId" className={inputCls}>
            <option value="">Every variant</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="u-amount">
            Amount
          </label>
          <input
            id="u-amount"
            name="amount"
            type="number"
            step="0.01"
            className={inputCls}
            placeholder="30.00"
            required
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="u-unit">
            Charged
          </label>
          <select
            id="u-unit"
            name="unit"
            className={inputCls}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option value="flat">once, flat</option>
            <option value="per_unit">per unit</option>
            <option value="per_piece">per piece</option>
            <option value="per_set">per set</option>
            <option value="per_sqm">per m²</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="u-kind">
            Kind
          </label>
          <select id="u-kind" name="kind" className={inputCls}>
            <option value="upgrade">Upgrade</option>
            <option value="accessory">Accessory</option>
          </select>
        </div>
      </div>

      {unit === 'per_sqm' && (
        <div>
          <label className={labelCls} htmlFor="u-qty">
            Multiplied by
          </label>
          <select id="u-qty" name="quantityCode" className={inputCls}>
            {derivedCodes.length === 0 && <option value="">No calculated quantities yet</option>}
            {derivedCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <p className="text-muted text-xs mt-1">
            A per-m² price needs an area to multiply. Add a calculated quantity first if the list is
            empty — charging zero would be worse than refusing.
          </p>
        </div>
      )}

      {(unit === 'per_unit' || unit === 'per_piece' || unit === 'per_set') && (
        <div className="max-w-[200px]">
          <label className={labelCls} htmlFor="u-qty-default">
            Default quantity
          </label>
          <input
            id="u-qty-default"
            name="defaultQty"
            type="number"
            min={1}
            defaultValue={1}
            className={inputCls}
          />
        </div>
      )}

      {/* The condition builder. Reads as a sentence, stores as JSON. */}
      <div className="border border-line rounded-lg p-3 bg-surface/40 space-y-3">
        <p className="text-xs uppercase tracking-wider text-muted">Availability</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="u-when-group">
              Only offered when
            </label>
            <select
              id="u-when-group"
              name="whenGroup"
              className={inputCls}
              value={whenGroup}
              onChange={(e) => setWhenGroup(e.target.value)}
            >
              <option value="">Always offered</option>
              {options.map((o) => (
                <option key={o.groupCode} value={o.groupCode}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          {whenGroup && (
            <div>
              <span className={labelCls}>is one of</span>
              <div className="flex flex-wrap gap-2">
                {whenValues.map((v) => (
                  <label
                    key={v.code}
                    className="px-3 py-1 rounded-full text-sm border border-line text-ink cursor-pointer hover:border-accent/60"
                  >
                    <input type="checkbox" name="whenValues" value={v.code} className="me-1.5" />
                    {v.name}
                  </label>
                ))}
                {whenValues.length === 0 && (
                  <span className="text-muted text-xs">That question has no fixed answers.</span>
                )}
              </div>
            </div>
          )}
        </div>
        {whenGroup && (
          <div>
            <label className={labelCls} htmlFor="u-note">
              Why it is unavailable otherwise
            </label>
            <input
              id="u-note"
              name="unavailableNote"
              className={inputCls}
              placeholder="Only available on 45 mm and 55 mm"
            />
            <p className="text-muted text-xs mt-1">
              Shown greyed out beside the upgrade. Hiding it instead sends whoever is on the phone
              hunting for something the customer just named.
            </p>
          </div>
        )}
      </div>

      {state.error && (
        <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-sm text-accent">Saved.</p>}

      <button
        disabled={pending}
        className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save upgrade'}
      </button>
    </form>
  );
}
