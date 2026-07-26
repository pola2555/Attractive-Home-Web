import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { AuditAction } from '@prisma/client';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { listAudit } from '@/lib/auditAdmin';

const PAGE_SIZE = 50;
const ACTIONS: AuditAction[] = ['create', 'update', 'delete', 'login', 'import'];

function formatDiff(diff: unknown): string {
  if (!diff || typeof diff !== 'object') return '';
  return Object.entries(diff as Record<string, unknown>)
    .map(([field, v]) => {
      if (v && typeof v === 'object' && 'from' in v && 'to' in v) {
        const { from, to } = v as { from: unknown; to: unknown };
        return `${field}: ${from === null ? '∅' : String(from)} → ${to === null ? '∅' : String(to)}`;
      }
      return `${field}: ${String(v)}`;
    })
    .join('  ·  ');
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; action?: string; page?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('audit.read')) redirect('/dashboard');

  const sp = await searchParams;
  const entityType = sp.entity?.trim() || undefined;
  const action = (ACTIONS.includes(sp.action as AuditAction) ? sp.action : undefined) as AuditAction | undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total, entityTypes } = await listAudit({ entityType, action, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (entityType) params.set('entity', entityType);
    if (action) params.set('action', action);
    if (nextPage > 1) params.set('page', String(nextPage));
    const s = params.toString();
    return `/dashboard/audit${s ? `?${s}` : ''}`;
  };

  const fmt = (d: Date) =>
    new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <h1 className="text-2xl font-bold text-heading mb-6">
        Audit log <span className="text-muted text-base font-normal">({total.toLocaleString()})</span>
      </h1>

      <form method="get" className="flex flex-wrap items-center gap-3 mb-6">
        <select name="entity" defaultValue={entityType ?? ''} className="px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong text-sm">
          <option value="">All entities</option>
          {entityTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select name="action" defaultValue={action ?? ''} className="px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong text-sm">
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button className="px-4 py-2 rounded-lg bg-surface border border-line text-ink text-sm">Filter</button>
      </form>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-muted border-b border-line">
            <th className="text-start py-2 pe-4 whitespace-nowrap">When</th>
            <th className="text-start py-2 pe-4">Who</th>
            <th className="text-start py-2 pe-4">Action</th>
            <th className="text-start py-2 pe-4">Entity</th>
            <th className="text-start py-2">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line/50 hover:bg-surface/60 align-top">
              <td className="py-2 pe-4 text-muted whitespace-nowrap">{fmt(r.createdAt)}</td>
              <td className="py-2 pe-4 text-muted">{r.actor}</td>
              <td className="py-2 pe-4">
                <span className="px-2 py-0.5 rounded-full text-xs border border-line text-ink">{r.action}</span>
              </td>
              <td className="py-2 pe-4 text-ink">
                {r.entityType}
                <span className="block text-muted text-xs font-mono break-all">{r.entityId}</span>
              </td>
              <td className="py-2 text-muted text-xs">{formatDiff(r.diff)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-muted">
                No audit entries match.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-4 mt-8" aria-label="Pagination">
          {page > 1 && (
            <Link href={buildHref(page - 1)} className="px-4 py-2 rounded-lg bg-surface border border-line text-ink">
              Previous
            </Link>
          )}
          <span className="text-muted text-sm">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={buildHref(page + 1)} className="px-4 py-2 rounded-lg bg-surface border border-line text-ink">
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
