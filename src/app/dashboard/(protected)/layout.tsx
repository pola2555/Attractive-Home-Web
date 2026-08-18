import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { signOut } from '@/lib/auth';
import DashboardNav from './DashboardNav';
import DashboardGuard from './DashboardGuard';

// Auth gate for everything under /dashboard except /dashboard/login. The
// stamp/is_active checks live in requireUser() (docs/DATABASE.md §4).
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);

  const nav = [
    { label: 'Overview', href: '/dashboard', show: true },
    { label: 'Leads', href: '/dashboard/leads', show: permissions.has('leads.read') },
    { label: 'Products', href: '/dashboard/products', show: permissions.has('catalog.read') },
    { label: 'Facets', href: '/dashboard/facets', show: permissions.has('catalog.read') },
    { label: 'Catalog filters', href: '/dashboard/catalog-filters', show: permissions.has('catalog.write') },
    { label: 'Portfolio', href: '/dashboard/portfolio', show: permissions.has('portfolio.write') },
    { label: 'Services', href: '/dashboard/services', show: permissions.has('content.write') },
    { label: 'Content', href: '/dashboard/content', show: permissions.has('content.write') },
    { label: 'Settings', href: '/dashboard/settings', show: permissions.has('settings.write') },
    { label: 'Users', href: '/dashboard/users', show: permissions.has('users.manage') },
    { label: 'Customers', href: '/dashboard/customers', show: permissions.has('users.manage') },
    { label: 'Audit log', href: '/dashboard/audit', show: permissions.has('audit.read') },
  ].filter((item) => item.show);

  return (
    <DashboardGuard>
      <div className="min-h-screen flex">
        <aside className="w-56 shrink-0 bg-bg-deep border-e border-line p-6 flex flex-col gap-6">
          <Link href="/" className="self-start" title="Go to website" aria-label="Go to website">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Logo EN.webp" alt="Attractive Home" className="h-12 w-auto" />
          </Link>
          <DashboardNav items={nav} />
          <div className="mt-auto space-y-3">
            <p className="text-muted text-xs break-all">{user.email}</p>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/dashboard/login' });
              }}
            >
              <button className="text-sm text-accent hover:underline">Sign out</button>
            </form>
          </div>
        </aside>
        <main className="flex-1 p-8 overflow-x-auto">{children}</main>
      </div>
    </DashboardGuard>
  );
}
