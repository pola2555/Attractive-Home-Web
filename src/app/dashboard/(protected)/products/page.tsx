import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { updateProductPrice } from './actions';

const PAGE_SIZE = 50;

// Product price entry: search by code/name (trigram-indexed), inline
// price + unit editing. `?unpriced=1` narrows to products still at 0.
export default async function DashboardProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; unpriced?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('catalog.read')) redirect('/dashboard');
  const canWrite = permissions.has('catalog.write');

  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const unpriced = sp.unpriced === '1';
  const page = Math.max(1, Number(sp.page) || 1);

  const where = {
    ...(unpriced ? { price: 0 } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: 'insensitive' as const } },
            { legacyId: { contains: q, mode: 'insensitive' as const } },
            { translations: { some: { name: { contains: q, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { legacyId: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { translations: { where: { localeCode: 'en' } } },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (p: number) =>
    `/dashboard/products?${new URLSearchParams({
      ...(q ? { q } : {}),
      ...(unpriced ? { unpriced: '1' } : {}),
      ...(p > 1 ? { page: String(p) } : {}),
    }).toString()}`;

  return (
    <div>
      <h1 className="text-2xl font-bold text-heading mb-6">Products — price entry</h1>

      <form method="get" className="flex flex-wrap gap-3 mb-6">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder={`Search ${total} products by code or name…`}
          className="w-full max-w-md px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {unpriced && <input type="hidden" name="unpriced" value="1" />}
        <Link
          href={unpriced ? '/dashboard/products' : '/dashboard/products?unpriced=1'}
          className={`px-3 py-2 rounded-full text-sm border ${unpriced ? 'border-accent text-heading bg-accent-2/10' : 'border-line text-ink hover:border-accent/60'}`}
        >
          Without price
        </Link>
      </form>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-muted border-b border-line">
            <th className="text-start py-2 pe-4">ID</th>
            <th className="text-start py-2 pe-4">Code</th>
            <th className="text-start py-2 pe-4">Name (en)</th>
            <th className="text-start py-2 pe-4">Price (AED)</th>
            <th className="text-start py-2 pe-4">Unit</th>
            {canWrite && <th className="text-start py-2">Save</th>}
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-b border-line/50 hover:bg-surface/60">
              <td className="py-2 pe-4 text-muted">{product.legacyId}</td>
              <td className="py-2 pe-4">{product.code ?? '—'}</td>
              <td className="py-2 pe-4">{product.translations[0]?.name ?? '—'}</td>
              {canWrite ? (
                <>
                  <td className="py-2 pe-4">
                    <input
                      form={`price-${product.id}`}
                      name="price"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={Number(product.price) || ''}
                      className="w-28 px-2 py-1 bg-surface text-ink rounded border border-line-strong"
                    />
                  </td>
                  <td className="py-2 pe-4">
                    <input
                      form={`price-${product.id}`}
                      name="priceUnit"
                      type="text"
                      defaultValue={product.priceUnit ?? ''}
                      placeholder="per m² / box / piece"
                      className="w-36 px-2 py-1 bg-surface text-ink rounded border border-line-strong"
                    />
                  </td>
                  <td className="py-2">
                    <form id={`price-${product.id}`} action={updateProductPrice.bind(null, product.id)}>
                      <button className="px-3 py-1 rounded bg-brand-brown hover:bg-brand-brown-hover text-white text-xs">
                        Save
                      </button>
                    </form>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 pe-4">{Number(product.price) || '—'}</td>
                  <td className="py-2 pe-4">{product.priceUnit ?? '—'}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-4 mt-8" aria-label="Pagination">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="px-4 py-2 rounded-lg bg-surface border border-line text-ink">
              Previous
            </Link>
          )}
          <span className="text-muted text-sm">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="px-4 py-2 rounded-lg bg-surface border border-line text-ink">
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
