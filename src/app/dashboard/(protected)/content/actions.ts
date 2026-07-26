'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { uuidv7 } from 'uuidv7';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { LOCALES } from '@/i18n/config';

export type FormState = { error?: string };

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

export async function updateContentBlock(
  blockId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('content.write');

  const block = await prisma.contentBlock.findUnique({ where: { id: blockId }, select: { key: true } });
  if (!block) return { error: 'Content block not found.' };

  // body is NOT NULL — a translation row exists only when there's real content
  // (docs/DATABASE.md §3). Empty locale = no row (falls back to en at read).
  const rows = LOCALES.map((locale) => ({ locale, body: str(formData, `body_${locale}`) })).filter(
    (r) => r.body,
  );
  const notes = str(formData, 'notes') || null;

  await prisma.$transaction(async (tx) => {
    await tx.contentBlock.update({ where: { id: blockId }, data: { notes } });
    await tx.contentBlockTranslation.deleteMany({ where: { contentBlockId: blockId } });
    if (rows.length) {
      await tx.contentBlockTranslation.createMany({
        data: rows.map((r) => ({ id: uuidv7(), contentBlockId: blockId, localeCode: r.locale, body: r.body })),
      });
    }
  });

  await writeAudit({
    userId: user.id,
    entityType: 'content_block',
    entityId: block.key,
    action: 'update',
    diff: { locales: { from: null, to: rows.map((r) => r.locale).join(',') } },
  });
  // The public pages read these; revalidate the localized tree broadly.
  revalidatePath('/dashboard/content');
  revalidatePath('/', 'layout');
  redirect('/dashboard/content');
}
