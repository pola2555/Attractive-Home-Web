import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getCatalogFilterConfig, DEFAULT_CATALOG_FILTERS, FILTER_WIDGETS } from '@/lib/catalogConfig';
import CatalogFiltersForm from './CatalogFiltersForm';
import { updateCatalogFilters } from './actions';

// English facet names for the editor (the dashboard is English-only).
const FACET_LABELS: Record<string, string> = {
  type: 'Type',
  material: 'Material',
  look: 'Look',
  color: 'Colour',
  application: 'Application',
  size: 'Size',
  collection: 'Collection',
  brand: 'Brand',
  source: 'Source',
};

export default async function CatalogFiltersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('catalog.write')) redirect('/dashboard');

  const [{ saved }, config] = await Promise.all([searchParams, getCatalogFilterConfig()]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-heading mb-1">Catalog filters</h1>
      <p className="text-muted text-sm mb-8 max-w-2xl">
        Choose which filters appear in the catalog sidebar, their order, the widget each uses, and an optional
        custom label. Facets with no matching products are hidden automatically. Changes apply to the live
        catalog after saving.
      </p>

      {saved && <p className="mb-6 text-sm text-green-500">Saved. The catalog sidebar has been updated.</p>}

      <CatalogFiltersForm
        action={updateCatalogFilters}
        initial={config}
        defaults={DEFAULT_CATALOG_FILTERS}
        facetLabels={FACET_LABELS}
        widgets={[...FILTER_WIDGETS]}
      />
    </div>
  );
}
