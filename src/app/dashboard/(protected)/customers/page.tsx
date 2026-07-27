import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { listCustomers, topFavoritedProducts } from '@/lib/customersAdmin';

const PAGE_SIZE = 50;

export default async function CustomersDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('users.manage')) redirect('/dashboard');

  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ rows, total }, top] = await Promise.all([
    listCustomers({ q, page, pageSize: PAGE_SIZE }),
    topFavoritedProducts(10),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (nextPage > 1) params.set('page', String(nextPage));
    const s = params.toString();
    return `/dashboard/customers${s ? `?${s}` : ''}`;
  };
  const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  return (
    <div>
      <h1 className="text-2xl font-bold text-heading mb-6">
        Customers <span className="text-muted text-base font-normal">({total.toLocaleString()})</span>
      </h1>

      <div className="grid lg:grid-cols-[1fr_18rem] gap-8 items-start">
        <div>
          <form method="get" className="mb-6">
            <input
              type="search"
              name="q"
              defaultValue={q ?? ''}
              placeholder="Search by email or name…"
              className="w-full max-w-md px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </form>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-muted border-b border-line">
                <th className="text-start py-2 pe-4">Email</th>
                <th className="text-start py-2 pe-4">Name</th>
                <th className="text-start py-2 pe-4">Favorites</th>
                <th className="text-start py-2 pe-4">Status</th>
                <th className="text-start py-2 pe-4">Joined</th>
                <th className="text-start py-2">Last login</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-line/50 hover:bg-surface/60">
                  <td className="py-2 pe-4 text-ink">{c.email}</td>
                  <td className="py-2 pe-4 text-muted">{c.name ?? '—'}</td>
                  <td className="py-2 pe-4 text-muted">{c.favoriteCount}</td>
                  <td className="py-2 pe-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${c.isActive ? 'border-green-500/50 text-green-300' : 'border-line text-muted'}`}>
                      {c.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="py-2 pe-4 text-muted">{fmt(c.createdAt)}</td>
                  <td className="py-2 text-muted">{fmt(c.lastLoginAt)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted">
                    No customers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-4 mt-8" aria-label="Pagination">
              {page > 1 && (
                <Link href={buildHref(page - 1)} className="px-4 py-2 rounded-lg bg-surface border border-line text-ink">
                  Previous
                </Link>
              )}
              <span className="text-muted text-sm">
                {page} / {totalPages}
              </span>
              {page < totalPages && (
                <Link href={buildHref(page + 1)} className="px-4 py-2 rounded-lg bg-surface border border-line text-ink">
                  Next
                </Link>
              )}
            </nav>
          )}
        </div>

        <aside className="bg-surface rounded-lg border border-line p-4">
          <h2 className="text-sm font-semibold text-heading mb-3">Most saved products</h2>
          {top.length === 0 ? (
            <p className="text-muted text-sm">No favorites yet.</p>
          ) : (
            <ol className="space-y-2">
              {top.map((p) => (
                <li key={p.productId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink truncate" title={p.name}>
                    {p.name}
                  </span>
                  <span className="text-muted shrink-0">{p.count}</span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}
