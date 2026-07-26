import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { listProjects, categoryOptions } from '@/lib/portfolioAdmin';
import DeleteButton from '../../products/DeleteButton';
import { toggleProject, deleteProject } from '../actions';

const PAGE_SIZE = 40;

export default async function DashboardProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('portfolio.write')) redirect('/dashboard');

  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const categoryId = sp.category?.trim() || undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ rows, total }, categories] = await Promise.all([
    listProjects({ q, categoryId, page, pageSize: PAGE_SIZE }),
    categoryOptions(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (o: { category?: string; page?: number }) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    const cat = o.category ?? categoryId;
    if (cat) params.set('category', cat);
    if ((o.page ?? 1) > 1) params.set('page', String(o.page));
    const s = params.toString();
    return `/dashboard/portfolio/projects${s ? `?${s}` : ''}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/portfolio" className="text-sm text-accent hover:underline">
            ← Portfolio
          </Link>
          <h1 className="text-2xl font-bold text-heading">
            Projects <span className="text-muted text-base font-normal">({total.toLocaleString()})</span>
          </h1>
        </div>
        <Link
          href="/dashboard/portfolio/projects/new"
          className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white text-sm"
        >
          + New project
        </Link>
      </div>

      <form method="get" className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search projects by title or slug…"
          className="flex-1 min-w-[16rem] max-w-md px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <select
          name="category"
          defaultValue={categoryId ?? ''}
          className="px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button className="px-4 py-2 rounded-lg bg-surface border border-line text-ink text-sm">Filter</button>
      </form>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-muted border-b border-line">
            <th className="text-start py-2 pe-4 w-16"></th>
            <th className="text-start py-2 pe-4">Title</th>
            <th className="text-start py-2 pe-4">Category</th>
            <th className="text-start py-2 pe-4">Map</th>
            <th className="text-start py-2 pe-4">Order</th>
            <th className="text-start py-2 pe-4">Published</th>
            <th className="text-start py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-line/50 hover:bg-surface/60">
              <td className="py-2 pe-4">
                <div className="w-14 h-10 rounded bg-surface-2 overflow-hidden">
                  {p.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                  )}
                </div>
              </td>
              <td className="py-2 pe-4 text-ink">
                {p.title}
                <span className="block text-muted text-xs">{p.slug}</span>
              </td>
              <td className="py-2 pe-4 text-muted">{p.categoryTitle}</td>
              <td className="py-2 pe-4">
                <span title={p.hasCoords ? 'Has coordinates' : 'No coordinates — hidden from the map'}>
                  {p.hasCoords ? '📍' : '—'}
                </span>
              </td>
              <td className="py-2 pe-4 text-muted">{p.sortOrder}</td>
              <td className="py-2 pe-4">
                <form action={toggleProject.bind(null, p.id, !p.isPublished)}>
                  <button
                    className={`px-2 py-0.5 rounded-full text-xs border ${p.isPublished ? 'border-green-500/50 text-green-300' : 'border-line text-muted'}`}
                  >
                    {p.isPublished ? 'Published' : 'Hidden'}
                  </button>
                </form>
              </td>
              <td className="py-2">
                <div className="flex items-center gap-3">
                  <Link href={`/dashboard/portfolio/projects/${p.id}/edit`} className="text-accent hover:underline">
                    Edit
                  </Link>
                  <DeleteButton
                    action={deleteProject.bind(null, p.id)}
                    confirmText={`Delete "${p.title}"? This removes its sections and media.`}
                    label="Delete"
                    className="text-red-300 hover:text-red-200 text-sm"
                  />
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-muted">
                No projects found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-4 mt-8" aria-label="Pagination">
          {page > 1 && (
            <Link href={buildHref({ page: page - 1 })} className="px-4 py-2 rounded-lg bg-surface border border-line text-ink">
              Previous
            </Link>
          )}
          <span className="text-muted text-sm">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={buildHref({ page: page + 1 })} className="px-4 py-2 rounded-lg bg-surface border border-line text-ink">
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
