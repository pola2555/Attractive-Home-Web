import { removeQuoteItem, updateQuoteItemQuantity } from '../actions';
import type { QuoteDetail } from '@/lib/quotesAdmin';

// The cart. Each row shows what was configured, what it costs per unit, and —
// once a shipment has been costed — what it actually costs landed, which is the
// number the business sells from.
export default function QuoteItems({
  quote,
  canWrite,
}: {
  quote: QuoteDetail;
  canWrite: boolean;
}) {
  if (quote.items.length === 0) {
    return <p className="text-muted text-sm">Nothing in this quote yet.</p>;
  }

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
            <th className="text-end py-2 pe-4">Landed / unit</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {quote.items.map((item) => {
            const derived = (item.derived ?? {}) as Record<string, number | null>;
            // A null derived value means a formula failed. It is surfaced rather
            // than defaulted to zero, because a weightless door ships free.
            const needsReview = Object.values(derived).some((v) => v === null);

            return (
              <tr key={item.id} className="border-b border-line/50 align-top">
                <td className="py-2 pe-4">
                  <div className="text-ink">{item.nameSnapshot}</div>
                  {item.codeSnapshot && (
                    <div className="text-muted text-xs">{item.codeSnapshot}</div>
                  )}
                  {needsReview && (
                    <div className="text-red-300 text-xs">Derived values need review</div>
                  )}
                </td>
                <td className="py-2 pe-4 text-muted max-w-xs">
                  <div>{item.selectionLabel ?? '—'}</div>
                  <div className="text-xs">
                    {Object.entries(derived)
                      .map(([code, value]) => `${code} ${value === null ? '—' : value.toFixed(2)}`)
                      .join(' · ')}
                  </div>
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
                        min="1"
                        step="1"
                        defaultValue={item.quantity.toString()}
                        className="w-20 px-2 py-1 bg-surface text-ink rounded border border-line-strong focus:outline-none focus:ring-1 focus:ring-accent"
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
                <td className="py-2 pe-4 text-end whitespace-nowrap text-heading" dir="ltr">
                  {item.landedUnitCost
                    ? `${quote.quoteCurrency} ${item.landedUnitCost.toString()}`
                    : '—'}
                </td>
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
      </table>
    </div>
  );
}
