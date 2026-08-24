'use client';

import { useActionState, useState } from 'react';
import { savePricingRule, type FormState } from '../../actions';
import { APPLY_PER, PRICING_BASES, PRICING_STAGES, QUANTITY_VAR } from '@/lib/configurator/types';
import type { TemplateDef } from '@/lib/configurator/types';

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

const STAGE_HINTS: Record<string, string> = {
  base: 'The starting cost.',
  adder: 'Added to the base.',
  multiplier: 'Scales the subtotal after adders.',
  margin: 'Markup on everything above.',
  discount: 'Comes off the marked-up price.',
};

export default function PricingRuleForm({
  templateId,
  template,
}: {
  templateId: string;
  template: TemplateDef;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(savePricingRule, {});
  const [basis, setBasis] = useState('per_quantity');
  const [stage, setStage] = useState('adder');

  // Everything a per-quantity rule can multiply: derived quantities, numeric
  // option groups, and the reserved line-quantity variable that makes tier
  // pricing expressible at all.
  const quantities = [
    QUANTITY_VAR,
    ...template.derivedQuantities.map((q) => q.code),
    ...template.options.filter((o) => o.inputKind === 'number').map((o) => o.groupCode),
  ];

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="templateId" value={templateId} />
      <h3 className="font-medium text-heading">New pricing rule</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls} htmlFor="pr-code">
            Code
          </label>
          <input id="pr-code" name="code" required className={inputCls} placeholder="material_oak" />
        </div>
        <div>
          <label className={labelCls} htmlFor="pr-stage">
            Stage
          </label>
          <select
            id="pr-stage"
            name="stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className={inputCls}
          >
            {PRICING_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className="text-muted text-xs mt-1">{STAGE_HINTS[stage]}</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="pr-priority">
            Priority
          </label>
          <input
            id="pr-priority"
            name="priority"
            type="number"
            defaultValue={100}
            className={inputCls}
          />
          <p className="text-muted text-xs mt-1">Only breaks ties within a stage.</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="pr-basis">
            Basis
          </label>
          <select
            id="pr-basis"
            name="basis"
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
            className={inputCls}
          >
            {PRICING_BASES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {basis === 'flat' ? (
          <div>
            <label className={labelCls} htmlFor="pr-amount">
              Amount
            </label>
            <input id="pr-amount" name="amount" type="number" step="0.01" className={inputCls} />
          </div>
        ) : (
          <div>
            <label className={labelCls} htmlFor="pr-rate">
              {basis === 'percent' ? 'Percentage' : 'Rate'}
            </label>
            <input id="pr-rate" name="rate" type="number" step="0.0001" className={inputCls} />
            {basis === 'percent' && (
              <p className="text-muted text-xs mt-1">
                Signed: a discount is negative. Applies to the subtotal at the end of the previous
                stage.
              </p>
            )}
          </div>
        )}

        {basis === 'per_quantity' && (
          <div>
            <label className={labelCls} htmlFor="pr-qty">
              Multiplied by
            </label>
            <select id="pr-qty" name="quantityCode" className={inputCls}>
              {quantities.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        )}

        {basis !== 'percent' && (
          <>
            <div>
              <label className={labelCls} htmlFor="pr-currency">
                Currency
              </label>
              <input
                id="pr-currency"
                name="currency"
                maxLength={3}
                defaultValue={template.currency}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="pr-per">
                Charged per
              </label>
              <select id="pr-per" name="applyPer" defaultValue="unit" className={inputCls}>
                {APPLY_PER.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <p className="text-muted text-xs mt-1">
                A one-off setup fee is per <em>line</em>, so twelve doors are charged once.
              </p>
            </div>
          </>
        )}
      </div>

      <div>
        <label className={labelCls} htmlFor="pr-condition">
          Fires when (JSON condition)
        </label>
        <input
          id="pr-condition"
          name="condition"
          className={`${inputCls} font-mono`}
          placeholder={'{"group": "__qty", "op": ">=", "value": 50}'}
        />
        <p className="text-muted text-xs mt-1">
          Blank means always. <code>{QUANTITY_VAR}</code> is the line quantity — that is how a
          volume tier is written.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="pr-note">
            Note
          </label>
          <input id="pr-note" name="note" className={inputCls} />
        </div>
        <label className="flex items-end gap-2 text-sm text-ink pb-2">
          <input type="checkbox" name="isActive" defaultChecked /> Active
        </label>
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
        {pending ? 'Saving…' : 'Add rule'}
      </button>
    </form>
  );
}
