import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { listCategories } from '@/lib/portfolioAdmin';
import DeleteButton from '../products/DeleteButton';
import { toggleCategory, deleteCategory } from './actions';

// Portfolio home — manage categories, and jump into the projects manager.
export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('portfolio.write')) redirect('/dashboard');

  const [categories, sp] = await Promise.all([listCategories(), searchParams]);
  const totalProjects = categories.reduce((n, c) => n + c.projectCount, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-heading">Portfolio</h1>
        <Link
          href="/dashboard/portfolio/projects"
          className="px-4 py-2 rounded-lg bg-surface border border-line text-ink text-sm hover:border-accent/60"
        >
          Projects ({totalProjects}) →
        </Link>
      </div>

      {sp.error === 'category-in-use' && (
        <p className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-200 text-sm">
          That category still has projects — move or delete them first, or just hide it.
        </p>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-heading">Categories</h2>
        <Link href="/dashboard/portfolio/categories/new" className="text-sm text-accent hover:underline">
          + New category
        </Link>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-muted border-b border-line">
            <th className="text-start py-2 pe-4">Title</th>
            <th className="text-start py-2 pe-4">Slug</th>
            <th className="text-start py-2 pe-4">Projects</th>
            <th className="text-start py-2 pe-4">Order</th>
            <th className="text-start py-2 pe-4">Published</th>
            <th className="text-start py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id} className="border-b border-line/50 hover:bg-surface/60">
              <td className="py-2 pe-4 text-ink">{c.title}</td>
              <td className="py-2 pe-4 text-muted">{c.slug}</td>
              <td className="py-2 pe-4">
                <Link href={`/dashboard/portfolio/projects?category=${c.id}`} className="text-accent hover:underline">
                  {c.projectCount}
                </Link>
              </td>
              <td className="py-2 pe-4 text-muted">{c.sortOrder}</td>
              <td className="py-2 pe-4">
                <form action={toggleCategory.bind(null, c.id, !c.isPublished)}>
                  <button
                    className={`px-2 py-0.5 rounded-full text-xs border ${c.isPublished ? 'border-green-500/50 text-green-300' : 'border-line text-muted'}`}
                  >
                    {c.isPublished ? 'Published' : 'Hidden'}
                  </button>
                </form>
              </td>
              <td className="py-2">
                <div className="flex items-center gap-3">
                  <Link href={`/dashboard/portfolio/categories/${c.id}/edit`} className="text-accent hover:underline">
                    Edit
                  </Link>
                  <DeleteButton
                    action={deleteCategory.bind(null, c.id)}
                    confirmText={`Delete "${c.title}"?`}
                    label="Delete"
                    className="text-red-300 hover:text-red-200 text-sm"
                  />
                </div>
              </td>
            </tr>
          ))}
          {categories.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-muted">
                No categories yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
