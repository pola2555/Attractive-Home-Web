import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { isFacetType, listFacetValues, facetLabel, facetSingular, facetHasHex } from '@/lib/facetsAdmin';
import FacetTable from './FacetTable';

export default async function FacetValuesPage({ params }: { params: Promise<{ facet: string }> }) {
  const { facet } = await params;
  if (!isFacetType(facet)) notFound();

  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('catalog.read')) redirect('/dashboard');
  const canWrite = permissions.has('catalog.write');

  const values = await listFacetValues(facet);

  return (
    <div>
      <Link href="/dashboard/facets" className="text-sm text-accent hover:underline">
        ← Facets
      </Link>
      <h1 className="text-2xl font-bold text-heading mt-2 mb-1">
        {facetLabel(facet)} <span className="text-muted text-base font-normal">({values.length})</span>
      </h1>
      <p className="text-muted text-sm mb-6 max-w-2xl">
        Edit any cell and press <b>Save</b>. Reorder with the arrows, toggle visibility with the status pill, expand
        <b> langs</b> for other-language names, and add new values in the bottom row. Values still used by products can
        be hidden but not deleted.
      </p>

      <FacetTable
        facet={facet}
        values={values}
        hasHex={facetHasHex(facet)}
        singular={facetSingular(facet)}
        canWrite={canWrite}
      />
    </div>
  );
}
