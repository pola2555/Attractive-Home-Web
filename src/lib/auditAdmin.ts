import 'server-only';
import { prisma } from './prisma';
import type { AuditAction } from '@prisma/client';

// Read-only audit log access (docs/DATABASE.md §7). Always paginated — the log
// grows unbounded — and filtered on the indexed columns.

export type AuditRow = {
  id: string;
  createdAt: Date;
  actor: string; // email, or 'system'
  action: AuditAction;
  entityType: string;
  entityId: string;
  diff: unknown;
};

export type AuditFilter = {
  entityType?: string;
  action?: AuditAction;
  page: number;
  pageSize: number;
};

export async function listAudit(
  filter: AuditFilter,
): Promise<{ rows: AuditRow[]; total: number; entityTypes: string[] }> {
  const where = {
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.action ? { action: filter.action } : {}),
  };

  const [total, entries, grouped] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      select: {
        id: true,
        createdAt: true,
        action: true,
        entityType: true,
        entityId: true,
        diff: true,
        user: { select: { email: true } },
      },
    }),
    prisma.auditLog.groupBy({ by: ['entityType'], orderBy: { entityType: 'asc' } }),
  ]);

  return {
    total,
    entityTypes: grouped.map((g) => g.entityType),
    rows: entries.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      actor: e.user?.email ?? 'system',
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      diff: e.diff,
    })),
  };
}
