// Quote status vocabulary, split out from quotesAdmin.ts so client components
// can import it. quotesAdmin.ts is `server-only` and pulls in Prisma; importing
// a constant from it inside a form component would drag the ORM into the
// browser bundle (and fail the build, which is how this file came to exist).

// Bounded and code-driven, but stored as a plain string rather than a sixth
// global Postgres enum — the `customer_email_tokens.purpose` precedent in
// prisma/schema/customers.prisma. This array is the source of truth the schema
// comment on Quote.status points at.
export const QUOTE_STATUSES = [
  'draft',
  'costing',
  'sent',
  'accepted',
  'rejected',
  'expired',
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  costing: 'Costing',
  sent: 'Sent',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
};

// A quote stops moving once it has been sent. Every mutation path checks this:
// prices that keep changing after the customer has seen them are not a quote.
const EDITABLE: readonly string[] = ['draft', 'costing'];

export function isEditable(status: string): boolean {
  return EDITABLE.includes(status);
}

export function isQuoteStatus(value: string): value is QuoteStatus {
  return (QUOTE_STATUSES as readonly string[]).includes(value);
}

export const FROZEN_MESSAGE =
  'This quote has already been sent, so its pricing is frozen. Duplicate it to make changes.';
