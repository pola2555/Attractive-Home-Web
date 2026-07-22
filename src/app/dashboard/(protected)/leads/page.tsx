import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LeadStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';

const STATUSES = ['new', 'contacted', 'closed'] as const;

// Leads inbox — newest first; the open-status filter uses the partial index
// (status, created_at DESC) WHERE status <> 'closed' (docs/DATABASE.md §7).
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('leads.read')) redirect('/dashboard');

  const { status } = await searchParams;
  const statusFilter = STATUSES.includes(status as LeadStatus) ? (status as LeadStatus) : undefined;

  const leads = await prisma.lead.findMany({
    where: statusFilter ? { status: statusFilter } : { status: { not: 'closed' } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      assignee: { select: { name: true } },
      product: { select: { slug: true, code: true } },
      _count: { select: { notes: true } },
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-heading mb-6">Leads</h1>

      <div className="flex gap-2 mb-6">
        <Link
          href="/dashboard/leads"
          className={`px-3 py-1 rounded-full text-sm border ${!statusFilter ? 'border-accent text-heading bg-accent-2/10' : 'border-line text-ink hover:border-accent/60'}`}
        >
          Open
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/dashboard/leads?status=${s}`}
            className={`px-3 py-1 rounded-full text-sm border capitalize ${statusFilter === s ? 'border-accent text-heading bg-accent-2/10' : 'border-line text-ink hover:border-accent/60'}`}
          >
            {s}
          </Link>
        ))}
      </div>

      {leads.length === 0 ? (
        <p className="text-muted">No leads here yet.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-start text-muted border-b border-line">
              <th className="text-start py-2 pe-4">Received</th>
              <th className="text-start py-2 pe-4">Name</th>
              <th className="text-start py-2 pe-4">Phone</th>
              <th className="text-start py-2 pe-4">Channel</th>
              <th className="text-start py-2 pe-4">Product</th>
              <th className="text-start py-2 pe-4">Status</th>
              <th className="text-start py-2 pe-4">Assigned</th>
              <th className="text-start py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-line/50 hover:bg-surface/60">
                <td className="py-2 pe-4 whitespace-nowrap">
                  <Link href={`/dashboard/leads/${lead.id}`} className="text-accent hover:underline">
                    {lead.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                  </Link>
                </td>
                <td className="py-2 pe-4">{lead.name}</td>
                <td className="py-2 pe-4" dir="ltr">
                  {lead.phone}
                </td>
                <td className="py-2 pe-4">{lead.channel}</td>
                <td className="py-2 pe-4">{lead.product?.code ?? '—'}</td>
                <td className="py-2 pe-4 capitalize">{lead.status}</td>
                <td className="py-2 pe-4">{lead.assignee?.name ?? '—'}</td>
                <td className="py-2">{lead._count.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
