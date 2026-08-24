import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getOptionGroupWithValues } from '@/lib/configuratorAdmin';
import OptionGroupForm from '../OptionGroupForm';
import OptionValueForm from './OptionValueForm';
import { deleteOptionValue } from '../../actions';

export default async function OptionGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('pricing.write')) redirect('/dashboard');

  const { id } = await params;
  const group = await getOptionGroupWithValues(id);
  if (!group) notFound();

  // Offered so a colour option can point at the existing `colors` facet rather
  // than forking a second vocabulary that drifts out of sync.
  const colors = await prisma.color.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { translations: { where: { localeCode: 'en' } } },
  });

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/dashboard/pricing/options" className="text-sm text-accent hover:underline">
          ← Option vocabulary
        </Link>
        <h1 className="text-2xl font-bold text-heading mt-2">{group.name}</h1>
        <p className="text-muted text-sm">
          <code>{group.code}</code> · {group.inputKind}
          {group.unit && ` · ${group.unit}`}
        </p>
      </div>

      <section className="border border-line rounded-lg p-4 bg-surface/40">
        <h2 className="text-lg font-semibold text-heading mb-3">Group</h2>
        <OptionGroupForm group={group} />
      </section>

      {group.inputKind === 'number' ? (
        <p className="text-muted text-sm border border-line rounded-lg p-4">
          A number group has no values. Its bounds live on each template as conditional ranges, so
          the same group can allow different limits depending on earlier choices.
        </p>
      ) : (
        <section>
          <h2 className="text-lg font-semibold text-heading mb-3">Values</h2>
          {group.values.length === 0 ? (
            <p className="text-muted text-sm">No values yet.</p>
          ) : (
            <table className="w-full text-sm border-collapse mb-4">
              <thead>
                <tr className="text-start text-muted border-b border-line">
                  <th className="text-start py-2 pe-4">Code</th>
                  <th className="text-start py-2 pe-4">Name</th>
                  <th className="text-start py-2 pe-4">Numeric</th>
                  <th className="text-start py-2 pe-4">Attributes</th>
                  <th className="text-start py-2 pe-4">Colour</th>
                  <th className="text-start py-2 pe-4">Product</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {group.values.map((value) => (
                  <tr key={value.id} className="border-b border-line/50">
                    <td className="py-2 pe-4">{value.code}</td>
                    <td className="py-2 pe-4">{value.name}</td>
                    <td className="py-2 pe-4 text-muted">{value.numericValue ?? '—'}</td>
                    <td className="py-2 pe-4 text-muted text-xs">
                      {value.attributes
                        ? Object.entries(value.attributes)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(', ')
                        : '—'}
                    </td>
                    <td className="py-2 pe-4">
                      {value.colorHex ? (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block w-3 h-3 rounded-full border border-line"
                            style={{ backgroundColor: value.colorHex }}
                          />
                          {value.colorHex}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2 pe-4 text-muted">{value.productCode ?? '—'}</td>
                    <td className="py-2 text-end">
                      <form action={deleteOptionValue}>
                        <input type="hidden" name="id" value={value.id} />
                        <button className="text-xs text-red-300 hover:underline">Delete</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="border border-line rounded-lg p-4 bg-surface/40">
            <h3 className="font-medium text-heading mb-3">New value</h3>
            <OptionValueForm
              groupId={group.id}
              groupCode={group.code}
              colors={colors.map((color) => ({
                id: color.id,
                label: color.translations[0]?.name ?? color.code,
                hex: color.hex,
              }))}
            />
          </div>
        </section>
      )}
    </div>
  );
}
