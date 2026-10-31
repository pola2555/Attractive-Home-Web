// Pure view-model for the customer-facing quote. It turns a stored quote into
// what the client may see: names, chosen options, add-ons, quantities and money
// in the quote currency. It never exposes cost basis, margin rules, HS codes or
// anything from the shipment / landed-cost chain (that flow is switched off —
// see SHIPMENT_ENABLED in the staff quote page — and is internal in any case).
//
// No `server-only`: it is a plain function over plain data so it can be unit
// tested.

export type CustomerQuoteItemInput = {
  nameSnapshot: string;
  codeSnapshot: string | null;
  quantity: { toString(): string };
  selectionLabel: string | null;
  unitCost: { toString(): string } | null;
  costCurrency: string | null;
  priceBreakdown: unknown;
};

export type CustomerQuoteLine = {
  name: string;
  code: string | null;
  /** The configured options, e.g. "45mm x 2100 x 900, Oak". */
  options: string | null;
  addons: { name: string; quantity: number }[];
  accessories: { name: string; quantity: number }[];
  /** Quantity as shown ("2", "10.5"). */
  quantity: string;
  /** m2 / piece for a by-measure line, else null. */
  unit: string | null;
  currency: string;
  unitPrice: number | null;
  lineTotal: number | null;
};

export type CustomerQuoteView = {
  lines: CustomerQuoteLine[];
  /** One entry per currency; a single entry when everything is in the quote currency. */
  totals: { currency: string; amount: number }[];
};

type Breakdown = {
  addons?: { name?: string; quantity?: number }[];
  accessories?: { lines?: { name?: string; quantity?: number }[]; total?: number };
  measure?: { unit?: string };
};

function num(value: { toString(): string } | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

export function buildCustomerQuote(
  items: CustomerQuoteItemInput[],
  quoteCurrency: string,
  fxRates: Record<string, number> | null,
): CustomerQuoteView {
  const totals = new Map<string, number>();

  const lines = items.map((item): CustomerQuoteLine => {
    const bd = (item.priceBreakdown ?? {}) as Breakdown;
    const qty = num(item.quantity) ?? 1;
    const unit = num(item.unitCost);
    const accTotal = bd.accessories?.total ?? 0;

    // Convert into the quote currency with the rates snapshotted on the quote
    // (units of quote currency per 1 foreign unit). With no rate the line stays
    // in its own currency and is totalled separately — never mixed.
    const own = item.costCurrency ?? quoteCurrency;
    const rate = own === quoteCurrency ? 1 : (fxRates?.[own] ?? null);
    const currency = rate === null ? own : quoteCurrency;
    const factor = rate ?? 1;

    const rawLine = unit === null ? null : unit * qty + accTotal;
    const lineTotal = rawLine === null ? null : rawLine * factor;
    if (lineTotal !== null) totals.set(currency, (totals.get(currency) ?? 0) + lineTotal);

    const named = (rows?: { name?: string; quantity?: number }[]) =>
      (rows ?? [])
        .filter((r) => r.name)
        .map((r) => ({ name: r.name as string, quantity: r.quantity ?? 1 }));

    return {
      name: item.nameSnapshot,
      code: item.codeSnapshot,
      options: item.selectionLabel,
      addons: named(bd.addons),
      accessories: named(bd.accessories?.lines),
      quantity: item.quantity.toString(),
      unit: bd.measure?.unit ?? null,
      currency,
      unitPrice: unit === null ? null : unit * factor,
      lineTotal,
    };
  });

  return { lines, totals: [...totals].map(([currency, amount]) => ({ currency, amount })) };
}

/** "AED 1,234.50" — fixed en-US digits so the figure reads the same in every locale. */
export function formatMoney(amount: number, currency: string): string {
  const n = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${currency} ${n}`;
}
