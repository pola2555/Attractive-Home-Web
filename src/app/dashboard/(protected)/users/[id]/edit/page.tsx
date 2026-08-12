import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getUserForEdit, listRoles, listPermissions } from '@/lib/usersAdmin';
import UserForm from '../../UserForm';
import { updateUser, sendUserPasswordReset } from '../../actions';

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reset_sent?: string; reset_skipped?: string; reset_error?: string }>;
}) {
  const { id } = await params;
  const { reset_sent, reset_skipped, reset_error } = await searchParams;
  const actor = await requireUser();
  if (!actor) redirect('/dashboard/login');
  const permissions = await effectivePermissions(actor.id);
  if (!permissions.has('users.manage')) redirect('/dashboard/users');

  const [target, roles, perms] = await Promise.all([getUserForEdit(id), listRoles(), listPermissions()]);
  if (!target) notFound();

  return (
    <div>
      <Link href="/dashboard/users" className="text-sm text-accent hover:underline">
        ← Users
      </Link>
      <h1 className="text-2xl font-bold text-heading mt-2 mb-8">Edit user</h1>

      {reset_sent && (
        <p className="mb-6 text-sm text-green-500">A password-reset link has been emailed to this user.</p>
      )}
      {reset_skipped && (
        <p className="mb-6 text-sm text-amber-500">
          Email isn&apos;t configured yet, so no message was sent. Set <code>EMAIL_FROM</code> to enable delivery.
        </p>
      )}
      {reset_error && (
        <p className="mb-6 text-sm text-red-400">Couldn&apos;t send a reset link — the account is inactive.</p>
      )}

      <UserForm
        action={updateUser.bind(null, id)}
        mode="edit"
        roles={roles}
        permissions={perms}
        initial={target}
        isSelf={actor.id === id}
        submitLabel="Save changes"
      />

      <div className="mt-10 pt-6 border-t border-line">
        <h2 className="text-sm font-semibold text-heading mb-1">Password reset</h2>
        <p className="text-sm text-muted mb-3">
          Email this user a secure link to set their own password (valid 1 hour) instead of typing one for them.
        </p>
        <form action={sendUserPasswordReset.bind(null, id)}>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg border border-line-strong text-ink text-sm hover:border-accent/60"
          >
            Send password-reset email
          </button>
        </form>
      </div>
    </div>
  );
}
