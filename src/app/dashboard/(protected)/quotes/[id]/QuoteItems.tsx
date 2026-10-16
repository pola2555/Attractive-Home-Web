import { removeQuoteItem, updateQuoteItemQuantity } from '../actions';
import type { QuoteDetail } from '@/lib/quotesAdmin';

// The cart. Each row shows what was configured, what it costs per unit, and —
// once a shipment has been costed — what it actually costs landed, which is the
// number the business sells from. `showLanded` is off while the shipment/landed
// flow is disabled (see SHIPMENT_ENABLED in the detail page); the Total row then
// stands in as the quote's bottom line from the per-line costs.
export default function QuoteItems({
  quote,
  canWrite,
  showLanded = true,
}: {
  quote: QuoteDetail;
  canWrite: boolean;
  showLanded?: boolean;
}) {
  if (quote.items.length === 0) {
    return <p className="text-muted text-sm">Nothing in this quote yet.</p>;
  }

  // The quote's running total from the per-line costs (unit cost × qty, plus any
  // accessories), summed per cost currency so a mixed-currency quote never adds
  // unlike money together. This is the goods subtotal — independent of the
  // shipment/landed chain — so it is always meaningful, flag on or off.
  const totals = new Map<string, number>();
  for (const item of quote.items) {
    const unit = item.unitCost ? Number(item.unitCost.toString()) : 0;
    const qty = Number(item.quantity.toString());
    const accTotal =
      (item.priceBreakdown as { accessories?: { total?: number } } | null)?.accessories?.total ?? 0;
    const line = unit * qty + accTotal;
    if (!Number.isFinite(line)) continue;
    const cur = item.costCurrency ?? '';
    totals.set(cur, (totals.get(cur) ?? 0) + line);
  }
  // Columns left of the total amount: Item, Configuration, HS code, Qty.
  const labelSpan = 4;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-start text-muted border-b border-line">
            <th className="text-start py-2 pe-4">Item</th>
            <th className="text-start py-2 pe-4">Configuration</th>
            <th className="text-start py-2 pe-4">HS code</th>
            <th className="text-start py-2 pe-4">Qty</th>
            <th className="text-end py-2 pe-4">Unit cost</th>
            {showLanded && <th className="text-end py-2 pe-4">Landed / unit</th>}
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {quote.items.map((item) => {
            const derived = (item.derived ?? {}) as Record<string, number | null>;
            // A null derived value means a formula failed. It is surfaced rather
            // than defaulted to zero, because a weightless door ships free.
            const needsReview = Object.values(derived).some((v) => v === null);
            // Accessories (sold separately): their own subtotal, kept out of the
            // door's unit cost and the landed roll-up.
            const acc = (
              item.priceBreakdown as {
                accessories?: {
                  lines: { name: string; quantity: number; amount: number }[];
                  total: number;
                };
              } | null
            )?.accessories;
            // A by-measure line carries no configurator template; its amount is
            // fractional and the breakdown reads "10.5 m² × USD 26.00".
            const isMeasure = item.templateId === null;
            const measure = (
              item.priceBreakdown as { measure?: { unit: string; unitPrice: number } } | null
            )?.measure;

            return (
              <tr key={item.id} className="border-b border-line/50 align-top">
                <td className="py-2 pe-4">
                  <div className="text-ink">{item.nameSnapshot}</div>
                  {item.codeSnapshot && (
                    <div className="text-muted text-xs">{item.codeSnapshot}</div>
                  )}
                  {acc && acc.total > 0 && (
                    <div className="text-muted text-xs" dir="ltr">
                      + {item.costCurrency ?? ''} {acc.total.toFixed(2)} accessories
                    </div>
                  )}
                  {needsReview && (
                    <div className="text-red-300 text-xs">Derived values need review</div>
                  )}
                </td>
                <td className="py-2 pe-4 text-muted max-w-xs">
                  <div>{item.selectionLabel ?? '—'}</div>
                  {measure && (
                    <div className="text-xs" dir="ltr">
                      {item.quantity.toString()} {measure.unit} × {item.costCurrency ?? ''}{' '}
                      {measure.unitPrice.toFixed(2)}
                    </div>
                  )}
                  <div className="text-xs">
                    {Object.entries(derived)
                      .map(([code, value]) => `${code} ${value === null ? '—' : value.toFixed(2)}`)
                      .join(' · ')}
                  </div>
                  {acc && acc.lines.length > 0 && (
                    <div className="text-xs mt-0.5">
                      Accessories: {acc.lines.map((l) => `${l.name}×${l.quantity}`).join(', ')}
                    </div>
                  )}
                </td>
                <td className="py-2 pe-4">
                  {item.hsCode?.code ?? <span className="text-red-300">none</span>}
                </td>
                <td className="py-2 pe-4">
                  {canWrite ? (
                    <form action={updateQuoteItemQuantity} className="flex items-center gap-1">
                      <input type="hidden" name="itemId" value={item.id} />
                      <input
                        name="quantity"
                        type="number"
                        min={isMeasure ? '0.001' : '1'}
                        step={isMeasure ? 'any' : '1'}
                        defaultValue={item.quantity.toString()}
                        className="w-24 px-2 py-1 bg-surface text-ink rounded border border-line-strong focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                      <button className="text-xs text-accent hover:underline">set</button>
                    </form>
                  ) : (
                    item.quantity.toString()
                  )}
                </td>
                <td className="py-2 pe-4 text-end whitespace-nowrap" dir="ltr">
                  {item.unitCost ? `${item.costCurrency} ${item.unitCost.toString()}` : '—'}
                </td>
                {showLanded && (
                  <td className="py-2 pe-4 text-end whitespace-nowrap text-heading" dir="ltr">
                    {item.landedUnitCost
                      ? `${quote.quoteCurrency} ${item.landedUnitCost.toString()}`
                      : '—'}
                  </td>
                )}
                <td className="py-2 text-end">
                  {canWrite && (
                    <form action={removeQuoteItem}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <button className="text-xs text-red-300 hover:underline">Remove</button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {[...totals].map(([cur, sum], i) => (
            <tr key={cur || `cur-${i}`} className="border-t border-line font-medium text-heading">
              <td colSpan={labelSpan} className="py-2 pe-4 text-end">
                {i === 0 ? 'Total' : ''}
              </td>
              <td className="py-2 pe-4 text-end whitespace-nowrap" dir="ltr">
                {cur} {sum.toFixed(2)}
              </td>
              {showLanded && <td />}
              <td />
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}
