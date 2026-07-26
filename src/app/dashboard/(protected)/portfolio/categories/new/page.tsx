import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import CategoryForm from '../../CategoryForm';
import { createCategory } from '../../actions';

export default async function NewCategoryPage() {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('portfolio.write')) redirect('/dashboard/portfolio');

  return (
    <div>
      <Link href="/dashboard/portfolio" className="text-sm text-accent hover:underline">
        ← Portfolio
      </Link>
      <h1 className="text-2xl font-bold text-heading mt-2 mb-8">New category</h1>
      <CategoryForm action={createCategory} submitLabel="Create category" />
    </div>
  );
}
