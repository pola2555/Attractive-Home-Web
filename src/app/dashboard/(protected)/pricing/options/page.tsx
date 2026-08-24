import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { listOptionGroups } from '@/lib/configuratorAdmin';
import OptionGroupForm from './OptionGroupForm';
import { deleteOptionGroup } from '../actions';

export default async function OptionGroupsPage() {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('pricing.write')) redirect('/dashboard');

  const groups = await listOptionGroups();

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/dashboard/pricing" className="text-sm text-accent hover:underline">
          ← Pricing
        </Link>
        <h1 className="text-2xl font-bold text-heading mt-2">Option vocabulary</h1>
        <p className="text-muted text-sm mt-1">
          Shared across templates. A group is one question the configurator asks; its values are the
          answers. Colours and materials that already exist as catalog facets should link to them
          rather than being re-entered.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-muted text-sm">No option groups yet.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-start text-muted border-b border-line">
              <th className="text-start py-2 pe-4">Code</th>
              <th className="text-start py-2 pe-4">Name</th>
              <th className="text-start py-2 pe-4">Input</th>
              <th className="text-start py-2 pe-4">Unit</th>
              <th className="text-start py-2 pe-4">Values</th>
              <th className="text-start py-2 pe-4">Order</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.id} className="border-b border-line/50">
                <td className="py-2 pe-4">
                  <Link
                    href={`/dashboard/pricing/options/${group.id}`}
                    className="text-accent hover:underline"
                  >
                    {group.code}
                  </Link>
                </td>
                <td className="py-2 pe-4">{group.name}</td>
                <td className="py-2 pe-4 text-muted">{group.inputKind}</td>
                <td className="py-2 pe-4 text-muted">{group.unit ?? '—'}</td>
                <td className="py-2 pe-4">{group.valueCount}</td>
                <td className="py-2 pe-4 text-muted">{group.sortOrder}</td>
                <td className="py-2 text-end">
                  <form action={deleteOptionGroup}>
                    <input type="hidden" name="id" value={group.id} />
                    <button className="text-xs text-red-300 hover:underline">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section className="border border-line rounded-lg p-4 bg-surface/40">
        <h2 className="text-lg font-semibold text-heading mb-3">New option group</h2>
        <OptionGroupForm />
      </section>
    </div>
  );
}
