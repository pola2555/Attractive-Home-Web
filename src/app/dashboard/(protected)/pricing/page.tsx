import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { listOptionGroups, listTemplates } from '@/lib/configuratorAdmin';

// The pricing hub. `pricing.write` is deliberately NOT `catalog.write`: the
// data-entry role holds catalog.write, and everything reachable from here
// exposes cost basis and margins.
export default async function PricingPage() {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('pricing.write')) redirect('/dashboard');

  const [templates, groups, hsCount, freightCount, storageCount] = await Promise.all([
    listTemplates(),
    listOptionGroups(),
    prisma.hsCode.count(),
    prisma.freightRate.count(),
    prisma.portStorageRate.count(),
  ]);

  const cards = [
    {
      href: '/dashboard/pricing/templates',
      title: 'Product templates',
      body: `${templates.length} template${templates.length === 1 ? '' : 's'}`,
      hint: 'The option tree, derived quantities and pricing rules for a configurable product.',
    },
    {
      href: '/dashboard/pricing/options',
      title: 'Option vocabulary',
      body: `${groups.length} group${groups.length === 1 ? '' : 's'}`,
      hint: 'Thickness, material, colour and the values each can take. Shared across templates.',
    },
    {
      href: '/dashboard/pricing/rates',
      title: 'Rate cards',
      body: `${hsCount} HS codes · ${freightCount} freight · ${storageCount} storage`,
      hint: 'Customs duty, freight and port storage for the China to UAE lane.',
    },
  ];

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-heading mb-2">Pricing</h1>
      <p className="text-muted text-sm mb-6">
        Internal cost basis and margins. Nothing here is ever shown to a customer.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="block border border-line rounded-lg p-4 bg-surface/40 hover:border-accent/60 transition-colors"
          >
            <h2 className="text-heading font-medium">{card.title}</h2>
            <p className="text-ink text-sm mt-1">{card.body}</p>
            <p className="text-muted text-xs mt-2">{card.hint}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
