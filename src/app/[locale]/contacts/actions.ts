'use server';

import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { prisma } from '@/lib/prisma';
import { isLocale } from '@/i18n/config';
import { sendLeadNotificationEmail } from '@/lib/email';

// Lead-first flow (docs/DATABASE.md §7): the lead row IS the record — an
// email failure can no longer lose the lead. The DB write is the part that
// matters; the SES notification below is best-effort and never blocks or fails
// the submission.
const leadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(4).max(40),
  locale: z.string(),
  sourcePath: z.string().max(500).optional(),
  // Honeypot — real users never fill this hidden field.
  company: z.string().max(0).optional().or(z.literal('')),
});

export type LeadFormState = { status: 'idle' | 'success' | 'error' };

export async function submitLead(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const parsed = leadSchema.safeParse({
    name: formData.get('name'),
    phone: `${formData.get('countryCode') ?? ''} ${formData.get('phone') ?? ''}`.trim(),
    locale: formData.get('locale'),
    sourcePath: formData.get('sourcePath') ?? undefined,
    company: formData.get('company') ?? '',
  });
  if (!parsed.success) return { status: 'error' };
  // Honeypot tripped: pretend success, store nothing.
  if (formData.get('company')) return { status: 'success' };

  const lead = await prisma.lead.create({
    data: {
      id: uuidv7(),
      name: parsed.data.name,
      phone: parsed.data.phone,
      channel: 'contact_form',
      sourcePath: parsed.data.sourcePath,
      localeCode: isLocale(parsed.data.locale) ? parsed.data.locale : null,
    },
  });

  await notifyStaff(lead);
  return { status: 'success' };
}

// Best-effort staff notification to settings['leads.notify_emails']. Any
// failure (bad config, SES down, email off) is swallowed — the lead is already
// safely stored.
async function notifyStaff(lead: {
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  channel: string;
  sourcePath: string | null;
  localeCode: string | null;
}): Promise<void> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: 'leads.notify_emails' } });
    const emails = z
      .array(z.string().email())
      .catch([])
      .parse(row?.value ?? []);
    if (emails.length === 0) return;
    await sendLeadNotificationEmail({ to: emails, lead });
  } catch (err) {
    console.error('[contacts] lead notification failed:', err);
  }
}
