import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { isFacetType, listFacetValues, facetLabel, facetSingular, facetHasHex } from '@/lib/facetsAdmin';
import DeleteButton from '../../products/DeleteButton';
import FacetValueForm from './FacetValueForm';
import { createFacet, toggleFacet, deleteFacet } from './actions';

export default async function FacetValuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ facet: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { facet } = await params;
  if (!isFacetType(facet)) notFound();

  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('catalog.read')) redirect('/dashboard');
  const canWrite = permissions.has('catalog.write');

  const [values, sp] = await Promise.all([listFacetValues(facet), searchParams]);
  const hasHex = facetHasHex(facet);

  return (
    <div>
      <Link href="/dashboard/facets" className="text-sm text-accent hover:underline">
        ← Facets
      </Link>
      <h1 className="text-2xl font-bold text-heading mt-2 mb-6">{facetLabel(facet)}</h1>

      {sp.error === 'in-use' && (
        <p className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-200 text-sm">
          That value is still used by products — deactivate it instead of deleting.
        </p>
      )}

      {canWrite && (
        <details className="mb-8 bg-surface/50 rounded-lg border border-line p-4">
          <summary className="cursor-pointer text-heading font-medium">Add a {facetSingular(facet).toLowerCase()}</summary>
          <div className="mt-4">
            <FacetValueForm action={createFacet.bind(null, facet)} hasHex={hasHex} submitLabel="Add value" />
          </div>
        </details>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-muted border-b border-line">
            <th className="text-start py-2 pe-4">Code</th>
            <th className="text-start py-2 pe-4">Name (en)</th>
            <th className="text-start py-2 pe-4">Uses</th>
            <th className="text-start py-2 pe-4">Order</th>
            <th className="text-start py-2 pe-4">Active</th>
            {canWrite && <th className="text-start py-2">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {values.map((v) => (
            <tr key={v.id} className="border-b border-line/50 hover:bg-surface/60">
              <td className="py-2 pe-4">
                <span className="inline-flex items-center gap-2">
                  {hasHex && (
                    <span
                      className="inline-block w-4 h-4 rounded-full border border-line-strong align-middle"
                      style={{ backgroundColor: v.hex ?? 'transparent' }}
                    />
                  )}
                  {v.code}
                </span>
              </td>
              <td className="py-2 pe-4">{v.name}</td>
              <td className="py-2 pe-4 text-muted">{v.uses}</td>
              <td className="py-2 pe-4 text-muted">{v.sortOrder}</td>
              <td className="py-2 pe-4">
                {canWrite ? (
                  <form action={toggleFacet.bind(null, facet, v.id, !v.isActive)}>
                    <button
                      className={`px-2 py-0.5 rounded-full text-xs border ${v.isActive ? 'border-green-500/50 text-green-300' : 'border-line text-muted'}`}
                    >
                      {v.isActive ? 'Active' : 'Hidden'}
                    </button>
                  </form>
                ) : v.isActive ? (
                  'Yes'
                ) : (
                  'No'
                )}
              </td>
              {canWrite && (
                <td className="py-2">
                  <div className="flex items-center gap-3">
                    <Link href={`/dashboard/facets/${facet}/${v.id}/edit`} className="text-accent hover:underline">
                      Edit
                    </Link>
                    <DeleteButton
                      action={deleteFacet.bind(null, facet, v.id)}
                      confirmText={`Delete "${v.code}"? Products using it will keep working (the link is cleared).`}
                      label="Delete"
                      className="text-red-300 hover:text-red-200 text-sm"
                    />
                  </div>
                </td>
              )}
            </tr>
          ))}
          {values.length === 0 && (
            <tr>
              <td colSpan={canWrite ? 6 : 5} className="py-8 text-center text-muted">
                No values yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
