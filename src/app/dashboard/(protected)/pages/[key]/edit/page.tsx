import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getPageEditData } from '@/lib/sitePagesAdmin';
import VisibilityToggles from '../../VisibilityToggles';
import PageEditForm from './PageEditForm';
import { savePageDetails } from '../../actions';

export default async function EditSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { key } = await params;
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('pages.write')) redirect('/dashboard');

  const [data, sp] = await Promise.all([getPageEditData(key), searchParams]);
  if (!data) notFound();

  return (
    <div>
      <Link href="/dashboard/pages" className="text-sm text-accent hover:underline">
        ← Pages
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-heading">{data.title}</h1>
        <span className="font-mono text-xs text-muted">{data.path || '/'}</span>
        <a
          href={`/en${data.path}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted hover:text-heading hover:underline"
        >
          View page ↗
        </a>
      </div>

      <section className="mb-8 rounded-xl border border-line p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Visibility</h2>
        <VisibilityToggles
          layout="stack"
          row={{
            key: data.key,
            canHide: data.canHide,
            navEligible: data.navEligible,
            footerEligible: data.footerEligible,
            isPublished: data.isPublished,
            showInNav: data.showInNav,
            showInFooter: data.showInFooter,
          }}
        />
        {!data.canHide && (
          <p className="mt-3 text-xs text-muted">
            The home page is the site’s front door and cannot be hidden.
          </p>
        )}
      </section>

      <PageEditForm action={savePageDetails.bind(null, data.key)} initial={data} saved={sp.saved === '1'} />
    </div>
  );
}
