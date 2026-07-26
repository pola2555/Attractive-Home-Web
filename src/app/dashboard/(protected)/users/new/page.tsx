import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { listRoles, listPermissions } from '@/lib/usersAdmin';
import UserForm from '../UserForm';
import { createUser } from '../actions';

export default async function NewUserPage() {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('users.manage')) redirect('/dashboard/users');

  const [roles, perms] = await Promise.all([listRoles(), listPermissions()]);

  return (
    <div>
      <Link href="/dashboard/users" className="text-sm text-accent hover:underline">
        ← Users
      </Link>
      <h1 className="text-2xl font-bold text-heading mt-2 mb-8">New user</h1>
      <UserForm action={createUser} mode="create" roles={roles} permissions={perms} submitLabel="Create user" />
    </div>
  );
}
