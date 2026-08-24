import { deleteCostComponent, recostQuote, toggleComponentLock } from '../actions';
import AddChargeForm from './AddChargeForm';
import type { LandedBand } from '@/lib/landed/compute';
import type { QuoteDetail } from '@/lib/quotesAdmin';
function money(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The landed-cost readout.
//
// The three figures are NOT a per-component sum: computeLanded() runs the whole
// chain once per scenario and recomputes every percentage from that scenario's
// own base. Summing per-component minimums would describe a shipment where every
// variable landed at its floor at once — a number with no real probability.
export default function LandedBreakdown({
  quote,
  band,
  vatRecoverable,
  canWrite,
}: {
  quote: QuoteDetail;
  band: LandedBand;
  vatRecoverable: boolean;
  canWrite: boolean;
}) {
  const currency = quote.quoteCurrency;
  const { expected, low, high } = band;
  const components = quote.shipment?.components ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Low estimate', value: low.landedCost, muted: true },
          { label: 'Expected landed cost', value: expected.landedCost, muted: false },
          { label: 'High estimate', value: high.landedCost, muted: true },
        ].map((cell) => (
          <div
            key={cell.label}
            className={`border rounded-lg p-4 ${cell.muted ? 'border-line bg-surface/40' : 'border-accent bg-accent-2/10'}`}
          >
            <div className="text-xs text-muted">{cell.label}</div>
            <div
              className={`text-xl ${cell.muted ? 'text-ink' : 'text-heading font-semibold'}`}
              dir="ltr"
            >
              {money(cell.value, currency)}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="CIF value" value={money(expected.cifValue, currency)} />
        <Stat label="Customs duty" value={money(expected.dutyTotal, currency)} />
        <Stat
          label={`Import VAT${vatRecoverable ? ' (recoverable)' : ''}`}
          value={money(expected.vatTotal, currency)}
        />
        {/* Landed cost and cash outlay differ by exactly the recoverable VAT. A
            VAT-registered importer reverse-charges it on the return, so booking
            it as cost would overstate every quote by 5%. */}
        <Stat label="Cash outlay" value={money(expected.cashOutlay, currency)} />
      </div>

      {expected.issues.length > 0 && (
        <ul className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg p-3 space-y-1">
          {expected.issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-start text-muted border-b border-line">
              <th className="text-start py-2 pe-4">Charge</th>
              <th className="text-start py-2 pe-4">Kind</th>
              <th className="text-start py-2 pe-4">Source</th>
              <th className="text-end py-2 pe-4">Low</th>
              <th className="text-end py-2 pe-4">Expected</th>
              <th className="text-end py-2 pe-4">High</th>
              <th className="text-start py-2 pe-4">In CIF</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {components.map((component) => {
              const find = (scenario: typeof expected) =>
                scenario.lines.find((line) => line.label === component.label);
              return (
                <tr key={component.id} className="border-b border-line/50">
                  <td className="py-2 pe-4 text-ink">
                    {component.label}
                    {component.isLocked && (
                      <span className="ms-2 text-xs text-accent">actual</span>
                    )}
                  </td>
                  <td className="py-2 pe-4 text-muted">{component.kind}</td>
                  <td className="py-2 pe-4 text-muted">{component.source}</td>
                  <td className="py-2 pe-4 text-end text-muted" dir="ltr">
                    {money(find(low)?.amount ?? 0, currency)}
                  </td>
                  <td className="py-2 pe-4 text-end" dir="ltr">
                    {money(find(expected)?.amount ?? 0, currency)}
                  </td>
                  <td className="py-2 pe-4 text-end text-muted" dir="ltr">
                    {money(find(high)?.amount ?? 0, currency)}
                  </td>
                  <td className="py-2 pe-4 text-muted">{component.inCustomsBase ? 'yes' : 'no'}</td>
                  <td className="py-2 text-end whitespace-nowrap">
                    {canWrite && (
                      <span className="flex gap-3 justify-end">
                        <form action={toggleComponentLock}>
                          <input type="hidden" name="componentId" value={component.id} />
                          <button className="text-xs text-accent hover:underline">
                            {component.isLocked ? 'Unlock' : 'Lock as actual'}
                          </button>
                        </form>
                        <form action={deleteCostComponent}>
                          <input type="hidden" name="componentId" value={component.id} />
                          <button className="text-xs text-red-300 hover:underline">Remove</button>
                        </form>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {components.length === 0 && (
              <tr>
                <td colSpan={8} className="py-3 text-muted">
                  No cost lines yet. Add items and save the shipment to cost it.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-muted text-xs">
        Duty and VAT are not stored as lines: they are derived per item from each
        HS code and recomputed for every scenario. Locking a duty line records an
        actual customs invoice, which then overrides the calculation.
      </p>

      {canWrite && (
        <div className="flex flex-wrap items-end gap-4">
          <form action={recostQuote}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <button className="px-3 py-2 rounded-lg border border-line text-ink hover:border-accent/60 text-sm">
              Re-cost from rate cards
            </button>
          </form>

          <AddChargeForm quoteId={quote.id} currency={currency} />
        </div>
      )}

      {expected.items.length > 0 && (
        <div className="overflow-x-auto">
          <h3 className="text-sm font-semibold text-heading mb-2 mt-4">Per item</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-start text-muted border-b border-line">
                <th className="text-start py-2 pe-4">Item</th>
                <th className="text-end py-2 pe-4">Goods</th>
                <th className="text-end py-2 pe-4">Freight share</th>
                <th className="text-end py-2 pe-4">CIF</th>
                <th className="text-end py-2 pe-4">Duty</th>
                <th className="text-end py-2 pe-4">Landed</th>
                <th className="text-end py-2">Per unit</th>
              </tr>
            </thead>
            <tbody>
              {expected.items.map((row) => {
                const item = quote.items.find((i) => i.id === row.id);
                return (
                  <tr key={row.id} className="border-b border-line/50">
                    <td className="py-2 pe-4">{item?.nameSnapshot ?? row.id}</td>
                    <td className="py-2 pe-4 text-end" dir="ltr">
                      {money(row.goodsValue, currency)}
                    </td>
                    <td className="py-2 pe-4 text-end text-muted" dir="ltr">
                      {money(row.apportionedFreight, currency)}
                    </td>
                    <td className="py-2 pe-4 text-end" dir="ltr">
                      {money(row.cifValue, currency)}
                    </td>
                    <td className="py-2 pe-4 text-end" dir="ltr">
                      {money(row.duty, currency)}
                    </td>
                    <td className="py-2 pe-4 text-end" dir="ltr">
                      {money(row.landedTotal, currency)}
                    </td>
                    <td className="py-2 text-end text-heading" dir="ltr">
                      {money(row.landedUnitCost, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line rounded-lg p-3 bg-surface/40">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-ink" dir="ltr">
        {value}
      </div>
    </div>
  );
}
