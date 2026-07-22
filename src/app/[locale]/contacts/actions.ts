'use server';

import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { prisma } from '@/lib/prisma';
import { isLocale } from '@/i18n/config';

// Lead-first flow (docs/DATABASE.md §7): the lead row IS the record — an
// email failure can no longer lose the lead. SES notification to
// settings['leads.notify_emails'] is wired at cutover when SES credentials
// exist; the DB write below is the part that matters.
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

  await prisma.lead.create({
    data: {
      id: uuidv7(),
      name: parsed.data.name,
      phone: parsed.data.phone,
      channel: 'contact_form',
      sourcePath: parsed.data.sourcePath,
      localeCode: isLocale(parsed.data.locale) ? parsed.data.locale : null,
    },
  });
  return { status: 'success' };
}
