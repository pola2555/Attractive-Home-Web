import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getFacetOptions } from '@/lib/catalogAdmin';
import ProductForm from '../ProductForm';
import { createProduct } from '../actions';

export default async function NewProductPage() {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('catalog.write')) redirect('/dashboard/products');

  const facets = await getFacetOptions();

  return (
    <div>
      <Link href="/dashboard/products" className="text-sm text-accent hover:underline">
        ← Products
      </Link>
      <h1 className="text-2xl font-bold text-heading mt-2 mb-8">New product</h1>
      <ProductForm action={createProduct} facets={facets} submitLabel="Create product" />
    </div>
  );
}
