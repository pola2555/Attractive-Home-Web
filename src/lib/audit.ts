import { uuidv7 } from 'uuidv7';
import { prisma } from './prisma';
import type { AuditAction, Prisma } from '@prisma/client';

// The single writeAudit() helper called from every admin mutation —
// docs/DATABASE.md §7. Append-only; entity_id is TEXT by design so entries
// survive entity deletion. userId NULL = system/import.
export async function writeAudit(entry: {
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  diff?: Record<string, { from: unknown; to: unknown }>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      id: uuidv7(),
      userId: entry.userId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      diff: entry.diff as Prisma.InputJsonValue | undefined,
    },
  });
}
