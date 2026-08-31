import { Fragment } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getTemplate, listOptionGroups } from '@/lib/configuratorAdmin';
import TemplateForm from '../TemplateForm';
import TemplateOptionForm from './TemplateOptionForm';
import VariantForm from './VariantForm';
import UpgradeForm, { type UpgradeFormOption } from './UpgradeForm';
import UpgradeExtras from './UpgradeExtras';
import BandForm from './BandForm';
import DerivedQuantityForm from './DerivedQuantityForm';
import PricingRuleForm from './PricingRuleForm';
import ConstraintForm from './ConstraintForm';
import {
  deleteConstraint,
  deleteDerivedQuantity,
  deletePricingRule,
  removeBand,
  removeTemplateOption,
  removeUpgrade,
  removeVariant,
} from '../../actions';

// The template editor: the option tree in order, the derived quantities that
// chain off it, the cross-group constraints, and the staged pricing rules.
export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('pricing.write')) redirect('/dashboard');

  const { id } = await params;
  const [template, row, groups, hsCodes] = await Promise.all([
    getTemplate(id),
    prisma.configTemplate.findUnique({ where: { id } }),
    listOptionGroups(),
    prisma.hsCode.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, description: true },
    }),
  ]);
  if (!template || !row) notFound();

  const optionRows = await prisma.configTemplateOption.findMany({
    where: { templateId: id },
    orderBy: { sortOrder: 'asc' },
    include: { group: { select: { code: true } } },
  });
  const optionIdByGroup = new Map(optionRows.map((o) => [o.group.code, o.id]));

  const constraints = await prisma.configTemplateConstraint.findMany({
    where: { templateId: id },
    orderBy: { code: 'asc' },
  });

  const ruleRows = await prisma.pricingRule.findMany({
    where: { templateId: id },
    orderBy: [{ stage: 'asc' }, { priority: 'asc' }, { code: 'asc' }],
  });

  const [variantRows, upgradeRows, bandRows] = await Promise.all([
    prisma.configVariant.findMany({
      where: { templateId: id },
      orderBy: { sortOrder: 'asc' },
      include: { grid: { include: { axes: true, cells: true } } },
    }),
    prisma.configUpgrade.findMany({
      where: { templateId: id },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: {
        variant: { select: { name: true } },
        tiers: { orderBy: { minQty: 'asc' } },
        effects: { include: { templateOption: { include: { group: { select: { code: true } } } } } },
      },
    }),
    prisma.configBand.findMany({
      where: { templateId: id },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: {
        variant: { select: { name: true } },
        templateOption: { include: { group: { select: { code: true } } } },
      },
    }),
  ]);

  // Fed to the upgrade form's condition builder, so "only on 45 and 55 mm" is
  // authored by picking a question and ticking answers.
  // Deduplicated by question: a group bound to both branches is still one
  // question to write a condition against, and offering it twice in the
  // dropdown would only invite picking the wrong one.
  const upgradeFormOptions: UpgradeFormOption[] = [
    ...new Map(
      template.options
        .filter((option) => option.values.length > 0)
        .map((option) => [
          option.groupCode,
          {
            groupCode: option.groupCode,
            name: option.name,
            values: option.values.map((v) => ({ code: v.code, name: v.name })),
          },
        ]),
    ).values(),
  ];

  // An effect targets one specific bound question by id (unlike the availability
  // condition, which names a group), so a group bound to two branches stays two
  // distinct targets here rather than being deduplicated.
  const effectTargets = template.options
    .filter((option) => option.values.length > 0)
    .map((option) => ({
      id: option.id,
      name: option.name,
      values: option.values.map((v) => ({ code: v.code, name: v.name })),
    }));

  // Bands hang off measurements, which are the only questions with a magnitude
  // to fall inside a range.
  const measurementOptions = [
    ...new Map(
      optionRows
        .filter(
          (row) =>
            template.options.find((o) => o.groupCode === row.group.code)?.inputKind === 'number',
        )
        .map((row) => [
          row.group.code,
          {
            id: row.id,
            code: row.group.code,
            unit: template.options.find((o) => o.groupCode === row.group.code)?.unit ?? null,
          },
        ]),
    ).values(),
  ];

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <Link href="/dashboard/pricing/templates" className="text-sm text-accent hover:underline">
          ← Templates
        </Link>
        <h1 className="text-2xl font-bold text-heading mt-2">{template.name}</h1>
        <p className="text-muted text-sm">
          <code>{template.code}</code> · prices in {template.currency}
        </p>
      </div>

      <section className="border border-line rounded-lg p-4 bg-surface/40">
        <TemplateForm template={row} hsCodes={hsCodes} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-heading mb-1">Options</h2>
        <p className="text-muted text-sm mb-3">
          Order is load-bearing: a condition or formula may only reference options <em>above</em>{' '}
          it. That is what keeps the dependency tree acyclic instead of letting material and colour
          gate each other.
        </p>
        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="text-start text-muted border-b border-line">
              <th className="text-start py-2 pe-4">#</th>
              <th className="text-start py-2 pe-4">Group</th>
              <th className="text-start py-2 pe-4">Kind</th>
              <th className="text-start py-2 pe-4">Required</th>
              <th className="text-start py-2 pe-4">Shown when</th>
              <th className="text-start py-2 pe-4">Ranges</th>
              <th className="text-start py-2 pe-4">Values</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {template.options.map((option) => (
              <tr key={option.id} className="border-b border-line/50 align-top">
                <td className="py-2 pe-4 text-muted">{option.sortOrder}</td>
                <td className="py-2 pe-4">{option.groupCode}</td>
                <td className="py-2 pe-4 text-muted">{option.inputKind}</td>
                <td className="py-2 pe-4 text-muted">{option.isRequired ? 'yes' : 'no'}</td>
                <td className="py-2 pe-4 text-muted text-xs max-w-[16rem] break-all">
                  {option.condition ? JSON.stringify(option.condition) : 'always'}
                </td>
                <td className="py-2 pe-4 text-muted text-xs max-w-[16rem] break-all">
                  {option.ranges.length ? JSON.stringify(option.ranges) : '—'}
                </td>
                <td className="py-2 pe-4 text-xs">
                  {option.values.length === 0
                    ? '—'
                    : option.values.map((v) => (v.condition ? `${v.code}*` : v.code)).join(', ')}
                </td>
                <td className="py-2 text-end">
                  <form action={removeTemplateOption}>
                    <input
                      type="hidden"
                      name="id"
                      value={optionIdByGroup.get(option.groupCode) ?? ''}
                    />
                    <button className="text-xs text-red-300 hover:underline">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-muted text-xs mb-3">* value is gated by a condition.</p>

        <div className="border border-line rounded-lg p-4 bg-surface/40">
          <h3 className="font-medium text-heading mb-3">Bind an option group</h3>
          <TemplateOptionForm
            templateId={id}
            groups={groups}
            earlierCodes={template.options.map((o) => o.groupCode)}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-heading mb-1">Derived quantities</h2>
        <p className="text-muted text-sm mb-3">
          Evaluated in order. A failure yields <em>no value</em> and flags the item for review —
          never zero, because a weightless door ships free.
        </p>
        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="text-start text-muted border-b border-line">
              <th className="text-start py-2 pe-4">#</th>
              <th className="text-start py-2 pe-4">Code</th>
              <th className="text-start py-2 pe-4">Formula</th>
              <th className="text-start py-2 pe-4">Unit</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {template.derivedQuantities.map((quantity) => (
              <tr key={quantity.code} className="border-b border-line/50">
                <td className="py-2 pe-4 text-muted">{quantity.sortOrder}</td>
                <td className="py-2 pe-4">{quantity.code}</td>
                <td className="py-2 pe-4 font-mono text-xs">{quantity.formula}</td>
                <td className="py-2 pe-4 text-muted">{quantity.unit ?? '—'}</td>
                <td className="py-2 text-end">
                  <form action={deleteDerivedQuantity}>
                    <input type="hidden" name="templateId" value={id} />
                    <input type="hidden" name="code" value={quantity.code} />
                    <button className="text-xs text-red-300 hover:underline">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border border-line rounded-lg p-4 bg-surface/40">
          <DerivedQuantityForm templateId={id} template={template} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-heading mb-1">Constraints</h2>
        <p className="text-muted text-sm mb-3">
          Checked against the complete selection, so they catch combinations no single value could
          veto — three individually-fine choices that are invalid together.
        </p>
        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="text-start text-muted border-b border-line">
              <th className="text-start py-2 pe-4">Code</th>
              <th className="text-start py-2 pe-4">Kind</th>
              <th className="text-start py-2 pe-4">Condition</th>
              <th className="text-start py-2 pe-4">Message</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {constraints.map((constraint) => (
              <tr key={constraint.id} className="border-b border-line/50 align-top">
                <td className="py-2 pe-4">{constraint.code}</td>
                <td className="py-2 pe-4 text-muted">{constraint.kind}</td>
                <td className="py-2 pe-4 text-xs font-mono max-w-[18rem] break-all">
                  {JSON.stringify(constraint.condition)}
                </td>
                <td className="py-2 pe-4 text-muted">{constraint.message}</td>
                <td className="py-2 text-end">
                  <form action={deleteConstraint}>
                    <input type="hidden" name="templateId" value={id} />
                    <input type="hidden" name="code" value={constraint.code} />
                    <button className="text-xs text-red-300 hover:underline">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border border-line rounded-lg p-4 bg-surface/40">
          <ConstraintForm templateId={id} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-heading mb-1">Pricing rules</h2>
        <p className="text-muted text-sm mb-3">
          Evaluated by stage, then priority, then code — a total order, so a price never depends on
          row order. A percentage applies to the subtotal at the end of the <em>previous</em> stage.
        </p>
        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="text-start text-muted border-b border-line">
              <th className="text-start py-2 pe-4">Stage</th>
              <th className="text-start py-2 pe-4">Code</th>
              <th className="text-start py-2 pe-4">Basis</th>
              <th className="text-start py-2 pe-4">Amount / rate</th>
              <th className="text-start py-2 pe-4">Per</th>
              <th className="text-start py-2 pe-4">When</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {ruleRows.map((rule) => (
              <tr key={rule.id} className="border-b border-line/50 align-top">
                <td className="py-2 pe-4 text-muted">
                  {rule.stage}
                  <span className="text-xs"> /{rule.priority}</span>
                </td>
                <td className="py-2 pe-4">{rule.code}</td>
                <td className="py-2 pe-4 text-muted">
                  {rule.basis}
                  {rule.quantityCode && <span className="text-xs"> × {rule.quantityCode}</span>}
                </td>
                <td className="py-2 pe-4" dir="ltr">
                  {rule.basis === 'flat'
                    ? `${rule.currency ?? ''} ${rule.amount?.toString() ?? ''}`
                    : rule.basis === 'percent'
                      ? `${rule.rate?.toString() ?? ''}%`
                      : `${rule.currency ?? ''} ${rule.rate?.toString() ?? ''}`}
                </td>
                <td className="py-2 pe-4 text-muted">{rule.applyPer}</td>
                <td className="py-2 pe-4 text-xs font-mono max-w-[16rem] break-all">
                  {rule.condition ? JSON.stringify(rule.condition) : 'always'}
                </td>
                <td className="py-2 text-end">
                  <form action={deletePricingRule}>
                    <input type="hidden" name="id" value={rule.id} />
                    <button className="text-xs text-red-300 hover:underline">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border border-line rounded-lg p-4 bg-surface/40">
          <PricingRuleForm templateId={id} template={template} />
        </div>
      </section>

      {/* ---- Variants ---------------------------------------------------- */}
      <section data-testid="variants">
        <h2 className="text-lg font-semibold text-heading mb-1">Base variants</h2>
        <p className="text-muted text-sm mb-3">
          Add one only when the product genuinely forks — when two builds carry different questions,
          different prices <em>and</em> different upgrades. A product without variants skips this
          entirely.
        </p>

        {variantRows.length > 0 && (
          <table className="w-full text-sm border-collapse mb-4">
            <thead>
              <tr className="text-start text-muted border-b border-line">
                <th className="text-start py-2 pe-4">#</th>
                <th className="text-start py-2 pe-4">Code</th>
                <th className="text-start py-2 pe-4">Name</th>
                <th className="text-start py-2 pe-4">Includes</th>
                <th className="text-start py-2 pe-4">Grid</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {variantRows.map((variant) => {
                const cells = variant.grid?.cells ?? [];
                const priced = cells.filter((c) => c.amount !== null).length;
                return (
                  <tr key={variant.id} className="border-b border-line/50 align-top">
                    <td className="py-2 pe-4 text-muted">{variant.sortOrder}</td>
                    <td className="py-2 pe-4 font-mono text-xs">{variant.code}</td>
                    <td className="py-2 pe-4">{variant.name}</td>
                    <td className="py-2 pe-4 text-muted text-xs max-w-[18rem]">
                      {variant.includedSpec ?? '—'}
                    </td>
                    <td className="py-2 pe-4">
                      <Link
                        href={`/dashboard/pricing/templates/${id}/grid/${variant.id}`}
                        className="text-accent hover:underline"
                      >
                        {variant.grid?.axes.length
                          ? `${priced} priced · ${cells.length - priced} not sold`
                          : 'set up'}
                      </Link>
                    </td>
                    <td className="py-2 text-end">
                      <form action={removeVariant}>
                        <input type="hidden" name="id" value={variant.id} />
                        <button className="text-xs text-red-300 hover:underline">Delete</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="border border-line rounded-lg p-4 bg-surface/40">
          <VariantForm templateId={id} />
        </div>
      </section>

      {/* ---- Upgrades ---------------------------------------------------- */}
      <section data-testid="upgrades">
        <h2 className="text-lg font-semibold text-heading mb-1">Upgrades and accessories</h2>
        <p className="text-muted text-sm mb-3">
          Things a salesperson ticks. Each carries an amount, how it is charged, and — through
          dropdowns rather than JSON — when it is offered at all.
        </p>

        {upgradeRows.length > 0 && (
          <table className="w-full text-sm border-collapse mb-4">
            <thead>
              <tr className="text-start text-muted border-b border-line">
                <th className="text-start py-2 pe-4">Section</th>
                <th className="text-start py-2 pe-4">Name</th>
                <th className="text-start py-2 pe-4">Variant</th>
                <th className="text-end py-2 pe-4">Amount</th>
                <th className="text-start py-2 pe-4">Charged</th>
                <th className="text-start py-2 pe-4">Offered when</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {upgradeRows.map((upgrade) => (
                <Fragment key={upgrade.id}>
                  <tr className="align-top">
                    <td className="py-2 pe-4 text-muted text-xs">{upgrade.section ?? '—'}</td>
                    <td className="py-2 pe-4">
                      {upgrade.label}
                      {upgrade.kind === 'accessory' && (
                        <span className="text-accent text-xs"> accessory</span>
                      )}
                    </td>
                    <td className="py-2 pe-4 text-muted text-xs">{upgrade.variant?.name ?? 'all'}</td>
                    <td className="py-2 pe-4 text-end tabular-nums" dir="ltr">
                      {upgrade.amount.toFixed(2)}
                    </td>
                    <td className="py-2 pe-4 text-muted text-xs">{upgrade.unit}</td>
                    <td className="py-2 pe-4 text-muted text-xs max-w-[14rem]">
                      {upgrade.unavailableNote ?? (upgrade.condition ? 'conditional' : 'always')}
                    </td>
                    <td className="py-2 text-end">
                      <form action={removeUpgrade}>
                        <input type="hidden" name="id" value={upgrade.id} />
                        <button className="text-xs text-red-300 hover:underline">Delete</button>
                      </form>
                    </td>
                  </tr>
                  <tr className="border-b border-line/50">
                    <td colSpan={7} className="pb-4 ps-4">
                      <details>
                        <summary className="cursor-pointer text-xs text-accent select-none">
                          Tiers &amp; effects ({upgrade.tiers.length}/{upgrade.effects.length})
                        </summary>
                        <UpgradeExtras
                          upgradeId={upgrade.id}
                          tiers={upgrade.tiers.map((tier) => ({
                            id: tier.id,
                            minQty: tier.minQty,
                            unitAmount: tier.unitAmount.toNumber(),
                          }))}
                          effects={upgrade.effects.map((effect) => ({
                            id: effect.id,
                            kind: effect.kind,
                            groupName: effect.templateOption?.group.code ?? null,
                            valueCodes: Array.isArray(effect.valueCodes)
                              ? effect.valueCodes.filter((v): v is string => typeof v === 'string')
                              : [],
                            message: effect.message,
                          }))}
                          targets={effectTargets}
                        />
                      </details>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        )}

        <div className="border border-line rounded-lg p-4 bg-surface/40">
          <UpgradeForm
            templateId={id}
            variants={variantRows.map((v) => ({ id: v.id, code: v.code, name: v.name }))}
            options={upgradeFormOptions}
            derivedCodes={template.derivedQuantities.map((q) => q.code)}
          />
        </div>
      </section>

      {/* ---- Size bands -------------------------------------------------- */}
      <section data-testid="bands">
        <h2 className="text-lg font-semibold text-heading mb-1">Size bands</h2>
        <p className="text-muted text-sm mb-3">
          Automatic steps on a measurement — nobody ticks these. A size that falls through every
          band is reported on the quote rather than charged as nothing.
        </p>

        {bandRows.length > 0 && (
          <table className="w-full text-sm border-collapse mb-4">
            <thead>
              <tr className="text-start text-muted border-b border-line">
                <th className="text-start py-2 pe-4">Measurement</th>
                <th className="text-start py-2 pe-4">Name</th>
                <th className="text-end py-2 pe-4">From</th>
                <th className="text-end py-2 pe-4">Up to</th>
                <th className="text-end py-2 pe-4">Adds</th>
                <th className="text-start py-2 pe-4">Variant</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {bandRows.map((band) => (
                <tr key={band.id} className="border-b border-line/50">
                  <td className="py-2 pe-4 font-mono text-xs">{band.templateOption.group.code}</td>
                  <td className="py-2 pe-4">{band.label}</td>
                  <td className="py-2 pe-4 text-end tabular-nums text-muted" dir="ltr">
                    {band.minValue?.toString() ?? '—'}
                  </td>
                  <td className="py-2 pe-4 text-end tabular-nums text-muted" dir="ltr">
                    {band.maxValue?.toString() ?? '—'}
                  </td>
                  <td className="py-2 pe-4 text-end tabular-nums" dir="ltr">
                    {band.amount.toFixed(2)}
                  </td>
                  <td className="py-2 pe-4 text-muted text-xs">{band.variant?.name ?? 'all'}</td>
                  <td className="py-2 text-end">
                    <form action={removeBand}>
                      <input type="hidden" name="id" value={band.id} />
                      <button className="text-xs text-red-300 hover:underline">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="border border-line rounded-lg p-4 bg-surface/40">
          <BandForm
            templateId={id}
            variants={variantRows.map((v) => ({ id: v.id, code: v.code, name: v.name }))}
            measurements={measurementOptions}
          />
        </div>
      </section>
    </div>
  );
}
