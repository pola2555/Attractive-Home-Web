import 'server-only';
import { prisma } from '@/lib/prisma';
import { getContactSettings } from '@/lib/content';
import { buildCustomerQuote, formatMoney } from './customerQuote';

// Public lookup for the customer quote page. The token is the only credential:
// a missing, revoked or soft-deleted quote all resolve to null (-> 404).
export async function getSharedQuote(token: string) {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return null;
  const quote = await prisma.quote.findFirst({
    where: { shareToken: token, deletedAt: null },
    select: {
      reference: true,
      title: true,
      notes: true,
      status: true,
      validUntil: true,
      sentAt: true,
      createdAt: true,
      quoteCurrency: true,
      fxRates: true,
      customer: { select: { name: true } },
      lead: { select: { name: true } },
      items: {
        orderBy: { sortOrder: 'asc' },
        select: {
          nameSnapshot: true,
          codeSnapshot: true,
          quantity: true,
          selectionLabel: true,
          unitCost: true,
          costCurrency: true,
          priceBreakdown: true,
        },
      },
    },
  });
  if (!quote) return null;
  const view = buildCustomerQuote(
    quote.items,
    quote.quoteCurrency,
    (quote.fxRates as Record<string, number> | null) ?? null,
  );
  const contact = await getContactSettings();
  return {
    reference: quote.reference,
    title: quote.title,
    notes: quote.notes,
    status: quote.status,
    validUntil: quote.validUntil,
    // validUntil is a date; the quote is good through the end of that day (UTC).
    isExpired: quote.validUntil !== null && quote.validUntil.getTime() + 86_400_000 < Date.now(),
    issuedAt: quote.sentAt ?? quote.createdAt,
    clientName: quote.customer?.name ?? quote.lead?.name ?? null,
    view,
    contact: { email: contact.email, phone: contact.phones[0]?.number ?? null },
  };
}

/** Grand total(s) as display strings, for the email. */
export function totalsLabel(totals: { currency: string; amount: number }[]): string {
  return totals.map((t) => formatMoney(t.amount, t.currency)).join(' + ');
}
