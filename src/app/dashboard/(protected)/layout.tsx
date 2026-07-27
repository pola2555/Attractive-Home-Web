import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { signOut } from '@/lib/auth';

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
    { label: 'Portfolio', href: '/dashboard/portfolio', show: permissions.has('portfolio.write') },
    { label: 'Services', href: '/dashboard/services', show: permissions.has('content.write') },
    { label: 'Content', href: '/dashboard/content', show: permissions.has('content.write') },
    { label: 'Settings', href: '/dashboard/settings', show: permissions.has('settings.write') },
    { label: 'Users', href: '/dashboard/users', show: permissions.has('users.manage') },
    { label: 'Customers', href: '/dashboard/customers', show: permissions.has('users.manage') },
    { label: 'Audit log', href: '/dashboard/audit', show: permissions.has('audit.read') },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 bg-bg-deep border-e border-line p-6 flex flex-col gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Logo EN.webp" alt="Attractive Home" className="h-12 w-auto self-start" />
        <nav className="flex flex-col gap-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded-lg text-ink hover:bg-accent-2/10 hover:text-heading transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
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
  );
}
