import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getCategoryForEdit } from '@/lib/portfolioAdmin';
import DeleteButton from '../../../../products/DeleteButton';
import CategoryForm from '../../../CategoryForm';
import { updateCategory, deleteCategory } from '../../../actions';

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('portfolio.write')) redirect('/dashboard/portfolio');

  const category = await getCategoryForEdit(id);
  if (!category) notFound();

  return (
    <div>
      <Link href="/dashboard/portfolio" className="text-sm text-accent hover:underline">
        ← Portfolio
      </Link>
      <div className="flex items-start justify-between mt-2 mb-8 gap-4">
        <h1 className="text-2xl font-bold text-heading">Edit category</h1>
        <DeleteButton action={deleteCategory.bind(null, id)} confirmText={`Delete "${category.slug}"?`} />
      </div>
      <CategoryForm action={updateCategory.bind(null, id)} initial={category} submitLabel="Save changes" />
    </div>
  );
}
