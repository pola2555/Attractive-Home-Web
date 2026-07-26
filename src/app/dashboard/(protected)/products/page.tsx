import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { productMediaUrl } from '@/lib/media';
import { updateProductPrice } from './actions';

const PAGE_SIZE = 50;

// Products manager — table view (with inline price entry) or card view, search
// by code/name (trigram-indexed), `?unpriced=1` narrows to un-priced products.
export default async function DashboardProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; unpriced?: string; view?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('catalog.read')) redirect('/dashboard');
  const canWrite = permissions.has('catalog.write');

  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const unpriced = sp.unpriced === '1';
  const view = sp.view === 'cards' ? 'cards' : 'table';
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
      include: {
        translations: { where: { localeCode: 'en' } },
        images: { where: { sortOrder: 0 }, take: 1 },
        source: { select: { code: true } },
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const thumb = (p: (typeof products)[number]) =>
    p.images[0] ? productMediaUrl(p.images[0].thumbKey ?? p.images[0].s3Key, p.source.code) : null;

  const buildHref = (o: { view?: string; unpriced?: boolean; page?: number }) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (o.unpriced ?? unpriced) params.set('unpriced', '1');
    if ((o.view ?? view) === 'cards') params.set('view', 'cards');
    if ((o.page ?? 1) > 1) params.set('page', String(o.page));
    const s = params.toString();
    return `/dashboard/products${s ? `?${s}` : ''}`;
  };

  const tabCls = (on: boolean) => `px-3 py-2 text-sm ${on ? 'bg-accent-2/15 text-heading font-medium' : 'text-ink hover:bg-accent-2/10'}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-heading">
          Products <span className="text-muted text-base font-normal">({total.toLocaleString()})</span>
        </h1>
        {canWrite && (
          <Link
            href="/dashboard/products/new"
            className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white text-sm"
          >
            + New product
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <form method="get" className="flex-1 min-w-[16rem]">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder={`Search ${total.toLocaleString()} products by code or name…`}
            className="w-full max-w-md px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {unpriced && <input type="hidden" name="unpriced" value="1" />}
          {view === 'cards' && <input type="hidden" name="view" value="cards" />}
        </form>

        <Link
          href={buildHref({ unpriced: !unpriced, page: 1 })}
          className={`px-3 py-2 rounded-full text-sm border ${unpriced ? 'border-accent text-heading bg-accent-2/10' : 'border-line text-ink hover:border-accent/60'}`}
        >
          Without price
        </Link>

        <div className="flex rounded-lg border border-line overflow-hidden">
          <Link href={buildHref({ view: 'table', page: 1 })} className={tabCls(view === 'table')}>
            Table
          </Link>
          <Link href={buildHref({ view: 'cards', page: 1 })} className={tabCls(view === 'cards')}>
            Cards
          </Link>
        </div>
      </div>

      {view === 'cards' ? (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
        >
          {products.map((product) => {
            const src = thumb(product);
            const name = product.translations[0]?.name ?? product.code ?? '—';
            return (
              <Link
                key={product.id}
                href={`/dashboard/products/${product.id}/edit`}
                className="group bg-surface rounded-lg overflow-hidden border border-line hover:border-accent/60 transition-colors"
              >
                <div className="relative aspect-square bg-surface-2">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-muted text-xs">No image</div>
                  )}
                  <span
                    title={product.isPublished ? 'Published' : 'Unpublished'}
                    className={`absolute top-2 end-2 w-2.5 h-2.5 rounded-full ${product.isPublished ? 'bg-green-500' : 'bg-line-strong'}`}
                  />
                </div>
                <div className="p-3">
                  <p className="text-ink text-sm font-medium truncate" title={name}>
                    {name}
                  </p>
                  <p className="text-muted text-xs mt-0.5 truncate">{product.code ?? product.legacyId}</p>
                  <p className="text-heading text-sm mt-1">
                    {Number(product.price) ? `${Number(product.price)} ${product.priceUnit ?? ''}` : '—'}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-muted border-b border-line">
              <th className="text-start py-2 pe-4 w-14"></th>
              <th className="text-start py-2 pe-4">Code</th>
              <th className="text-start py-2 pe-4">Name (en)</th>
              <th className="text-start py-2 pe-4">Price (AED)</th>
              <th className="text-start py-2 pe-4">Unit</th>
              {canWrite && <th className="text-start py-2 pe-4">Save</th>}
              <th className="text-start py-2">Edit</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const src = thumb(product);
              return (
                <tr key={product.id} className="border-b border-line/50 hover:bg-surface/60">
                  <td className="py-2 pe-4">
                    <div className="w-10 h-10 rounded bg-surface-2 overflow-hidden">
                      {src && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
                      )}
                    </div>
                  </td>
                  <td className="py-2 pe-4">{product.code ?? '—'}</td>
                  <td className="py-2 pe-4">
                    <span
                      title={product.isPublished ? 'Published' : 'Unpublished'}
                      className={`inline-block w-2 h-2 rounded-full me-2 align-middle ${product.isPublished ? 'bg-green-500' : 'bg-line-strong'}`}
                    />
                    {product.translations[0]?.name ?? '—'}
                  </td>
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
                  <td className="py-2">
                    <Link href={`/dashboard/products/${product.id}/edit`} className="text-accent hover:underline">
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

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
