import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { listAdminPages } from '@/lib/sitePagesAdmin';
import VisibilityToggles from './VisibilityToggles';

// Manage the public "outer" pages — hide/show, where they appear, and (via the
// editor) their menu name, SEO and body text. The home page's visibility is
// locked (its toggle is disabled and the server refuses to hide it).
export default async function PagesDashboard() {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('pages.write')) redirect('/dashboard');

  const pages = await listAdminPages();

  return (
    <div>
      <h1 className="text-2xl font-bold text-heading mb-2">Pages</h1>
      <p className="text-muted mb-8 max-w-2xl">
        Control the public website pages: hide one (it returns a 404 and drops out of the menu and
        footer), choose where it appears, and open a page to rename its menu label or edit its SEO
        and text — in every language.
      </p>

      <div className="space-y-3">
        {pages.map((p) => (
          <div
            key={p.key}
            className="flex flex-col gap-4 rounded-xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-[10rem]">
              <div className="flex items-center gap-2">
                <span className="font-medium text-heading">{p.title}</span>
                {!p.isPublished && (
                  <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
                    Hidden
                  </span>
                )}
              </div>
              <span className="font-mono text-xs text-muted">{p.path || '/'}</span>
            </div>

            <VisibilityToggles
              row={{
                key: p.key,
                canHide: p.canHide,
                navEligible: p.navEligible,
                footerEligible: p.footerEligible,
                isPublished: p.isPublished,
                showInNav: p.showInNav,
                showInFooter: p.showInFooter,
              }}
            />

            <div className="flex items-center gap-4 text-sm">
              <a
                href={`/en${p.path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted hover:text-heading hover:underline"
              >
                View ↗
              </a>
              <Link
                href={`/dashboard/pages/${p.key}/edit`}
                className="rounded-lg border border-line-strong px-3 py-1.5 text-accent hover:bg-surface/60"
              >
                Edit
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
