'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { addQuoteItem, type FormState } from '../actions';
import { cascadeSelection, resolveConfiguration } from '@/lib/configurator/resolve';
import { priceConfiguration } from '@/lib/configurator/price';
import type { Selection, TemplateDef } from '@/lib/configurator/types';

// The live configurator.
//
// The engine in src/lib/configurator/ is deliberately pure — no Prisma, no
// `server-only` — so the whole dependency tree evaluates HERE, in the browser,
// with no round-trip per click. What the server does on submit is re-run the
// exact same functions authoritatively: the price shown below is a preview, and
// `addQuoteItem` never trusts it.

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

export default function QuoteConfigurator({
  quoteId,
  templates,
  currencySymbol,
}: {
  quoteId: string;
  templates: TemplateDef[];
  currencySymbol: string;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [selection, setSelection] = useState<Selection>({});
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState('');
  const [state, formAction, pending] = useActionState<FormState, FormData>(addQuoteItem, {});

  const template = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const resolution = useMemo(
    () => (template ? resolveConfiguration(template, selection, quantity) : null),
    [template, selection, quantity],
  );

  const priced = useMemo(
    () => (template ? priceConfiguration(template, selection, quantity) : null),
    [template, selection, quantity],
  );

  // Every change cascades: choosing a material can invalidate a colour chosen
  // before it, and leaving the stale value selected would price something the
  // factory cannot build.
  function change(groupCode: string, next: Selection[string] | undefined) {
    if (!template) return;
    setSelection((prev) => {
      const draft: Selection = { ...prev };
      if (next === undefined) delete draft[groupCode];
      else draft[groupCode] = next;
      return cascadeSelection(template, draft, quantity);
    });
  }

  function pickTemplate(id: string) {
    setTemplateId(id);
    setSelection({});
  }

  if (templates.length === 0) {
    return (
      <p className="text-muted text-sm">
        No configuration templates yet. Create one under{' '}
        <Link href="/dashboard/pricing/templates" className="text-accent hover:underline">
          Pricing
        </Link>
        .
      </p>
    );
  }

  const blocking = resolution?.issues ?? [];
  const canAdd = !!resolution?.isComplete && !!priced && priced.issues.length === 0;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="selectionJson" value={JSON.stringify(selection)} />
      <input type="hidden" name="name" value={name || (template?.name ?? '')} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="cfg-template">
            Product template
          </label>
          <select
            id="cfg-template"
            className={inputCls}
            value={templateId}
            onChange={(e) => pickTemplate(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="cfg-name">
            Line name
          </label>
          <input
            id="cfg-name"
            className={inputCls}
            value={name}
            placeholder={template?.name ?? ''}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>

      {resolution?.options
        .filter((option) => option.isVisible)
        .map((option) => {
          const entry = selection[option.groupCode];

          if (option.inputKind === 'number') {
            return (
              <div key={option.groupCode}>
                <label className={labelCls} htmlFor={`cfg-${option.groupCode}`}>
                  {option.name}
                  {option.isRequired && <span className="text-accent"> *</span>}
                  {option.unit && <span className="text-muted"> ({option.unit})</span>}
                  {option.range && (
                    // The active range is itself conditional — it narrows when
                    // an earlier choice narrows it — so it is shown live.
                    <span className="text-muted text-xs">
                      {' '}
                      {option.range.min ?? '—'}–{option.range.max ?? '—'}
                    </span>
                  )}
                </label>
                <input
                  id={`cfg-${option.groupCode}`}
                  type="number"
                  className={inputCls}
                  value={entry?.numericValue ?? ''}
                  min={option.range?.min ?? undefined}
                  max={option.range?.max ?? undefined}
                  step={option.range?.step ?? undefined}
                  onChange={(e) =>
                    change(
                      option.groupCode,
                      e.target.value === ''
                        ? undefined
                        : {
                            groupCode: option.groupCode,
                            valueCodes: [],
                            numericValue: Number(e.target.value),
                          },
                    )
                  }
                />
              </div>
            );
          }

          if (option.inputKind === 'multi_select') {
            return (
              <div key={option.groupCode}>
                <span className={labelCls}>{option.name}</span>
                <div className="flex flex-wrap gap-2">
                  {option.values.map((value) => {
                    const checked = entry?.valueCodes.includes(value.code) ?? false;
                    const disabled = value.availability !== 'yes';
                    return (
                      <label
                        key={value.code}
                        className={`px-3 py-1 rounded-full text-sm border cursor-pointer ${
                          checked
                            ? 'border-accent text-heading bg-accent-2/10'
                            : 'border-line text-ink hover:border-accent/60'
                        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => {
                            const codes = new Set(entry?.valueCodes ?? []);
                            if (codes.has(value.code)) codes.delete(value.code);
                            else codes.add(value.code);
                            change(
                              option.groupCode,
                              codes.size
                                ? {
                                    groupCode: option.groupCode,
                                    valueCodes: [...codes],
                                    quantities: entry?.quantities,
                                    numericValue: null,
                                  }
                                : undefined,
                            );
                          }}
                        />
                        {value.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          }

          return (
            <div key={option.groupCode}>
              <label className={labelCls} htmlFor={`cfg-${option.groupCode}`}>
                {option.name}
                {option.isRequired && <span className="text-accent"> *</span>}
              </label>
              <select
                id={`cfg-${option.groupCode}`}
                className={inputCls}
                value={entry?.valueCodes[0] ?? ''}
                onChange={(e) => {
                  const value = option.values.find((v) => v.code === e.target.value);
                  change(
                    option.groupCode,
                    value
                      ? {
                          groupCode: option.groupCode,
                          valueCodes: [value.code],
                          numericValue:
                            template?.options
                              .find((o) => o.groupCode === option.groupCode)
                              ?.values.find((v) => v.code === value.code)?.numericValue ?? null,
                        }
                      : undefined,
                  );
                }}
              >
                <option value="">Choose…</option>
                {option.values.map((value) => (
                  <option
                    key={value.code}
                    value={value.code}
                    // `pending` means an earlier choice has to be made first, so
                    // it renders disabled rather than vanishing — otherwise the
                    // list looks broken before the first click.
                    disabled={value.availability !== 'yes'}
                  >
                    {value.name}
                    {value.availability === 'pending' ? ' — choose earlier options first' : ''}
                    {value.availability === 'no' ? ' — not available' : ''}
                  </option>
                ))}
              </select>
              {option.helpText && <p className="text-muted text-xs mt-1">{option.helpText}</p>}
            </div>
          );
        })}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="cfg-qty">
            Quantity
          </label>
          <input
            id="cfg-qty"
            name="quantity"
            type="number"
            min={1}
            step={1}
            className={inputCls}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
      </div>

      {resolution && Object.keys(resolution.derived).length > 0 && (
        <div className="text-sm text-muted border border-line rounded-lg p-3 bg-surface/40">
          {Object.entries(resolution.derived).map(([code, value]) => (
            <span key={code} className="me-4">
              {code}:{' '}
              <span className={value === null ? 'text-red-300' : 'text-ink'}>
                {value === null ? 'needs review' : value.toFixed(3)}
              </span>
            </span>
          ))}
        </div>
      )}

      {blocking.length > 0 && (
        <ul className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3 space-y-1">
          {blocking.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
      )}

      {priced && priced.issues.length > 0 && (
        <ul className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3 space-y-1">
          {priced.issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}

      {priced && canAdd && (
        <div className="border border-line rounded-lg p-3 bg-surface/40 text-sm">
          <table className="w-full">
            <tbody>
              {priced.breakdown.map((line) => (
                <tr key={line.ruleCode} className="text-muted">
                  <td className="py-0.5">
                    {line.ruleCode}
                    <span className="text-xs"> ({line.stage})</span>
                    {line.applyPer !== 'unit' && (
                      <span className="text-xs text-accent"> per {line.applyPer}</span>
                    )}
                  </td>
                  <td className="py-0.5 text-end text-ink" dir="ltr">
                    {currencySymbol} {line.contribution.toFixed(2)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line font-medium">
                <td className="py-1 text-heading">Unit cost</td>
                <td className="py-1 text-end text-heading" dir="ltr">
                  {priced.currency} {priced.unitCost.toFixed(2)}
                </td>
              </tr>
              <tr className="font-medium">
                <td className="py-1 text-heading">Line total ({quantity})</td>
                <td className="py-1 text-end text-heading" dir="ltr">
                  {priced.currency} {priced.lineTotal.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {state.error && (
        <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canAdd || pending}
        className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-ink disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? 'Adding…' : 'Add to quote'}
      </button>
    </form>
  );
}
