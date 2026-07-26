import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { FACET_TYPES, facetLabel, facetCounts } from '@/lib/facetsAdmin';

// Facet vocabularies overview — the ten lookup lists that classify and filter
// products (docs/DATABASE.md §5).
export default async function FacetsOverviewPage() {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('catalog.read')) redirect('/dashboard');

  const counts = await facetCounts();

  return (
    <div>
      <h1 className="text-2xl font-bold text-heading mb-2">Facets</h1>
      <p className="text-muted mb-8">Vocabularies that classify products and drive the catalog filters.</p>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {FACET_TYPES.map((t) => (
          <Link
            key={t}
            href={`/dashboard/facets/${t}`}
            className="flex items-center justify-between bg-surface rounded-lg border border-line p-4 hover:border-accent/60 transition-colors"
          >
            <span className="text-ink font-medium">{facetLabel(t)}</span>
            <span className="text-muted text-sm">{counts[t]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
