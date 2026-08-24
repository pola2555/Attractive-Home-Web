import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getTemplate, listOptionGroups } from '@/lib/configuratorAdmin';
import TemplateForm from '../TemplateForm';
import TemplateOptionForm from './TemplateOptionForm';
import DerivedQuantityForm from './DerivedQuantityForm';
import PricingRuleForm from './PricingRuleForm';
import ConstraintForm from './ConstraintForm';
import {
  deleteConstraint,
  deleteDerivedQuantity,
  deletePricingRule,
  removeTemplateOption,
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
          Order is load-bearing: a condition or formula may only reference options{' '}
          <em>above</em> it. That is what keeps the dependency tree acyclic instead of letting
          material and colour gate each other.
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
              <tr key={option.groupCode} className="border-b border-line/50 align-top">
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
                    : option.values
                        .map((v) => (v.condition ? `${v.code}*` : v.code))
                        .join(', ')}
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
    </div>
  );
}
