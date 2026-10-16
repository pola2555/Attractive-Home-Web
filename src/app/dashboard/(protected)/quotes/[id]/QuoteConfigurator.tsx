'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { addQuoteItem, type FormState } from '../actions';
import { cascadeSelection, resolveConfiguration } from '@/lib/configurator/resolve';
import { priceProduct, withVariant } from '@/lib/configurator/product';
import { selectedVariantCode } from '@/lib/configurator/grid';
import { priceAccessories, type AccessoryDef } from '@/lib/configurator/accessories';
import { addonsForSelection } from '@/lib/configurator/addons';
import { treeSelectedImages, multiSelectGroupCodes } from '@/lib/configurator/tree';
import type { ResolvedOption, Selection, TemplateDef } from '@/lib/configurator/types';

// A small gallery of node images (plain web URLs from the canvas). Shown atop
// the quote for the base build and beside each answered tree question, so a
// choice can be seen, not just read.
function Thumbs({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {urls.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt=""
          loading="lazy"
          className="w-16 h-16 object-cover rounded-lg border border-line"
        />
      ))}
    </div>
  );
}

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
  accessoriesByTemplate,
  currencySymbol,
}: {
  quoteId: string;
  templates: TemplateDef[];
  accessoriesByTemplate: Record<string, AccessoryDef[]>;
  currencySymbol: string;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [selection, setSelection] = useState<Selection>({});
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [addPicked, setAddPicked] = useState<Record<string, number>>({});
  const [accPicked, setAccPicked] = useState<Record<string, number>>({});
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState('');
  const [state, formAction, pending] = useActionState<FormState, FormData>(addQuoteItem, {});

  const template = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const resolution = useMemo(
    () => (template ? resolveConfiguration(template, selection, quantity, picked) : null),
    [template, selection, quantity, picked],
  );

  const priced = useMemo(
    () =>
      template
        ? priceProduct({ template, selection, picked, pickedAddons: addPicked, quantity })
        : null,
    [template, selection, picked, addPicked, quantity],
  );

  // Accessories offered for this template, priced live (own quantities, listed
  // price — never the door's margin). The server re-runs the same function.
  const accDefs = useMemo(
    () => accessoriesByTemplate[templateId] ?? [],
    [accessoriesByTemplate, templateId],
  );
  const accGroups = useMemo(() => {
    const m = new Map<string, AccessoryDef[]>();
    for (const a of accDefs) {
      const key = a.category?.trim() || 'Accessories';
      const list = m.get(key) ?? [];
      list.push(a);
      m.set(key, list);
    }
    return [...m.entries()];
  }, [accDefs]);
  const accPriced = useMemo(() => priceAccessories(accDefs, accPicked), [accDefs, accPicked]);

  const variantCode = selectedVariantCode(selection);
  const variants = template?.variants ?? [];
  const variant = variants.find((v) => v.code === variantCode) ?? null;

  // Upgrades are grouped under the supplier's own headings so the screen reads
  // like the price list a salesperson may still have open beside it.
  const sections = useMemo(() => {
    const out = new Map<string, NonNullable<typeof resolution>['upgrades']>();
    for (const upgrade of resolution?.upgrades ?? []) {
      const key = upgrade.section ?? 'Other';
      const list = out.get(key) ?? [];
      list.push(upgrade);
      out.set(key, list);
    }
    return [...out.entries()];
  }, [resolution]);

  // Canvas add-ons on offer for the current branch, priced straight from the
  // tree. For now the FLAT, non-colour add-ons (colours are a question; sizes
  // are still bands; option-tree add-ons follow next). They appear only once
  // their branch is reached, and the server re-prices them the same way.
  const upgradeAddons = useMemo(
    () =>
      template?.extrasFromCanvas
        ? (variant?.addons ?? []).filter((a) => a.colorHex === null && a.nodes.length === 0)
        : [],
    [template, variant],
  );
  const offeredAddons = useMemo(
    () => addonsForSelection(upgradeAddons, variant?.priceTree, selection),
    [upgradeAddons, variant, selection],
  );

  // The image(s) to show beside each answered tree question — the picture of
  // whatever has been chosen at that step, straight from the canvas.
  const selectedImages = useMemo(
    () => treeSelectedImages(variant?.priceTree, selection),
    [variant, selection],
  );

  // Tree levels the canvas marked MULTI-SELECT: the quote shows these as
  // checkboxes (pick several, each branch priced and summed) rather than a
  // single dropdown. Driven by the tree, not the question's own input kind.
  const multiGroups = useMemo(() => multiSelectGroupCodes(variant?.priceTree), [variant]);

  // Progressive disclosure — the quote form opens the decision tree the way the
  // canvas draws it: a question appears only once the answers it depends on have
  // been given, so each choice "opens" the next. A tree question whose branch is
  // not reached yet has all of its values pending, so it stays shut until an
  // upstream answer unlocks it (the board waits on the edge, the colours on the
  // silent edge); an independent question — a size, a colour offered from the
  // start — is shown straight away.
  const needsVariant = variants.length > 0 && !variantCode;

  const steps = useMemo(() => {
    if (!resolution || needsVariant) return [] as ResolvedOption[];
    return resolution.options.filter(
      (o) =>
        o.isVisible &&
        (o.inputKind === 'number' ||
          o.inputKind === 'boolean' ||
          o.selected.length > 0 ||
          o.values.some((v) => v.availability === 'yes')),
    );
  }, [resolution, needsVariant]);

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
    setPicked({});
    setAddPicked({});
    setAccPicked({});
  }

  function toggleAddon(id: string, on: boolean, qty: number) {
    setAddPicked((prev) => {
      const next = { ...prev };
      if (on) next[id] = qty;
      else delete next[id];
      return next;
    });
  }

  function toggleAccessory(id: string, on: boolean, qty: number) {
    setAccPicked((prev) => {
      const next = { ...prev };
      if (on) next[id] = qty;
      else delete next[id];
      return next;
    });
  }

  // Switching branch discards the whole selection rather than trying to carry
  // it across: the two branches ask different questions, so a "thickness" kept
  // from the aluminium frame means nothing on the wood one and would sit in
  // the selection poisoning the grid key.
  function pickVariant(code: string) {
    setSelection(withVariant({}, code || null));
    setPicked({});
    setAddPicked({});
  }

  function toggleUpgrade(code: string, on: boolean, qty: number) {
    setPicked((prev) => {
      const next = { ...prev };
      if (on) next[code] = qty;
      else delete next[code];
      return next;
    });
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

  // Drop the "X is required" nags: with the stepped reveal, an unanswered
  // question is simply the next level that has not opened yet, not an error.
  // Real clashes (a forbidden colour, an out-of-range size, a gap in the price
  // grid) still surface.
  const blocking = (resolution?.issues ?? []).filter((i) => i.kind !== 'missing_required');
  const canAdd =
    !!resolution?.isComplete && !!priced && priced.issues.length === 0 && priced.isPriceable;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="selectionJson" value={JSON.stringify(selection)} />
      <input type="hidden" name="upgradesJson" value={JSON.stringify(picked)} />
      <input type="hidden" name="addonsJson" value={JSON.stringify(addPicked)} />
      <input type="hidden" name="accessoriesJson" value={JSON.stringify(accPicked)} />
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

      {variants.length > 0 && (
        <div>
          <label className={labelCls} htmlFor="cfg-variant">
            Base variant<span className="text-accent"> *</span>
          </label>
          <select
            id="cfg-variant"
            className={inputCls}
            value={variantCode ?? ''}
            onChange={(e) => pickVariant(e.target.value)}
          >
            <option value="">Choose…</option>
            {variants.map((v) => (
              <option key={v.code} value={v.code}>
                {v.name}
              </option>
            ))}
          </select>
          {variant?.includedSpec && (
            // What the base price already covers. Without it a salesperson
            // cannot tell a customer what they are paying an upgrade to change.
            <p className="text-muted text-xs mt-1">Includes: {variant.includedSpec}</p>
          )}
        </div>
      )}

      {template?.standardNote && (
        <p className="text-xs text-muted border border-line rounded-lg px-3 py-2 bg-surface/40">
          {template.standardNote}
        </p>
      )}

      {variant?.images && variant.images.length > 0 && <Thumbs urls={variant.images} />}

      {needsVariant && (
        <p className="text-xs text-muted">
          Choose a base variant to begin — each answer opens the next step.
        </p>
      )}

      {steps.map((option) => {
        const entry = selection[option.groupCode];

        if (option.inputKind === 'number') {
          return (
            <div key={option.groupCode} className="cfg-reveal">
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

        if (option.inputKind === 'multi_select' || multiGroups.has(option.groupCode)) {
          return (
            <div key={option.groupCode} className="cfg-reveal">
              <span className={labelCls}>
                {option.name}
                <span className="text-muted text-xs"> · pick any</span>
              </span>
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
          <div key={option.groupCode} className="cfg-reveal">
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
            <Thumbs urls={selectedImages.get(option.groupCode) ?? []} />
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

      {sections.length > 0 && (
        <div className="space-y-3">
          {sections.map(([section, upgrades]) => (
            <div key={section} className="border border-line rounded-lg p-3 bg-surface/40">
              <p className="text-xs uppercase tracking-wider text-muted mb-2">{section}</p>
              <div className="space-y-1.5">
                {upgrades.map((upgrade) => {
                  const on = picked[upgrade.code] !== undefined;
                  const qty = picked[upgrade.code] ?? upgrade.defaultQty;
                  const blocked = upgrade.availability !== 'yes';
                  const countable = upgrade.unit !== 'flat';
                  return (
                    <div
                      key={upgrade.code}
                      className={`flex items-start gap-2 text-sm ${blocked ? 'opacity-45' : ''}`}
                    >
                      <input
                        type="checkbox"
                        id={`upg-${upgrade.code}`}
                        className="mt-1 accent-[var(--color-accent)]"
                        checked={on}
                        disabled={blocked}
                        onChange={(e) => toggleUpgrade(upgrade.code, e.target.checked, qty)}
                      />
                      <div className="flex-1 min-w-0">
                        <label htmlFor={`upg-${upgrade.code}`} className="text-ink">
                          {upgrade.label}
                        </label>
                        {countable && on && (
                          <input
                            type="number"
                            aria-label={`${upgrade.label} quantity`}
                            className="ms-2 w-16 px-1.5 py-0.5 bg-surface text-ink rounded border border-line-strong text-xs"
                            min={upgrade.minQty}
                            max={upgrade.maxQty ?? undefined}
                            value={qty}
                            onChange={(e) =>
                              toggleUpgrade(
                                upgrade.code,
                                true,
                                Math.max(upgrade.minQty, Number(e.target.value) || upgrade.minQty),
                              )
                            }
                          />
                        )}
                        {upgrade.detail && <p className="text-muted text-xs">{upgrade.detail}</p>}
                        {/* Greyed out WITH a reason. Hiding it sends someone
                            hunting for an upgrade the customer just named. */}
                        {blocked && upgrade.unavailableNote && (
                          <p className="text-xs text-accent">{upgrade.unavailableNote}</p>
                        )}
                      </div>
                      <span className="text-muted text-xs whitespace-nowrap" dir="ltr">
                        +{upgrade.amount.toFixed(2)}
                        {upgrade.unit === 'per_unit' || upgrade.unit === 'per_piece'
                          ? ' ea'
                          : upgrade.unit === 'per_set'
                            ? ' /set'
                            : upgrade.unit === 'per_sqm'
                              ? ' /m²'
                              : ''}
                        {upgrade.hasTiers && <span className="text-accent"> tiered</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {offeredAddons.length > 0 && (
        <div className="border border-line rounded-lg p-3 bg-surface/40">
          <p className="text-xs uppercase tracking-wider text-muted mb-2">Add-ons</p>
          <div className="space-y-1.5">
            {offeredAddons.map((addon) => {
              const on = addPicked[addon.id] !== undefined;
              const qty = addPicked[addon.id] ?? 1;
              const countable = addon.priceUnit !== null;
              return (
                <div key={addon.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    id={`addon-${addon.id}`}
                    className="mt-1 accent-[var(--color-accent)]"
                    checked={on}
                    onChange={(e) => toggleAddon(addon.id, e.target.checked, qty)}
                  />
                  <div className="flex-1 min-w-0">
                    <label htmlFor={`addon-${addon.id}`} className="text-ink">
                      {addon.name}
                    </label>
                    {countable && on && (
                      <input
                        type="number"
                        aria-label={`${addon.name} quantity`}
                        className="ms-2 w-16 px-1.5 py-0.5 bg-surface text-ink rounded border border-line-strong text-xs"
                        min={1}
                        value={qty}
                        onChange={(e) =>
                          toggleAddon(addon.id, true, Math.max(1, Number(e.target.value) || 1))
                        }
                      />
                    )}
                  </div>
                  <span className="text-muted text-xs whitespace-nowrap" dir="ltr">
                    +{(addon.amount ?? 0).toFixed(2)}
                    {addon.priceUnit === 'per_unit' || addon.priceUnit === 'per_piece'
                      ? ' ea'
                      : addon.priceUnit === 'per_set'
                        ? ' /set'
                        : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {accDefs.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted">
            Accessories — sold separately
          </p>
          {accGroups.map(([cat, list]) => (
            <div key={cat} className="border border-line rounded-lg p-3 bg-surface/40">
              <p className="text-xs uppercase tracking-wider text-muted mb-2">{cat}</p>
              <div className="space-y-1.5">
                {list.map((a) => {
                  const on = accPicked[a.id] !== undefined;
                  const qty = accPicked[a.id] ?? 1;
                  const hint =
                    a.pricingMode === 'per_item'
                      ? `${currencySymbol} ${(a.unitPrice ?? 0).toFixed(2)} ea`
                      : 'bulk — tiered';
                  return (
                    <div key={a.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        id={`acc-${a.id}`}
                        className="mt-1 accent-[var(--color-accent)]"
                        checked={on}
                        onChange={(e) => toggleAccessory(a.id, e.target.checked, qty)}
                      />
                      <div className="flex-1 min-w-0">
                        <label htmlFor={`acc-${a.id}`} className="text-ink">
                          {a.name}
                          {a.colorName ? ` · ${a.colorName}` : ''}
                        </label>
                        {on && (
                          <input
                            type="number"
                            aria-label={`${a.name} quantity`}
                            className="ms-2 w-16 px-1.5 py-0.5 bg-surface text-ink rounded border border-line-strong text-xs"
                            min={1}
                            value={qty}
                            onChange={(e) =>
                              toggleAccessory(a.id, true, Math.max(1, Number(e.target.value) || 1))
                            }
                          />
                        )}
                      </div>
                      <span className="text-muted text-xs whitespace-nowrap" dir="ltr">
                        {hint}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {resolution && Object.keys(resolution.derived).length > 0 && (
        <div className="text-sm text-muted border border-line rounded-lg p-3 bg-surface/40">
          {Object.entries(resolution.derived).map(([code, value]) => {
            // A null with no issue against it simply has not been answered
            // yet — an optional width, say. Calling that "needs review" sends
            // someone looking for a fault that is not there.
            const broken = resolution.issues.some((i) => i.kind === 'formula' && i.code === code);
            return (
              <span key={code} className="me-4">
                {code}:{' '}
                <span
                  className={broken ? 'text-red-300' : value === null ? 'text-muted' : 'text-ink'}
                >
                  {value === null ? (broken ? 'needs review' : '—') : value.toFixed(3)}
                </span>
              </span>
            );
          })}
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
                <tr key={`${line.source ?? 'rule'}-${line.ruleCode}`} className="text-muted">
                  <td className="py-0.5">
                    {/* Seeded lines carry a human label; rules only have a
                        code, which is all a rule has ever been named by. */}
                    {line.label ?? line.ruleCode}
                    <span className="text-xs"> ({line.source ?? line.stage})</span>
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
              {accPriced.lines.length > 0 && (
                <>
                  <tr>
                    <td colSpan={2} className="pt-2 text-xs uppercase tracking-wider text-muted">
                      Accessories (sold separately)
                    </td>
                  </tr>
                  {accPriced.lines.map((line) => (
                    <tr key={line.accessoryId} className="text-muted">
                      <td className="py-0.5">
                        {line.name} × {line.quantity}
                      </td>
                      <td className="py-0.5 text-end text-ink" dir="ltr">
                        {priced.currency} {line.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-line font-medium">
                    <td className="py-1 text-heading">Item total incl. accessories</td>
                    <td className="py-1 text-end text-heading" dir="ltr">
                      {priced.currency} {(priced.lineTotal + accPriced.total).toFixed(2)}
                    </td>
                  </tr>
                </>
              )}
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
