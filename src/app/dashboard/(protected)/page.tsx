import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export default async function DashboardOverview() {
  const [openLeads, totalLeads, products, unpriced, projects] = await Promise.all([
    prisma.lead.count({ where: { status: { not: 'closed' } } }),
    prisma.lead.count(),
    prisma.product.count(),
    prisma.product.count({ where: { price: 0 } }),
    prisma.project.count(),
  ]);

  const cards = [
    { label: 'Open leads', value: openLeads, href: '/dashboard/leads' },
    { label: 'Total leads', value: totalLeads, href: '/dashboard/leads' },
    { label: 'Products', value: products, href: '/dashboard/products' },
    { label: 'Products without price', value: unpriced, href: '/dashboard/products?unpriced=1' },
    { label: 'Projects', value: projects, href: null },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-heading mb-8">Overview</h1>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((card) => {
          const body = (
            <div className="bg-surface rounded-xl border border-line p-6 hover:border-accent/60 transition-colors">
              <p className="text-3xl font-bold text-heading">{card.value}</p>
              <p className="text-muted text-sm mt-1">{card.label}</p>
            </div>
          );
          return card.href ? (
            <Link key={card.label} href={card.href}>
              {body}
            </Link>
          ) : (
            <div key={card.label}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}
