import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { isFacetType, getFacetValue, facetLabel, facetSingular, facetHasHex } from '@/lib/facetsAdmin';
import DeleteButton from '../../../../products/DeleteButton';
import FacetValueForm from '../../FacetValueForm';
import { updateFacet, deleteFacet } from '../../actions';

export default async function EditFacetValuePage({
  params,
}: {
  params: Promise<{ facet: string; id: string }>;
}) {
  const { facet, id } = await params;
  if (!isFacetType(facet)) notFound();

  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('catalog.write')) redirect(`/dashboard/facets/${facet}`);

  const value = await getFacetValue(facet, id);
  if (!value) notFound();

  return (
    <div>
      <Link href={`/dashboard/facets/${facet}`} className="text-sm text-accent hover:underline">
        ← {facetLabel(facet)}
      </Link>
      <div className="flex items-start justify-between mt-2 mb-6 gap-4">
        <h1 className="text-2xl font-bold text-heading">
          Edit {facetSingular(facet).toLowerCase()}: {value.code}
        </h1>
        <DeleteButton
          action={deleteFacet.bind(null, facet, id)}
          confirmText={`Delete "${value.code}"?`}
        />
      </div>

      <FacetValueForm
        action={updateFacet.bind(null, facet, id)}
        initial={value}
        hasHex={facetHasHex(facet)}
        submitLabel="Save changes"
      />
    </div>
  );
}
