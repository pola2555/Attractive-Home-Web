'use client';

import { useActionState, useState } from 'react';
import {
  saveUpgradeTier,
  deleteUpgradeTier,
  saveUpgradeEffect,
  deleteUpgradeEffect,
  type FormState,
} from '../../actions';

// The two things an upgrade carries beyond a price: quantity tiers (a pamphlet
// is 30.00 for one, 15.00 each at 100) and reach-back effects (ticking one
// upgrade restricts, forces, or annotates another question). Both were
// expressible in the schema and the engine, and demonstrated by the seed, but
// had no way to be authored by hand until this.

type Tier = { id: string; minQty: number; unitAmount: number };
type Effect = {
  id: string;
  kind: string;
  groupName: string | null;
  valueCodes: string[];
  message: string | null;
};
type Target = { id: string; name: string; values: { code: string; name: string }[] };

const inputCls =
  'px-2 py-1.5 bg-surface text-ink rounded border border-line-strong text-sm focus:outline-none focus:ring-2 focus:ring-accent';

export default function UpgradeExtras({
  upgradeId,
  tiers,
  effects,
  targets,
}: {
  upgradeId: string;
  tiers: Tier[];
  effects: Effect[];
  targets: Target[];
}) {
  const [tierState, tierAction, tierPending] = useActionState<FormState, FormData>(saveUpgradeTier, {});
  const [effectState, effectAction, effectPending] = useActionState<FormState, FormData>(
    saveUpgradeEffect,
    {},
  );
  const [kind, setKind] = useState('restrict');
  const [targetId, setTargetId] = useState('');

  const targetValues = targets.find((t) => t.id === targetId)?.values ?? [];

  return (
    <div className="grid md:grid-cols-2 gap-4 pt-3">
      {/* Quantity tiers */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted">Quantity tiers</p>
        {tiers.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {tiers.map((tier) => (
              <li key={tier.id} className="flex items-center gap-2">
                <span className="text-ink tabular-nums" dir="ltr">
                  {tier.minQty}+ → {tier.unitAmount.toFixed(2)} ea
                </span>
                <form action={deleteUpgradeTier}>
                  <input type="hidden" name="id" value={tier.id} />
                  <button className="text-xs text-red-300 hover:underline">remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-xs">Flat per-unit price at every quantity.</p>
        )}
        <form action={tierAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="upgradeId" value={upgradeId} />
          <label className="text-xs text-muted">
            At qty
            <input name="minQty" type="number" min={1} className={`${inputCls} w-20 block`} required />
          </label>
          <label className="text-xs text-muted">
            each costs
            <input
              name="unitAmount"
              type="number"
              step="0.01"
              min={0}
              className={`${inputCls} w-24 block`}
              required
            />
          </label>
          <button
            disabled={tierPending}
            className="px-3 py-1.5 rounded border border-line-strong text-ink hover:border-accent text-sm disabled:opacity-50"
          >
            Add tier
          </button>
        </form>
        {tierState.error && <p className="text-xs text-red-300">{tierState.error}</p>}
      </div>

      {/* Reach-back effects */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted">Reaches back and…</p>
        {effects.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {effects.map((effect) => (
              <li key={effect.id} className="flex items-start gap-2">
                <span className="text-ink">
                  <b>{effect.kind}</b>
                  {effect.groupName ? ` ${effect.groupName}` : ''}
                  {effect.valueCodes.length ? ` → ${effect.valueCodes.join(', ')}` : ''}
                  {effect.message ? ` · “${effect.message}”` : ''}
                </span>
                <form action={deleteUpgradeEffect}>
                  <input type="hidden" name="id" value={effect.id} />
                  <button className="text-xs text-red-300 hover:underline">remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-xs">Changes nothing else.</p>
        )}
        <form action={effectAction} className="space-y-2">
          <input type="hidden" name="upgradeId" value={upgradeId} />
          <select
            name="kind"
            className={`${inputCls} w-full`}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="restrict">Restrict a question to some values</option>
            <option value="set">Force one value and lock a question</option>
            <option value="note">Just show a note</option>
          </select>
          {kind !== 'note' && (
            <>
              <select
                name="templateOptionId"
                className={`${inputCls} w-full`}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">Choose the question…</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {targetValues.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {targetValues.map((v) => (
                    <label
                      key={v.code}
                      className="px-2 py-0.5 rounded-full text-xs border border-line text-ink cursor-pointer hover:border-accent/60"
                    >
                      <input type="checkbox" name="valueCodes" value={v.code} className="me-1" />
                      {v.name}
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
          <input
            name="message"
            className={`${inputCls} w-full`}
            placeholder={kind === 'note' ? 'Message to show (required)' : 'Optional note'}
          />
          <button
            disabled={effectPending}
            className="px-3 py-1.5 rounded border border-line-strong text-ink hover:border-accent text-sm disabled:opacity-50"
          >
            Add effect
          </button>
        </form>
        {effectState.error && <p className="text-xs text-red-300">{effectState.error}</p>}
      </div>
    </div>
  );
}
