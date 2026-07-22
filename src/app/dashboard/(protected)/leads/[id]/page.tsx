import { notFound, redirect } from 'next/navigation';
import { LeadStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { updateLeadStatus, assignLeadToMe, addLeadNote } from '../actions';

const STATUSES: LeadStatus[] = ['new', 'contacted', 'closed'];

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('leads.read')) redirect('/dashboard');
  const canWrite = permissions.has('leads.write');

  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      assignee: { select: { name: true, email: true } },
      product: { select: { slug: true, code: true, translations: { where: { localeCode: 'en' } } } },
      project: { select: { slug: true, translations: { where: { localeCode: 'en' } } } },
      notes: { orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } },
    },
  });
  if (!lead) notFound();

  const facts: { label: string; value: string | null }[] = [
    { label: 'Received', value: lead.createdAt.toISOString().slice(0, 19).replace('T', ' ') },
    { label: 'Name', value: lead.name },
    { label: 'Phone', value: lead.phone },
    { label: 'Email', value: lead.email },
    { label: 'Message', value: lead.message },
    { label: 'Channel', value: lead.channel },
    { label: 'Language', value: lead.localeCode },
    { label: 'Source page', value: lead.sourcePath },
    { label: 'Product', value: lead.product ? `${lead.product.translations[0]?.name ?? ''} (${lead.product.code ?? lead.product.slug})` : null },
    { label: 'Project', value: lead.project?.translations[0]?.title ?? null },
    { label: 'Assigned to', value: lead.assignee ? `${lead.assignee.name} <${lead.assignee.email}>` : null },
  ];

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-heading">
          Lead — {lead.name} <span className="capitalize text-muted text-lg">({lead.status})</span>
        </h1>
      </div>

      <dl className="divide-y divide-line border-y border-line">
        {facts
          .filter((f) => f.value)
          .map((f) => (
            <div key={f.label} className="flex gap-6 py-2 text-sm">
              <dt className="text-muted w-32 shrink-0">{f.label}</dt>
              <dd className="text-ink" dir="auto">
                {f.value}
              </dd>
            </div>
          ))}
      </dl>

      {canWrite && (
        <div className="flex flex-wrap gap-3">
          {STATUSES.filter((s) => s !== lead.status).map((s) => (
            <form
              key={s}
              action={async () => {
                'use server';
                await updateLeadStatus(id, s);
              }}
            >
              <button className="px-4 py-2 rounded-lg bg-surface border border-line hover:border-accent/60 text-ink capitalize">
                Mark {s}
              </button>
            </form>
          ))}
          {lead.assignedTo !== user.id && (
            <form
              action={async () => {
                'use server';
                await assignLeadToMe(id);
              }}
            >
              <button className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white">
                Assign to me
              </button>
            </form>
          )}
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-heading mb-4">Notes</h2>
        {lead.notes.length === 0 && <p className="text-muted text-sm mb-4">No notes yet.</p>}
        <ul className="space-y-3 mb-6">
          {lead.notes.map((note) => (
            <li key={note.id} className="bg-surface rounded-lg border border-line p-4">
              <p className="text-ink text-sm whitespace-pre-wrap">{note.body}</p>
              <p className="text-muted text-xs mt-2">
                {note.user?.name ?? 'Deleted user'} · {note.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
              </p>
            </li>
          ))}
        </ul>
        {canWrite && (
          <form action={addLeadNote.bind(null, id)} className="space-y-3">
            <textarea
              name="body"
              rows={3}
              required
              placeholder="Add a note…"
              className="w-full px-4 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white">
              Add note
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
