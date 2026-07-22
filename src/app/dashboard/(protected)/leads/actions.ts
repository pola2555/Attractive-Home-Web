'use server';

import { revalidatePath } from 'next/cache';
import { uuidv7 } from 'uuidv7';
import { LeadStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';

// All lead mutations require leads.write and produce audit_log rows
// (docs/DATABASE.md §4, §7).

export async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
  const user = await requirePermission('leads.write');
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.status === status) return;
  await prisma.lead.update({ where: { id: leadId }, data: { status } });
  await writeAudit({
    userId: user.id,
    entityType: 'lead',
    entityId: leadId,
    action: 'update',
    diff: { status: { from: lead.status, to: status } },
  });
  revalidatePath('/dashboard/leads');
  revalidatePath(`/dashboard/leads/${leadId}`);
}

export async function assignLeadToMe(leadId: string): Promise<void> {
  const user = await requirePermission('leads.write');
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.assignedTo === user.id) return;
  await prisma.lead.update({ where: { id: leadId }, data: { assignedTo: user.id } });
  await writeAudit({
    userId: user.id,
    entityType: 'lead',
    entityId: leadId,
    action: 'update',
    diff: { assigned_to: { from: lead.assignedTo, to: user.id } },
  });
  revalidatePath('/dashboard/leads');
  revalidatePath(`/dashboard/leads/${leadId}`);
}

export async function addLeadNote(leadId: string, formData: FormData): Promise<void> {
  const user = await requirePermission('leads.write');
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return;
  await prisma.leadNote.create({
    data: { id: uuidv7(), leadId, userId: user.id, body: body.slice(0, 2000) },
  });
  await writeAudit({ userId: user.id, entityType: 'lead_note', entityId: leadId, action: 'create' });
  revalidatePath(`/dashboard/leads/${leadId}`);
}
