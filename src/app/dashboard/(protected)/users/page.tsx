import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { listUsers } from '@/lib/usersAdmin';

export default async function UsersDashboardPage() {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('users.manage')) redirect('/dashboard');

  const users = await listUsers();
  const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-heading">
          Users <span className="text-muted text-base font-normal">({users.length})</span>
        </h1>
        <Link
          href="/dashboard/users/new"
          className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white text-sm"
        >
          + New user
        </Link>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-muted border-b border-line">
            <th className="text-start py-2 pe-4">Name</th>
            <th className="text-start py-2 pe-4">Email</th>
            <th className="text-start py-2 pe-4">Roles</th>
            <th className="text-start py-2 pe-4">Status</th>
            <th className="text-start py-2 pe-4">Last login</th>
            <th className="text-start py-2">Edit</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-line/50 hover:bg-surface/60">
              <td className="py-2 pe-4 text-ink">
                {u.name}
                {u.id === user.id && <span className="ms-2 text-xs text-muted">(you)</span>}
              </td>
              <td className="py-2 pe-4 text-muted">{u.email}</td>
              <td className="py-2 pe-4 text-muted">{u.roles.join(', ') || '—'}</td>
              <td className="py-2 pe-4">
                <span className={`px-2 py-0.5 rounded-full text-xs border ${u.isActive ? 'border-green-500/50 text-green-300' : 'border-line text-muted'}`}>
                  {u.isActive ? 'Active' : 'Disabled'}
                </span>
              </td>
              <td className="py-2 pe-4 text-muted">{fmt(u.lastLoginAt)}</td>
              <td className="py-2">
                <Link href={`/dashboard/users/${u.id}/edit`} className="text-accent hover:underline">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
