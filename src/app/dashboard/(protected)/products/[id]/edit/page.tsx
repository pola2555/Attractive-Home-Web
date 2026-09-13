import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getFacetOptions, getProductForEdit } from '@/lib/catalogAdmin';
import ProductForm from '../../ProductForm';
import DeleteButton from '../../DeleteButton';
import { updateProduct, deleteProduct } from '../../actions';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('catalog.read')) redirect('/dashboard');
  const canWrite = permissions.has('catalog.write');
  const canPrice = permissions.has('pricing.write');

  const { id } = await params;
  const [facets, initial, cfg] = await Promise.all([
    getFacetOptions(),
    getProductForEdit(id),
    prisma.product.findUnique({ where: { id }, select: { templateId: true } }),
  ]);
  if (!initial) notFound();

  return (
    <div>
      <Link href="/dashboard/products" className="text-sm text-accent hover:underline">
        ← Products
      </Link>
      <div className="flex items-start justify-between mt-2 mb-1 gap-4">
        <h1 className="text-2xl font-bold text-heading">
          {initial.translations.en.name || 'Untitled product'}
        </h1>
        {canWrite && (
          <DeleteButton
            action={deleteProduct.bind(null, id)}
            confirmText="Delete this product permanently? This cannot be undone."
          />
        )}
      </div>
      <p className="text-muted text-sm mb-4">
        {initial.legacyId} ·{' '}
        <a
          href={`/en/products/${initial.slug}`}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          View live ↗
        </a>
      </p>

      {cfg?.templateId && canPrice && (
        <Link
          href={`/dashboard/products/${id}/tree`}
          className="inline-flex items-center gap-2 rounded-lg border border-accent/60 bg-accent-2/10 px-4 py-2 text-sm text-heading hover:border-accent mb-8"
        >
          🌳 Configurable product — open the tree canvas →
        </Link>
      )}

      {canWrite ? (
        <ProductForm
          action={updateProduct.bind(null, id)}
          facets={facets}
          initial={initial}
          submitLabel="Save changes"
        />
      ) : (
        <p className="text-muted">You have read-only access to the catalog.</p>
      )}
    </div>
  );
}
