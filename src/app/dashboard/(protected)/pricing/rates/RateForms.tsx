'use client';

import { useActionState } from 'react';
import {
  saveFreightRate,
  saveHsCode,
  savePortStorageRate,
  type FormState,
} from '../actions';
import { CONTAINER_TYPES, FREIGHT_MODES } from '@/lib/landed/types';

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

function Message({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3">
        {state.error}
      </p>
    );
  }
  if (state.ok) return <p className="text-sm text-accent">Saved.</p>;
  return null;
}

export default function RateForms() {
  const [hsState, hsAction, hsPending] = useActionState<FormState, FormData>(saveHsCode, {});
  const [freightState, freightAction, freightPending] = useActionState<FormState, FormData>(
    saveFreightRate,
    {},
  );
  const [storageState, storageAction, storagePending] = useActionState<FormState, FormData>(
    savePortStorageRate,
    {},
  );

  return (
    <div className="space-y-6">
      <section className="border border-line rounded-lg p-4 bg-surface/40">
        <h2 className="text-lg font-semibold text-heading mb-3">Add an HS code</h2>
        <form action={hsAction} className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={labelCls} htmlFor="hs-code">
                Code
              </label>
              <input id="hs-code" name="code" required className={inputCls} placeholder="4418.20" />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls} htmlFor="hs-desc">
                Description
              </label>
              <input id="hs-desc" name="description" className={inputCls} />
            </div>
            <label className="flex items-end gap-2 text-sm text-ink pb-2">
              <input type="checkbox" name="isActive" defaultChecked /> Active
            </label>
            <div>
              <label className={labelCls} htmlFor="hs-duty">
                Duty %
              </label>
              <input
                id="hs-duty"
                name="dutyPercent"
                type="number"
                step="0.001"
                defaultValue={5}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="hs-vat">
                VAT %
              </label>
              <input
                id="hs-vat"
                name="vatPercent"
                type="number"
                step="0.001"
                defaultValue={5}
                className={inputCls}
              />
            </div>
          </div>
          <Message state={hsState} />
          <button
            disabled={hsPending}
            className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink disabled:opacity-50"
          >
            {hsPending ? 'Saving…' : 'Add HS code'}
          </button>
        </form>
      </section>

      <section className="border border-line rounded-lg p-4 bg-surface/40">
        <h2 className="text-lg font-semibold text-heading mb-3">Add a freight rate</h2>
        <form action={freightAction} className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={labelCls} htmlFor="fr-mode">
                Mode
              </label>
              <select id="fr-mode" name="mode" defaultValue="sea_lcl" className={inputCls}>
                {FREIGHT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="fr-unit">
                Unit
              </label>
              <select id="fr-unit" name="unit" defaultValue="wm" className={inputCls}>
                <option value="wm">wm — revenue ton (LCL)</option>
                <option value="container">container (FCL)</option>
                <option value="kg">kg — chargeable (air)</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="fr-origin">
                Origin port
              </label>
              <input id="fr-origin" name="originPort" defaultValue="CNSHA" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="fr-dest">
                Destination port
              </label>
              <input
                id="fr-dest"
                name="destinationPort"
                defaultValue="AEJEA"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="fr-box">
                Container type
              </label>
              <select id="fr-box" name="containerType" defaultValue="" className={inputCls}>
                <option value="">none (LCL / air)</option>
                {CONTAINER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="fr-rate">
                Rate
              </label>
              <input
                id="fr-rate"
                name="rate"
                type="number"
                step="0.01"
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="fr-low">
                Low
              </label>
              <input id="fr-low" name="rateLow" type="number" step="0.01" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="fr-high">
                High
              </label>
              <input id="fr-high" name="rateHigh" type="number" step="0.01" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="fr-min">
                Minimum charge
              </label>
              <input id="fr-min" name="minCharge" type="number" step="0.01" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="fr-currency">
                Currency
              </label>
              <input
                id="fr-currency"
                name="currency"
                maxLength={3}
                defaultValue="USD"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="fr-divisor">
                Volumetric divisor
              </label>
              <input
                id="fr-divisor"
                name="volumetricDivisor"
                type="number"
                placeholder="6000 (air only)"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="fr-packing">
                Packaging factor
              </label>
              <input
                id="fr-packing"
                name="packagingFactor"
                type="number"
                step="0.01"
                defaultValue={1.1}
                className={inputCls}
              />
              {/* The configurator derives the BARE product weight; carriers bill
                  the crated item, typically 8-15% more in weight and volume. */}
              <p className="text-muted text-xs mt-1">Crating and pallets on top of product weight.</p>
            </div>
            <div>
              <label className={labelCls} htmlFor="fr-transit">
                Transit days
              </label>
              <input id="fr-transit" name="transitDays" type="number" className={inputCls} />
            </div>
            <label className="flex items-end gap-2 text-sm text-ink pb-2">
              <input type="checkbox" name="isActive" defaultChecked /> Active
            </label>
          </div>
          <Message state={freightState} />
          <button
            disabled={freightPending}
            className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink disabled:opacity-50"
          >
            {freightPending ? 'Saving…' : 'Add freight rate'}
          </button>
        </form>
      </section>

      <section className="border border-line rounded-lg p-4 bg-surface/40">
        <h2 className="text-lg font-semibold text-heading mb-3">Add a port storage rate</h2>
        <form action={storageAction} className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className={labelCls} htmlFor="ps-port">
                Port
              </label>
              <input id="ps-port" name="port" defaultValue="AEJEA" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="ps-box">
                Container type
              </label>
              <select id="ps-box" name="containerType" defaultValue="" className={inputCls}>
                <option value="">any / LCL</option>
                {CONTAINER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="ps-free">
                Free days
              </label>
              <input
                id="ps-free"
                name="freeDays"
                type="number"
                defaultValue={5}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ps-rate">
                Per day
              </label>
              <input
                id="ps-rate"
                name="perDayRate"
                type="number"
                step="0.01"
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ps-currency">
                Currency
              </label>
              <input
                id="ps-currency"
                name="currency"
                maxLength={3}
                defaultValue="AED"
                className={inputCls}
              />
            </div>
            <label className="flex items-end gap-2 text-sm text-ink pb-2">
              <input type="checkbox" name="isActive" defaultChecked /> Active
            </label>
          </div>
          <Message state={storageState} />
          <button
            disabled={storagePending}
            className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink disabled:opacity-50"
          >
            {storagePending ? 'Saving…' : 'Add storage rate'}
          </button>
        </form>
      </section>
    </div>
  );
}
