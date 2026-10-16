import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getFacetOptions } from '@/lib/catalogAdmin';
import ProductForm from '../ProductForm';
import NewTreeProductForm from '../NewTreeProductForm';
import NewMeasureProductForm from '../NewMeasureProductForm';
import { createProduct } from '../actions';

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('catalog.write')) redirect('/dashboard/products');

  const canPrice = permissions.has('pricing.write');
  const sp = await searchParams;
  const isTree = sp.type === 'tree' && canPrice;
  const isMeasure = sp.type === 'measure';
  const facets = await getFacetOptions();

  // Existing tree products, offered as templates to copy from.
  const treeProducts = isTree
    ? (
        await prisma.product.findMany({
          where: { kind: 'made_to_order', templateId: { not: null } },
          select: {
            id: true,
            translations: { where: { localeCode: 'en' }, select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      ).map((p) => ({ id: p.id, name: p.translations[0]?.name ?? 'Untitled' }))
    : [];

  const cardBase = 'flex-1 rounded-lg border p-4 transition-colors';
  const active = 'border-accent bg-accent-2/10';
  const idle = 'border-line hover:border-accent/60';

  return (
    <div>
      <Link href="/dashboard/products" className="text-sm text-accent hover:underline">
        ← Products
      </Link>
      <h1 className="text-2xl font-bold text-heading mt-2 mb-6">New product</h1>

      <div className="flex flex-col sm:flex-row gap-3 mb-8 max-w-4xl">
        <Link
          href="/dashboard/products/new"
          className={`${cardBase} ${!isTree && !isMeasure ? active : idle}`}
        >
          <div className="font-medium text-heading">Regular product</div>
          <p className="text-muted text-sm mt-1">
            One product with a fixed price and the usual catalog fields.
          </p>
        </Link>
        {canPrice && (
          <Link
            href="/dashboard/products/new?type=tree"
            className={`${cardBase} ${isTree ? active : idle}`}
          >
            <div className="font-medium text-heading">
              Tree product <span className="text-muted font-normal">(configurable)</span>
            </div>
            <p className="text-muted text-sm mt-1">
              Priced by choices — frames, sizes, colours, add-ons. Built on a canvas.
            </p>
          </Link>
        )}
        <Link
          href="/dashboard/products/new?type=measure"
          className={`${cardBase} ${isMeasure ? active : idle}`}
        >
          <div className="font-medium text-heading">
            By-measure item <span className="text-muted font-normal">(per m², piece…)</span>
          </div>
          <p className="text-muted text-sm mt-1">
            Sold by a unit. Priced as amount × unit price, with a fractional amount allowed.
          </p>
        </Link>
      </div>

      {isTree ? (
        <NewTreeProductForm sources={facets.sources} treeProducts={treeProducts} />
      ) : isMeasure ? (
        <NewMeasureProductForm sources={facets.sources} />
      ) : (
        <ProductForm action={createProduct} facets={facets} submitLabel="Create product" />
      )}
    </div>
  );
}
