'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { label: string; href: string };

// The sidebar navigation, split out as a client component so it can shade the
// section the user is currently in. Overview matches only the exact dashboard
// root; every other item also matches its sub-routes (e.g. a product edit page
// keeps "Products" highlighted).
function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'px-3 py-2 rounded-lg bg-accent-2/15 text-heading font-medium border-s-2 border-accent'
                : 'px-3 py-2 rounded-lg text-ink hover:bg-accent-2/10 hover:text-heading transition-colors'
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
