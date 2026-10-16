import 'server-only';
import { uuidv7 } from 'uuidv7';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { getLandedSettings } from './landed/settings';
import { customsProvider, freightProvider, storageProvider } from './landed/providers';
import { computeLandedBand } from './landed/compute';
import type { LandedBand } from './landed/compute';
import type { ComponentInput, CostKind, FreightMode, LandedInput } from './landed/types';
import { isQuoteStatus } from './quotes/status';

// Orchestration between the quote tables and the two pure engines. Everything
// money-shaped is computed in src/lib/landed/compute.ts; this file's job is to
// assemble that function's input, call the providers, and persist the result.

// Status vocabulary lives in ./quotes/status.ts so client components can import
// it without dragging Prisma into the browser bundle. Re-exported here so
// server callers have one import.
export {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  isEditable,
  isQuoteStatus,
  FROZEN_MESSAGE,
  type QuoteStatus,
} from './quotes/status';

// Reference generation from a Postgres SEQUENCE. MAX(reference)+1 races two
// concurrent creates into the same value and then fails the UNIQUE index.
export async function nextQuoteReference(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ n: string }[]>(
    `SELECT nextval('quote_reference_seq')::text AS n`,
  );
  const serial = Number(rows[0]?.n ?? 1);
  return `Q-${new Date().getFullYear()}-${String(serial).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const quoteDetailInclude = {
  items: {
    orderBy: { sortOrder: 'asc' },
    include: {
      template: { select: { id: true, code: true, name: true, currency: true } },
      product: { select: { id: true, slug: true, code: true, hsCodeId: true } },
      hsCode: { select: { id: true, code: true, dutyPercent: true, vatPercent: true } },
    },
  },
  shipment: { include: { components: { orderBy: { sortOrder: 'asc' } } } },
  lead: { select: { id: true, name: true, phone: true, email: true } },
  customer: { select: { id: true, name: true, email: true } },
  creator: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
} satisfies Prisma.QuoteInclude;

export type QuoteDetail = Prisma.QuoteGetPayload<{ include: typeof quoteDetailInclude }>;

export async function getQuoteDetail(id: string): Promise<QuoteDetail | null> {
  return prisma.quote.findUnique({ where: { id }, include: quoteDetailInclude });
}

// A soft-deleted quote is kept this long so it can be restored, then purged.
export const QUOTE_TRASH_RETENTION_DAYS = 30;

// Whole days a soft-deleted quote has left before the purge removes it. Lives
// here (not in the page) so the clock read stays out of React's render.
export function trashDaysLeft(deletedAt: Date): number {
  const elapsed = (Date.now() - deletedAt.getTime()) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(QUOTE_TRASH_RETENTION_DAYS - elapsed));
}

// Permanently remove quotes whose trash retention has elapsed. Cascades to their
// items and shipment (both onDelete: Cascade). Called lazily from listQuotes so
// the Trash never shows an expired quote and no cron is required.
export async function purgeExpiredTrash(): Promise<number> {
  const cutoff = new Date(Date.now() - QUOTE_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.quote.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  return result.count;
}

export type QuoteListParams = {
  status?: string;
  q?: string;
  page?: number;
  perPage?: number;
  /** Show the Trash (soft-deleted quotes) instead of the live inbox. */
  trash?: boolean;
};

export async function listQuotes(params: QuoteListParams = {}) {
  const perPage = Math.min(Math.max(params.perPage ?? 25, 1), 100);
  const page = Math.max(params.page ?? 1, 1);

  // Clear anything past retention before reading, so an expired quote never
  // shows in the Trash and the list is always truthful.
  await purgeExpiredTrash();

  const where = {
    // Live inbox hides soft-deleted quotes; the Trash view shows only them.
    deletedAt: params.trash ? { not: null } : null,
    ...(params.status && isQuoteStatus(params.status) ? { status: params.status } : {}),
    ...(params.q
      ? {
          OR: [
            { reference: { contains: params.q, mode: 'insensitive' as const } },
            { title: { contains: params.q, mode: 'insensitive' as const } },
            { lead: { name: { contains: params.q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        assignee: { select: { name: true } },
        lead: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.quote.count({ where }),
  ]);

  return { rows, total, page, perPage, pageCount: Math.max(1, Math.ceil(total / perPage)) };
}

// ---------------------------------------------------------------------------
// Costing
// ---------------------------------------------------------------------------

function decimal(value: { toNumber(): number } | null | undefined, fallback = 0): number {
  return value === null || value === undefined ? fallback : value.toNumber();
}

// Volume and weight roll up from the items' derived quantities unless a human
// has overridden them — packing efficiency is judgement, and the override flag
// is what tells a later reader whether a figure is deliberate or just stale.
export function rollUpShipmentMetrics(quote: QuoteDetail): {
  volumeCbm: number;
  grossWeightKg: number;
  itemsMissingWeight: string[];
} {
  let volumeCbm = 0;
  let grossWeightKg = 0;
  const itemsMissingWeight: string[] = [];

  for (const item of quote.items) {
    const derived = (item.derived ?? {}) as Record<string, number | null>;
    const quantity = decimal(item.quantity, 1);
    const volume = typeof derived.volume_m3 === 'number' ? derived.volume_m3 : null;
    const weight = typeof derived.weight_kg === 'number' ? derived.weight_kg : null;

    if (volume === null || weight === null) itemsMissingWeight.push(item.nameSnapshot);
    volumeCbm += (volume ?? 0) * quantity;
    grossWeightKg += (weight ?? 0) * quantity;
  }

  return { volumeCbm, grossWeightKg, itemsMissingWeight };
}

/**
 * Recompute the shipment's cost ledger from the current items and rate cards.
 *
 * Only estimate lines are replaced. A LOCKED line is a real invoice and is left
 * exactly as it is — re-costing a quote must never overwrite what was actually
 * paid. Duty and VAT are not written as components at all: compute.ts derives
 * them per item per scenario, which is the only way a mixed-HS shipment gets the
 * right answer.
 */
export async function recostShipment(quoteId: string): Promise<{ issues: string[] }> {
  const quote = await getQuoteDetail(quoteId);
  if (!quote) return { issues: ['Quote not found.'] };
  if (!quote.shipment) return { issues: ['This quote has no shipment yet.'] };

  const settings = await getLandedSettings();
  const shipment = quote.shipment;
  const issues: string[] = [];
  const currency = quote.quoteCurrency;
  const fxRates = (quote.fxRates as Record<string, number> | null) ?? settings.fxRates;

  const rolled = rollUpShipmentMetrics(quote);
  const volumeCbm = shipment.isManualOverride
    ? decimal(shipment.volumeCbm, rolled.volumeCbm)
    : rolled.volumeCbm;
  const grossWeightKg = shipment.isManualOverride
    ? decimal(shipment.grossWeightKg, rolled.grossWeightKg)
    : rolled.grossWeightKg;

  if (rolled.itemsMissingWeight.length) {
    issues.push(
      `No derived weight for: ${rolled.itemsMissingWeight.join(', ')}. Freight will be understated.`,
    );
  }

  // Goods value in the quote currency, from the priced items.
  let goodsValue = 0;
  for (const item of quote.items) {
    const unit = decimal(item.unitCost, 0);
    const quantity = decimal(item.quantity, 1);
    const itemCurrency = item.costCurrency ?? currency;
    const rate = itemCurrency === currency ? 1 : (fxRates[itemCurrency] ?? 0);
    if (!rate) {
      issues.push(`No FX rate for ${itemCurrency}; "${item.nameSnapshot}" was not converted.`);
    }
    goodsValue += unit * quantity * (rate || 1);
  }

  const locked = shipment.components.filter((component) => component.isLocked);
  const lockedKinds = new Set(locked.map((component) => component.kind));

  const generated: ComponentInput[] = [];
  const push = (component: ComponentInput) => {
    // Never replace an actual with an estimate.
    if (!lockedKinds.has(component.kind)) generated.push(component);
  };

  push({
    kind: 'goods',
    label: 'Goods (ex-works)',
    amount: goodsValue,
    amountLow: null,
    amountHigh: null,
    currency,
    inCustomsBase: true,
    isRecoverable: false,
    isLocked: false,
  });

  const freight = await (
    await freightProvider()
  ).quote({
    mode: shipment.mode as FreightMode,
    originPort: shipment.originPort,
    destinationPort: shipment.destinationPort,
    containerType: shipment.containerType,
    containerCount: shipment.containerCount,
    volumeCbm,
    grossWeightKg,
    goodsValue,
    currency,
  });

  if (freight) {
    push({
      kind: 'freight',
      label: `Freight (${shipment.mode.replace('_', ' ').toUpperCase()})`,
      amount: freight.expected,
      amountLow: freight.low,
      amountHigh: freight.high,
      currency: freight.currency,
      inCustomsBase: true,
      isRecoverable: false,
      isLocked: false,
    });
  } else if (!lockedKinds.has('freight')) {
    // Explicit, not silent: a shipment with no freight line is not free.
    issues.push(
      `No freight rate for ${shipment.originPort} to ${shipment.destinationPort} by ${shipment.mode}. Add a manual freight line or a rate card entry.`,
    );
  }

  // Marine insurance on the goods value. Part of CIF, so it is inside the
  // customs base.
  if (settings.insurancePercent > 0) {
    push({
      kind: 'insurance',
      label: `Marine insurance (${settings.insurancePercent}%)`,
      amount: (goodsValue * settings.insurancePercent) / 100,
      amountLow: null,
      amountHigh: null,
      currency,
      inCustomsBase: true,
      isRecoverable: false,
      isLocked: false,
    });
  }

  const storage = await (
    await storageProvider()
  ).quote({
    port: shipment.destinationPort,
    containerType: shipment.containerType,
    containerCount: shipment.containerCount,
    expectedDays: shipment.expectedStorageDays,
  });

  if (storage) {
    push({
      kind: 'port_storage',
      label: `Port storage (${shipment.expectedStorageDays} days expected)`,
      amount: storage.expected,
      amountLow: storage.low,
      amountHigh: storage.high,
      currency: storage.currency,
      // Post-import: must stay OUT of the customs base or it inflates duty.
      inCustomsBase: false,
      isRecoverable: false,
      isLocked: false,
    });
  }

  await prisma.$transaction(async (tx) => {
    // Replace estimates wholesale; actuals and anything hand-entered survive.
    await tx.costComponent.deleteMany({
      where: { shipmentId: shipment.id, isLocked: false, source: 'rate_card' },
    });

    await tx.costComponent.createMany({
      data: generated.map((component, index) => ({
        id: uuidv7(),
        shipmentId: shipment.id,
        kind: component.kind,
        label: component.label,
        source: 'rate_card',
        providerCode: 'rate_card',
        amount: round2(component.amount),
        amountLow: component.amountLow === null ? null : round2(component.amountLow),
        amountHigh: component.amountHigh === null ? null : round2(component.amountHigh),
        currency: component.currency,
        inCustomsBase: component.inCustomsBase,
        isRecoverable: component.isRecoverable,
        isLocked: false,
        basis:
          component.kind === 'freight' && freight?.breakdown
            ? (freight.breakdown as object)
            : component.kind === 'port_storage' && storage?.breakdown
              ? (storage.breakdown as object)
              : undefined,
        sortOrder: index,
      })),
    });

    if (!shipment.isManualOverride) {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: { volumeCbm: round3(volumeCbm), grossWeightKg: round3(grossWeightKg) },
      });
    }
  });

  // Persist the per-item landed cost so the items table can show "what does
  // this one door cost" without recomputing the whole chain on every render.
  const recomputed = await getQuoteDetail(quoteId);
  if (recomputed) {
    const band = computeLandedBand(await buildLandedInput(recomputed));
    await Promise.all(
      band.expected.items.map((row) =>
        prisma.quoteItem.update({
          where: { id: row.id },
          data: { landedUnitCost: row.landedUnitCost },
        }),
      ),
    );
    issues.push(...band.expected.issues);
  }

  return { issues };
}

/**
 * Assemble the calculator's input from stored rows. Duty and VAT rates come
 * from each item's HS code, which is what makes a mixed-HS container correct.
 */
export async function buildLandedInput(quote: QuoteDetail): Promise<LandedInput> {
  const settings = await getLandedSettings();
  const currency = quote.quoteCurrency;
  const fxRates = (quote.fxRates as Record<string, number> | null) ?? settings.fxRates;

  const components: ComponentInput[] = (quote.shipment?.components ?? []).map((component) => ({
    id: component.id,
    kind: component.kind as CostKind,
    label: component.label,
    amount: decimal(component.amount),
    amountLow: component.amountLow === null ? null : decimal(component.amountLow),
    amountHigh: component.amountHigh === null ? null : decimal(component.amountHigh),
    currency: component.currency,
    inCustomsBase: component.inCustomsBase,
    isRecoverable: component.isRecoverable,
    isLocked: component.isLocked,
  }));

  const items = quote.items.map((item) => {
    const quantity = decimal(item.quantity, 1);
    const unit = decimal(item.unitCost, 0);
    const itemCurrency = item.costCurrency ?? currency;
    const rate = itemCurrency === currency ? 1 : (fxRates[itemCurrency] ?? 1);
    return {
      id: item.id,
      quantity,
      goodsValue: unit * quantity * rate,
      dutyPercent: item.hsCode ? decimal(item.hsCode.dutyPercent, 5) : 5,
      vatPercent: item.hsCode ? decimal(item.hsCode.vatPercent, 5) : 5,
      hsCode: item.hsCode?.code ?? null,
    };
  });

  return {
    quoteCurrency: currency,
    fxRates: { ...settings.fxRates, ...fxRates },
    components,
    items,
    contingencyPercent: decimal(quote.contingencyPercent, settings.contingencyPercent),
    vatRecoverable: settings.vatRecoverable,
  };
}

export async function computeQuoteLanded(quote: QuoteDetail): Promise<LandedBand> {
  return computeLandedBand(await buildLandedInput(quote));
}

/**
 * Price the same shipment under all three freight modes so they can be compared
 * side by side. Modes are NEVER blended into one band — "the maximum" of an air
 * quote plus "the maximum" of sea port storage is a shipment that does not
 * exist.
 */
export async function compareFreightModes(
  quote: QuoteDetail,
): Promise<{ mode: FreightMode; expected: number | null; currency: string; note?: string }[]> {
  if (!quote.shipment) return [];
  const provider = await freightProvider();
  const rolled = rollUpShipmentMetrics(quote);
  const modes: FreightMode[] = ['sea_lcl', 'sea_fcl', 'air'];

  return Promise.all(
    modes.map(async (mode) => {
      const quoteResult = await provider.quote({
        mode,
        originPort: quote.shipment!.originPort,
        // Air normally routes to the airport, not the seaport.
        destinationPort: mode === 'air' ? 'AEDXB' : quote.shipment!.destinationPort,
        containerType: mode === 'sea_fcl' ? (quote.shipment!.containerType ?? '40HQ') : null,
        containerCount: quote.shipment!.containerCount ?? 1,
        volumeCbm: rolled.volumeCbm,
        grossWeightKg: rolled.grossWeightKg,
        goodsValue: 0,
        currency: quote.quoteCurrency,
      });
      return quoteResult
        ? { mode, expected: round2(quoteResult.expected), currency: quoteResult.currency }
        : { mode, expected: null, currency: quote.quoteCurrency, note: 'No rate on this lane' };
    }),
  );
}

function round2(value: number): number {
  return Math.round(value * 100 + Number.EPSILON) / 100;
}
function round3(value: number): number {
  return Math.round(value * 1000 + Number.EPSILON) / 1000;
}

export async function customsPreview(quote: QuoteDetail) {
  const input = await buildLandedInput(quote);
  const provider = await customsProvider();
  const freightAndInsurance = input.components
    .filter((c) => c.inCustomsBase && c.kind !== 'goods')
    .reduce((sum, c) => sum + c.amount, 0);
  const goodsTotal = input.items.reduce((sum, i) => sum + i.goodsValue, 0);

  return provider.quote({
    destinationPort: quote.shipment?.destinationPort ?? 'AEJEA',
    lines: input.items.map((item) => ({
      hsCode: item.hsCode,
      cifValue:
        item.goodsValue +
        (goodsTotal > 0 ? (freightAndInsurance * item.goodsValue) / goodsTotal : 0),
    })),
    currency: input.quoteCurrency,
  });
}
