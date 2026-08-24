'use server';

import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { prisma } from '@/lib/prisma';
import { isLocale } from '@/i18n/config';
import { sendLeadNotificationEmail } from '@/lib/email';
import { getLandedSettings } from '@/lib/landed/settings';
import { nextQuoteReference } from '@/lib/quotesAdmin';

// "Request a quote" from the public shortlist.
//
// Until now the shortlist was a dead end: customers saved products, copied the
// supplier codes, and pasted them into WhatsApp by hand. This gives it a real
// submit path — and because customers never see prices, a request is exactly
// what the public side is for.
//
// Lead-first, like src/app/[locale]/contacts/actions.ts: the Lead row IS the
// record, the draft Quote is the team's working copy of it, and the email is
// only a notification, so an SES failure can no longer lose the request.

const MAX_ITEMS = 60; // mirrors the cap on /api/catalog/by-ids

const requestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(4).max(40),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
  locale: z.string(),
  sourcePath: z.string().max(500).optional(),
  // Honeypot — real users never fill this hidden field.
  company: z.string().max(0).optional().or(z.literal('')),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QuoteRequestState = { status: 'idle' | 'success' | 'error'; message?: string };

export async function submitQuoteRequest(
  _prev: QuoteRequestState,
  formData: FormData,
): Promise<QuoteRequestState> {
  const parsed = requestSchema.safeParse({
    name: formData.get('name'),
    phone: `${formData.get('countryCode') ?? ''} ${formData.get('phone') ?? ''}`.trim(),
    email: formData.get('email') ?? '',
    message: formData.get('message') ?? '',
    locale: formData.get('locale'),
    sourcePath: formData.get('sourcePath') ?? undefined,
    company: formData.get('company') ?? '',
  });
  if (!parsed.success) return { status: 'error' };

  // Honeypot tripped: pretend success, store nothing.
  if (formData.get('company')) return { status: 'success' };

  const rawIds = String(formData.get('productIds') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => UUID_RE.test(id))
    .slice(0, MAX_ITEMS);

  // Validate against real, published products before storing anything: the id
  // list comes from localStorage and is entirely user-controlled.
  const products = rawIds.length
    ? await prisma.product.findMany({
        where: { id: { in: rawIds }, isPublished: true },
        select: {
          id: true,
          code: true,
          hsCodeId: true,
          translations: { where: { localeCode: { in: [parsed.data.locale, 'en'] } } },
        },
      })
    : [];

  const settings = await getLandedSettings();
  const reference = await nextQuoteReference();
  const leadId = uuidv7();
  const quoteId = uuidv7();

  await prisma.$transaction(async (tx) => {
    await tx.lead.create({
      data: {
        id: leadId,
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email || null,
        message: parsed.data.message || null,
        // A new value on the existing enum rather than a sixth global enum.
        channel: 'quote_request',
        sourcePath: parsed.data.sourcePath,
        localeCode: isLocale(parsed.data.locale) ? parsed.data.locale : null,
        // §10 already noted leads.product_id "captures intent"; before this flow
        // existed nothing ever wrote it.
        productId: products[0]?.id ?? null,
      },
    });

    await tx.quote.create({
      data: {
        id: quoteId,
        reference,
        status: 'draft',
        leadId,
        title: `Request from ${parsed.data.name}`,
        quoteCurrency: 'AED',
        // Snapshotted now so a later FX move cannot rewrite this quote.
        fxRates: settings.fxRates,
        fxRatesAt: new Date(),
        contingencyPercent: settings.contingencyPercent,
        notes: parsed.data.message || null,
      },
    });

    await tx.shipment.create({ data: { id: uuidv7(), quoteId } });

    if (products.length) {
      await tx.quoteItem.createMany({
        data: products.map((product, index) => ({
          id: uuidv7(),
          quoteId,
          sortOrder: index,
          productId: product.id,
          hsCodeId: product.hsCodeId,
          quantity: 1,
          // Snapshotted at request time, so a later rename does not rewrite
          // what the customer actually asked for.
          nameSnapshot:
            product.translations.find((t) => t.localeCode === parsed.data.locale)?.name ??
            product.translations.find((t) => t.localeCode === 'en')?.name ??
            product.code ??
            'Product',
          codeSnapshot: product.code,
          // Not configured: the customer picked a catalog product, not a
          // configured one. The team can replace the line with a configured
          // item on the assembly page.
          selection: {},
          selectionLabel: null,
        })),
      });
    }
  });

  const summary = products.length
    ? products.map((p) => p.code ?? p.id).join(', ')
    : 'no specific products';

  await notifyStaff({
    name: parsed.data.name,
    phone: parsed.data.phone,
    email: parsed.data.email || null,
    message: `Quote ${reference} — ${products.length} product${products.length === 1 ? '' : 's'}: ${summary}.${parsed.data.message ? `\n\n${parsed.data.message}` : ''}`,
    sourcePath: parsed.data.sourcePath ?? null,
    localeCode: isLocale(parsed.data.locale) ? parsed.data.locale : null,
  });

  return { status: 'success', message: reference };
}

// Best-effort notification. Every failure is swallowed: the lead and the quote
// are already committed, and an email problem must not surface to the customer
// as a failed request.
async function notifyStaff(lead: {
  name: string;
  phone: string;
  email: string | null;
  message: string;
  sourcePath: string | null;
  localeCode: string | null;
}): Promise<void> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'leads.notify_emails' } });
    const recipients = z
      .array(z.string().email())
      .catch([])
      .parse(setting?.value ?? []);
    if (recipients.length === 0) return;
    await sendLeadNotificationEmail({
      to: recipients,
      lead: { ...lead, channel: 'quote_request' },
    });
  } catch {
    // Deliberately ignored — see above.
  }
}
