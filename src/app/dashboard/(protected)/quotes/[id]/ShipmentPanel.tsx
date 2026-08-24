'use client';

import { useActionState, useState } from 'react';
import { updateShipment, type FormState } from '../actions';
import type { FreightMode } from '@/lib/landed/types';

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

const MODE_LABELS: Record<string, string> = {
  sea_lcl: 'Sea LCL (per revenue ton)',
  sea_fcl: 'Sea FCL (per container)',
  air: 'Air (per chargeable kg)',
};

// Primitives only — a Prisma Decimal cannot cross into a client component.
type ShipmentLike = {
  mode: string;
  originPort: string;
  destinationPort: string;
  incoterm: string;
  containerType: string | null;
  containerCount: number | null;
  expectedStorageDays: number;
  isManualOverride: boolean;
  volumeCbm: string | null;
  grossWeightKg: string | null;
  notes: string | null;
};

export default function ShipmentPanel({
  quoteId,
  shipment,
  canWrite,
  rolledVolumeCbm,
  rolledWeightKg,
  modes,
}: {
  quoteId: string;
  shipment: ShipmentLike | null;
  canWrite: boolean;
  rolledVolumeCbm: number;
  rolledWeightKg: number;
  modes: { mode: FreightMode; expected: number | null; currency: string; note?: string }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateShipment, {});
  const [mode, setMode] = useState(shipment?.mode ?? 'sea_lcl');
  const [override, setOverride] = useState(shipment?.isManualOverride ?? false);

  if (!shipment) return <p className="text-muted text-sm">This quote has no shipment.</p>;

  return (
    <div className="space-y-4">
      {/* Modes are compared SIDE BY SIDE and never blended into one band: the
          maximum of an air quote plus the maximum of sea port storage describes
          a shipment that does not exist. */}
      <div className="grid grid-cols-3 gap-3" data-testid="freight-modes">
        {modes.map((row) => (
          <div
            key={row.mode}
            className={`border rounded-lg p-3 ${
              row.mode === mode ? 'border-accent bg-accent-2/10' : 'border-line bg-surface/40'
            }`}
          >
            <div className="text-xs text-muted">{MODE_LABELS[row.mode] ?? row.mode}</div>
            <div className="text-lg text-heading" dir="ltr">
              {row.expected === null
                ? '—'
                : `${row.currency} ${row.expected.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            </div>
            {row.note && <div className="text-xs text-muted">{row.note}</div>}
          </div>
        ))}
      </div>

      <form action={formAction} className="space-y-4 border border-line rounded-lg p-4">
        <input type="hidden" name="quoteId" value={quoteId} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className={labelCls} htmlFor="s-mode">
              Mode
            </label>
            <select
              id="s-mode"
              name="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={!canWrite}
              className={inputCls}
            >
              {Object.entries(MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="s-origin">
              Origin port
            </label>
            <input
              id="s-origin"
              name="originPort"
              defaultValue={shipment.originPort}
              disabled={!canWrite}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="s-dest">
              Destination port
            </label>
            <input
              id="s-dest"
              name="destinationPort"
              defaultValue={shipment.destinationPort}
              disabled={!canWrite}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="s-incoterm">
              Incoterm
            </label>
            <input
              id="s-incoterm"
              name="incoterm"
              defaultValue={shipment.incoterm}
              disabled={!canWrite}
              className={inputCls}
            />
            {/* Honest label rather than half-wired logic: a real incoterm moves
                whole cost blocks between buyer and seller, and the calculator
                assumes FOB China. */}
            <p className="text-muted text-xs mt-1">Informational only — FOB China is assumed.</p>
          </div>
        </div>

        {mode === 'sea_fcl' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="s-ctype">
                Container type
              </label>
              <select
                id="s-ctype"
                name="containerType"
                defaultValue={shipment.containerType ?? '40HQ'}
                disabled={!canWrite}
                className={inputCls}
              >
                <option value="20GP">20GP</option>
                <option value="40GP">40GP</option>
                <option value="40HQ">40HQ</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="s-ccount">
                Containers
              </label>
              <input
                id="s-ccount"
                name="containerCount"
                type="number"
                min="1"
                defaultValue={shipment.containerCount ?? 1}
                disabled={!canWrite}
                className={inputCls}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls} htmlFor="s-volume">
              Volume (CBM)
            </label>
            <input
              id="s-volume"
              name="volumeCbm"
              type="number"
              step="0.001"
              defaultValue={shipment.volumeCbm ?? rolledVolumeCbm.toFixed(3)}
              disabled={!canWrite || !override}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="s-weight">
              Gross weight (kg)
            </label>
            <input
              id="s-weight"
              name="grossWeightKg"
              type="number"
              step="0.001"
              defaultValue={shipment.grossWeightKg ?? rolledWeightKg.toFixed(3)}
              disabled={!canWrite || !override}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="s-storage">
              Expected storage days
            </label>
            <input
              id="s-storage"
              name="expectedStorageDays"
              type="number"
              min="0"
              defaultValue={shipment.expectedStorageDays}
              disabled={!canWrite}
              className={inputCls}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="isManualOverride"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
            disabled={!canWrite}
          />
          {/* The flag is what tells a later reader whether a figure is a
              deliberate packing judgement or just stale. */}
          Override the volume and weight rolled up from the items
        </label>
        {!override && (
          <p className="text-muted text-xs">
            Rolled up from items: {rolledVolumeCbm.toFixed(3)} CBM · {rolledWeightKg.toFixed(1)} kg.
            Chargeable quantity is derived per mode at costing time.
          </p>
        )}

        <div>
          <label className={labelCls} htmlFor="s-notes">
            Shipment notes
          </label>
          <input
            id="s-notes"
            name="shipmentNotes"
            defaultValue={shipment.notes ?? ''}
            disabled={!canWrite}
            className={inputCls}
          />
        </div>

        {state.error && (
          <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3">
            {state.error}
          </p>
        )}
        {state.ok && <p className="text-sm text-accent">Shipment saved and re-costed.</p>}

        {canWrite && (
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save and re-cost'}
          </button>
        )}
      </form>
    </div>
  );
}
