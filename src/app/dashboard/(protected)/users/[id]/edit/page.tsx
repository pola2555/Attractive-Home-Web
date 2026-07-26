import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getUserForEdit, listRoles, listPermissions } from '@/lib/usersAdmin';
import UserForm from '../../UserForm';
import { updateUser } from '../../actions';

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
      <UserForm
        action={updateUser.bind(null, id)}
        mode="edit"
        roles={roles}
        permissions={perms}
        initial={target}
        isSelf={actor.id === id}
        submitLabel="Save changes"
      />
    </div>
  );
}
