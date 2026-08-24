'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { CONFLICT_MESSAGE, parseExpectedUpdatedAt, versionMatches } from '@/lib/optimisticLock';
import { getTemplate, getProductRules } from '@/lib/configuratorAdmin';
import { getLandedSettings } from '@/lib/landed/settings';
import {
  FROZEN_MESSAGE,
  isEditable,
  isQuoteStatus,
  nextQuoteReference,
  recostShipment,
} from '@/lib/quotesAdmin';
import { priceConfiguration, pricingInputsHash } from '@/lib/configurator/price';
import { describeSelection, resolveConfiguration } from '@/lib/configurator/resolve';
import type { Selection } from '@/lib/configurator/types';

export type FormState = { error?: string; ok?: boolean };

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function nullableStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}
function nullableInt(value: string): number | null {
  if (value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}
function nullableNum(value: string): number | null {
  if (value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// The posted selection, straight from the client configurator. It is re-run
// through the engine server-side before anything is stored: the browser's price
// is a preview, never the number we save.
const selectionSchema = z.record(
  z.string(),
  z.object({
    groupCode: z.string(),
    valueCodes: z.array(z.string()).default([]),
    quantities: z.record(z.string(), z.number()).optional(),
    numericValue: z.number().nullable().default(null),
    valueIds: z.array(z.string()).optional(),
  }),
);

function parseSelection(fd: FormData): Selection | null {
  const raw = str(fd, 'selectionJson');
  if (!raw) return null;
  try {
    const parsed = selectionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as Selection) : null;
  } catch {
    return null;
  }
}

// Every mutation funnels through this. A sent quote does not move.
async function loadEditableQuote(quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { id: true, status: true, reference: true, updatedAt: true, quoteCurrency: true },
  });
  if (!quote) return { error: 'Quote not found.' as const };
  if (!isEditable(quote.status)) return { error: FROZEN_MESSAGE };
  return { quote };
}

// ---------------------------------------------------------------------------
// Quote lifecycle
// ---------------------------------------------------------------------------

export async function createQuote(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('quotes.write');
  const settings = await getLandedSettings();
  const id = uuidv7();
  const reference = await nextQuoteReference();

  await prisma.$transaction(async (tx) => {
    await tx.quote.create({
      data: {
        id,
        reference,
        status: 'draft',
        title: nullableStr(fd, 'title'),
        leadId: nullableStr(fd, 'leadId'),
        createdBy: user.id,
        assignedTo: user.id,
        quoteCurrency: 'AED',
        // Snapshotted now, so a later FX move cannot rewrite this quote.
        fxRates: settings.fxRates,
        fxRatesAt: new Date(),
        contingencyPercent: settings.contingencyPercent,
      },
    });
    // Every quote gets a shipment up front: goods that are not shipped are not
    // a quote, and an empty shipment panel is easier to reason about than a
    // missing one.
    await tx.shipment.create({ data: { id: uuidv7(), quoteId: id } });
  });

  await writeAudit({
    userId: user.id,
    entityType: 'quote',
    entityId: id,
    action: 'create',
    diff: { reference: { from: null, to: reference } },
  });

  revalidatePath('/dashboard/quotes');
  redirect(`/dashboard/quotes/${id}`);
}

export async function updateQuote(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('quotes.write');
  const quoteId = str(fd, 'quoteId');

  const current = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!current) return { error: 'Quote not found.' };

  const expected = parseExpectedUpdatedAt(fd);
  if (!versionMatches(current.updatedAt, expected)) return { error: CONFLICT_MESSAGE };

  const status = str(fd, 'status');
  if (status && !isQuoteStatus(status)) return { error: 'Unknown status.' };

  // Everything except the status itself freezes once sent — the status has to
  // stay editable so a sent quote can still be marked accepted or expired.
  const changingMoreThanStatus =
    nullableStr(fd, 'title') !== current.title ||
    nullableStr(fd, 'notes') !== current.notes ||
    str(fd, 'contingencyPercent') !== String(current.contingencyPercent);
  if (!isEditable(current.status) && changingMoreThanStatus) {
    return { error: FROZEN_MESSAGE };
  }

  const contingency = nullableNum(str(fd, 'contingencyPercent'));
  const validUntil = str(fd, 'validUntil');

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      title: nullableStr(fd, 'title'),
      notes: nullableStr(fd, 'notes'),
      status: status || current.status,
      assignedTo: nullableStr(fd, 'assignedTo'),
      contingencyPercent: contingency ?? current.contingencyPercent,
      validUntil: validUntil ? new Date(validUntil) : null,
    },
  });

  await writeAudit({
    userId: user.id,
    entityType: 'quote',
    entityId: quoteId,
    action: 'update',
    diff:
      status && status !== current.status
        ? { status: { from: current.status, to: status } }
        : undefined,
  });

  revalidatePath(`/dashboard/quotes/${quoteId}`);
  revalidatePath('/dashboard/quotes');
  return { ok: true };
}

export async function deleteQuote(fd: FormData): Promise<void> {
  const user = await requirePermission('quotes.write');
  const quoteId = str(fd, 'quoteId');
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) return;

  // Hard delete + audit row (docs/DATABASE.md §1: no soft delete).
  await prisma.quote.delete({ where: { id: quoteId } });
  await writeAudit({
    userId: user.id,
    entityType: 'quote',
    entityId: quoteId,
    action: 'delete',
    diff: { reference: { from: quote.reference, to: null } },
  });

  revalidatePath('/dashboard/quotes');
  redirect('/dashboard/quotes');
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function addQuoteItem(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('quotes.write');
  const quoteId = str(fd, 'quoteId');
  const loaded = await loadEditableQuote(quoteId);
  if ('error' in loaded) return { error: loaded.error };

  const templateId = str(fd, 'templateId');
  const template = await getTemplate(templateId);
  if (!template) return { error: 'Configuration template not found.' };

  const selection = parseSelection(fd);
  if (!selection) return { error: 'The configuration could not be read. Try again.' };

  const quantity = Number(str(fd, 'quantity') || '1');
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: 'Quantity must be positive.' };

  const productId = nullableStr(fd, 'productId');

  // Re-validated server-side. The client already showed these messages, but a
  // form post is not required to come from that client.
  const resolution = resolveConfiguration(template, selection, quantity);
  if (!resolution.isComplete) {
    return { error: resolution.issues[0]?.message ?? 'The configuration is incomplete.' };
  }

  const productRules = productId ? await getProductRules(productId) : [];
  const priced = priceConfiguration(template, selection, quantity, productRules);
  if (priced.issues.length) return { error: priced.issues[0] };

  // HS code: the item override, else the product's, else the settings default.
  const settings = await getLandedSettings();
  let hsCodeId = nullableStr(fd, 'hsCodeId');
  if (!hsCodeId && productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { hsCodeId: true },
    });
    hsCodeId = product?.hsCodeId ?? null;
  }
  if (!hsCodeId && settings.defaultHsCode) {
    const fallback = await prisma.hsCode.findUnique({ where: { code: settings.defaultHsCode } });
    hsCodeId = fallback?.id ?? null;
  }

  const last = await prisma.quoteItem.findFirst({
    where: { quoteId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const id = uuidv7();
  await prisma.quoteItem.create({
    data: {
      id,
      quoteId,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      productId,
      templateId: template.id,
      hsCodeId,
      quantity,
      nameSnapshot: str(fd, 'name') || template.name,
      codeSnapshot: nullableStr(fd, 'code'),
      selection: selection as object,
      selectionLabel: describeSelection(template, selection),
      derived: resolution.derived as object,
      unitCost: priced.unitCost,
      costCurrency: priced.currency,
      priceBreakdown: {
        lines: priced.breakdown,
        lineExtras: priced.lineExtras,
        quoteExtras: priced.quoteExtras,
      },
      pricedAt: new Date(),
      pricingInputsHash: pricingInputsHash([...template.rules, ...productRules]),
    },
  });

  await writeAudit({
    userId: user.id,
    entityType: 'quote_item',
    entityId: id,
    action: 'create',
    diff: { quote: { from: null, to: loaded.quote.reference } },
  });

  await recostShipment(quoteId);
  revalidatePath(`/dashboard/quotes/${quoteId}`);
  return { ok: true };
}

export async function updateQuoteItemQuantity(fd: FormData): Promise<void> {
  const user = await requirePermission('quotes.write');
  const itemId = str(fd, 'itemId');
  const item = await prisma.quoteItem.findUnique({
    where: { id: itemId },
    include: { quote: { select: { status: true } } },
  });
  if (!item || !isEditable(item.quote.status)) return;

  const quantity = Number(str(fd, 'quantity') || '1');
  if (!Number.isFinite(quantity) || quantity <= 0) return;

  // Quantity is an input to pricing (`__qty` tiers, per-line fees), so changing
  // it has to re-price the line rather than just scaling the total.
  const template = item.templateId ? await getTemplate(item.templateId) : null;
  const data: { quantity: number; unitCost?: number; priceBreakdown?: object; pricedAt?: Date } = {
    quantity,
  };

  if (template) {
    const selection = item.selection as Selection;
    const productRules = item.productId ? await getProductRules(item.productId) : [];
    const priced = priceConfiguration(template, selection, quantity, productRules);
    if (!priced.issues.length) {
      data.unitCost = priced.unitCost;
      data.priceBreakdown = {
        lines: priced.breakdown,
        lineExtras: priced.lineExtras,
        quoteExtras: priced.quoteExtras,
      };
      data.pricedAt = new Date();
    }
  }

  await prisma.quoteItem.update({ where: { id: itemId }, data });
  await writeAudit({
    userId: user.id,
    entityType: 'quote_item',
    entityId: itemId,
    action: 'update',
    diff: { quantity: { from: item.quantity.toString(), to: String(quantity) } },
  });

  await recostShipment(item.quoteId);
  revalidatePath(`/dashboard/quotes/${item.quoteId}`);
}

export async function removeQuoteItem(fd: FormData): Promise<void> {
  const user = await requirePermission('quotes.write');
  const itemId = str(fd, 'itemId');
  const item = await prisma.quoteItem.findUnique({
    where: { id: itemId },
    include: { quote: { select: { status: true } } },
  });
  if (!item || !isEditable(item.quote.status)) return;

  await prisma.quoteItem.delete({ where: { id: itemId } });
  await writeAudit({
    userId: user.id,
    entityType: 'quote_item',
    entityId: itemId,
    action: 'delete',
    diff: { name: { from: item.nameSnapshot, to: null } },
  });

  await recostShipment(item.quoteId);
  revalidatePath(`/dashboard/quotes/${item.quoteId}`);
}

// Re-price every line against the current rules — the "pricing changed since
// this was priced" banner's action.
export async function repriceQuote(fd: FormData): Promise<void> {
  const user = await requirePermission('quotes.write');
  const quoteId = str(fd, 'quoteId');
  const loaded = await loadEditableQuote(quoteId);
  if ('error' in loaded) return;

  const items = await prisma.quoteItem.findMany({ where: { quoteId } });
  for (const item of items) {
    if (!item.templateId) continue;
    const template = await getTemplate(item.templateId);
    if (!template) continue;
    const productRules = item.productId ? await getProductRules(item.productId) : [];
    const selection = item.selection as Selection;
    const quantity = item.quantity.toNumber();
    const resolution = resolveConfiguration(template, selection, quantity);
    const priced = priceConfiguration(template, selection, quantity, productRules);
    if (priced.issues.length) continue;

    await prisma.quoteItem.update({
      where: { id: item.id },
      data: {
        unitCost: priced.unitCost,
        costCurrency: priced.currency,
        derived: resolution.derived as object,
        selectionLabel: describeSelection(template, selection),
        priceBreakdown: {
          lines: priced.breakdown,
          lineExtras: priced.lineExtras,
          quoteExtras: priced.quoteExtras,
        },
        pricedAt: new Date(),
        pricingInputsHash: pricingInputsHash([...template.rules, ...productRules]),
      },
    });
  }

  await writeAudit({
    userId: user.id,
    entityType: 'quote',
    entityId: quoteId,
    action: 'update',
    diff: { repriced: { from: null, to: new Date().toISOString() } },
  });

  await recostShipment(quoteId);
  revalidatePath(`/dashboard/quotes/${quoteId}`);
}

// ---------------------------------------------------------------------------
// Shipment + landed cost
// ---------------------------------------------------------------------------

export async function updateShipment(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('quotes.write');
  const quoteId = str(fd, 'quoteId');
  const loaded = await loadEditableQuote(quoteId);
  if ('error' in loaded) return { error: loaded.error };

  const isManualOverride = fd.get('isManualOverride') === 'on';

  await prisma.shipment.update({
    where: { quoteId },
    data: {
      mode: str(fd, 'mode') || 'sea_lcl',
      originPort: str(fd, 'originPort') || 'CNSHA',
      destinationPort: str(fd, 'destinationPort') || 'AEJEA',
      incoterm: str(fd, 'incoterm') || 'FOB',
      containerType: nullableStr(fd, 'containerType'),
      containerCount: nullableInt(str(fd, 'containerCount')),
      expectedStorageDays: nullableInt(str(fd, 'expectedStorageDays')) ?? 0,
      isManualOverride,
      // Only honour the typed figures when the override box is ticked;
      // otherwise they are recomputed from the items on the next re-cost.
      ...(isManualOverride
        ? {
            volumeCbm: nullableNum(str(fd, 'volumeCbm')),
            grossWeightKg: nullableNum(str(fd, 'grossWeightKg')),
          }
        : {}),
      notes: nullableStr(fd, 'shipmentNotes'),
    },
  });

  await writeAudit({
    userId: user.id,
    entityType: 'shipment',
    entityId: quoteId,
    action: 'update',
    diff: { mode: { from: null, to: str(fd, 'mode') } },
  });

  const { issues } = await recostShipment(quoteId);
  revalidatePath(`/dashboard/quotes/${quoteId}`);
  return issues.length ? { error: issues.join(' ') } : { ok: true };
}

export async function recostQuote(fd: FormData): Promise<void> {
  await requirePermission('quotes.write');
  const quoteId = str(fd, 'quoteId');
  const loaded = await loadEditableQuote(quoteId);
  if ('error' in loaded) return;
  await recostShipment(quoteId);
  revalidatePath(`/dashboard/quotes/${quoteId}`);
}

export async function addCostComponent(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('quotes.write');
  const quoteId = str(fd, 'quoteId');
  const loaded = await loadEditableQuote(quoteId);
  if ('error' in loaded) return { error: loaded.error };

  const shipment = await prisma.shipment.findUnique({ where: { quoteId } });
  if (!shipment) return { error: 'This quote has no shipment.' };

  const amount = nullableNum(str(fd, 'amount'));
  if (amount === null) return { error: 'Amount is required.' };

  const kind = str(fd, 'kind') || 'other';
  const id = uuidv7();

  await prisma.costComponent.create({
    data: {
      id,
      shipmentId: shipment.id,
      kind,
      label: str(fd, 'label') || kind,
      source: 'manual',
      amount,
      amountLow: nullableNum(str(fd, 'amountLow')),
      amountHigh: nullableNum(str(fd, 'amountHigh')),
      currency: (str(fd, 'currency') || loaded.quote.quoteCurrency).toUpperCase(),
      // Only goods, freight and insurance form the CIF value duty is charged
      // on. Anything after import must stay out or it inflates duty AND VAT.
      inCustomsBase: fd.get('inCustomsBase') === 'on',
      isRecoverable: fd.get('isRecoverable') === 'on',
      isLocked: fd.get('isLocked') === 'on',
      sortOrder: 100,
    },
  });

  await writeAudit({
    userId: user.id,
    entityType: 'cost_component',
    entityId: id,
    action: 'create',
    diff: { kind: { from: null, to: kind } },
  });

  revalidatePath(`/dashboard/quotes/${quoteId}`);
  return { ok: true };
}

export async function toggleComponentLock(fd: FormData): Promise<void> {
  const user = await requirePermission('quotes.write');
  const componentId = str(fd, 'componentId');
  const component = await prisma.costComponent.findUnique({
    where: { id: componentId },
    include: { shipment: { select: { quoteId: true, quote: { select: { status: true } } } } },
  });
  if (!component || !isEditable(component.shipment.quote.status)) return;

  // Locking marks a line as an actual invoice: it stops carrying a band and
  // re-costing will no longer overwrite it.
  await prisma.costComponent.update({
    where: { id: componentId },
    data: { isLocked: !component.isLocked, source: !component.isLocked ? 'manual' : component.source },
  });

  await writeAudit({
    userId: user.id,
    entityType: 'cost_component',
    entityId: componentId,
    action: 'update',
    diff: { isLocked: { from: component.isLocked, to: !component.isLocked } },
  });

  revalidatePath(`/dashboard/quotes/${component.shipment.quoteId}`);
}

export async function deleteCostComponent(fd: FormData): Promise<void> {
  const user = await requirePermission('quotes.write');
  const componentId = str(fd, 'componentId');
  const component = await prisma.costComponent.findUnique({
    where: { id: componentId },
    include: { shipment: { select: { quoteId: true, quote: { select: { status: true } } } } },
  });
  if (!component || !isEditable(component.shipment.quote.status)) return;

  await prisma.costComponent.delete({ where: { id: componentId } });
  await writeAudit({
    userId: user.id,
    entityType: 'cost_component',
    entityId: componentId,
    action: 'delete',
    diff: { label: { from: component.label, to: null } },
  });

  revalidatePath(`/dashboard/quotes/${component.shipment.quoteId}`);
}
