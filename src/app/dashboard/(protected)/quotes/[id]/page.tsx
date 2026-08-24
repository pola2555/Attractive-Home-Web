import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { listTemplates, getTemplate, getProductRules } from '@/lib/configuratorAdmin';
import { getLandedSettings } from '@/lib/landed/settings';
import {
  compareFreightModes,
  computeQuoteLanded,
  getQuoteDetail,
  isEditable,
  QUOTE_STATUS_LABELS,
  rollUpShipmentMetrics,
} from '@/lib/quotesAdmin';
import { pricingInputsHash } from '@/lib/configurator/price';
import type { TemplateDef } from '@/lib/configurator/types';
import { repriceQuote } from '../actions';
import QuoteConfigurator from './QuoteConfigurator';
import QuoteHeaderForm from './QuoteHeaderForm';
import QuoteItems from './QuoteItems';
import ShipmentPanel from './ShipmentPanel';
import LandedBreakdown from './LandedBreakdown';

// The assembly page: configure a product, add it to the cart, attach a
// shipment, and read the landed cost. Everything money-shaped on this page is
// computed by the pure engines in src/lib/configurator and src/lib/landed.
export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('quotes.read')) redirect('/dashboard');
  const canWrite = permissions.has('quotes.write');

  const { id } = await params;
  const quote = await getQuoteDetail(id);
  if (!quote) notFound();

  const [templateRows, settings, band, modes, staff] = await Promise.all([
    listTemplates(),
    getLandedSettings(),
    computeQuoteLanded(quote),
    compareFreightModes(quote),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);

  const templates = (
    await Promise.all(templateRows.filter((row) => row.isActive).map((row) => getTemplate(row.id)))
  ).filter((t): t is TemplateDef => t !== null);

  // "Pricing changed since this was priced" — a hash comparison, deliberately
  // not a rule-versioning table. It answers "is this stale?" and nothing more.
  const staleItems: string[] = [];
  for (const item of quote.items) {
    if (!item.templateId || !item.pricingInputsHash) continue;
    const template = templates.find((t) => t.id === item.templateId);
    if (!template) continue;
    const productRules = item.productId ? await getProductRules(item.productId) : [];
    if (pricingInputsHash([...template.rules, ...productRules]) !== item.pricingInputsHash) {
      staleItems.push(item.nameSnapshot);
    }
  }

  const editable = isEditable(quote.status);
  const rolled = rollUpShipmentMetrics(quote);

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <Link href="/dashboard/quotes" className="text-sm text-accent hover:underline">
          ← Quotes
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-heading">{quote.reference}</h1>
          <span className="px-2 py-0.5 rounded-full text-xs border border-line text-muted">
            {QUOTE_STATUS_LABELS[quote.status as keyof typeof QUOTE_STATUS_LABELS] ?? quote.status}
          </span>
          {!editable && (
            <span className="px-2 py-0.5 rounded-full text-xs border border-accent/60 text-accent">
              Pricing frozen
            </span>
          )}
        </div>
        {quote.lead && (
          <p className="text-muted text-sm mt-1">
            From lead{' '}
            <Link
              href={`/dashboard/leads/${quote.lead.id}`}
              className="text-accent hover:underline"
            >
              {quote.lead.name}
            </Link>{' '}
            · <span dir="ltr">{quote.lead.phone}</span>
          </p>
        )}
      </div>

      {staleItems.length > 0 && editable && canWrite && (
        <div className="border border-accent/60 bg-accent-2/10 rounded-lg p-4 text-sm">
          <p className="text-heading mb-2">
            Pricing rules have changed since {staleItems.join(', ')}{' '}
            {staleItems.length === 1 ? 'was' : 'were'} priced.
          </p>
          <form action={repriceQuote}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <button className="text-accent hover:underline">Re-price all lines</button>
          </form>
        </div>
      )}

      {/* Prisma Decimal is not a plain object, so it cannot cross the
          server/client boundary. Everything handed to a client component is
          flattened to primitives here rather than at the far end. */}
      <QuoteHeaderForm
        quote={{
          id: quote.id,
          title: quote.title,
          notes: quote.notes,
          status: quote.status,
          assignedTo: quote.assignedTo,
          contingencyPercent: quote.contingencyPercent.toString(),
          validUntil: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : null,
          updatedAt: quote.updatedAt.toISOString(),
          fxRates: (quote.fxRates as Record<string, number> | null) ?? {},
          fxRatesAt: quote.fxRatesAt ? quote.fxRatesAt.toISOString().slice(0, 10) : null,
          quoteCurrency: quote.quoteCurrency,
        }}
        staff={staff}
        canWrite={canWrite}
      />

      <section data-testid="quote-items">
        <h2 className="text-lg font-semibold text-heading mb-3">Items</h2>
        <QuoteItems quote={quote} canWrite={canWrite && editable} />
      </section>

      {canWrite && editable && (
        <section className="border border-line rounded-lg p-4 bg-surface/40">
          <h2 className="text-lg font-semibold text-heading mb-3">Configure a product</h2>
          <QuoteConfigurator
            quoteId={quote.id}
            templates={templates}
            currencySymbol={templates[0]?.currency ?? 'USD'}
          />
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-heading mb-3">Shipment</h2>
        <ShipmentPanel
          quoteId={quote.id}
          shipment={
            quote.shipment
              ? {
                  mode: quote.shipment.mode,
                  originPort: quote.shipment.originPort,
                  destinationPort: quote.shipment.destinationPort,
                  incoterm: quote.shipment.incoterm,
                  containerType: quote.shipment.containerType,
                  containerCount: quote.shipment.containerCount,
                  expectedStorageDays: quote.shipment.expectedStorageDays,
                  isManualOverride: quote.shipment.isManualOverride,
                  volumeCbm: quote.shipment.volumeCbm?.toString() ?? null,
                  grossWeightKg: quote.shipment.grossWeightKg?.toString() ?? null,
                  notes: quote.shipment.notes,
                }
              : null
          }
          canWrite={canWrite && editable}
          rolledVolumeCbm={rolled.volumeCbm}
          rolledWeightKg={rolled.grossWeightKg}
          modes={modes}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-heading mb-3">Landed cost</h2>
        <LandedBreakdown
          quote={quote}
          band={band}
          vatRecoverable={settings.vatRecoverable}
          canWrite={canWrite && editable}
        />
      </section>
    </div>
  );
}
