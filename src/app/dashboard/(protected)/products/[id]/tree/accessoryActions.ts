'use server';

import { revalidatePath } from 'next/cache';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import type { FormState } from './actions';

// Server actions for tree-configurator accessories (locks, hinges, pamphlets…).
// An accessory is its own record — PUBLIC (offered to every tree product) or
// PRIVATE (owned by one) — that attaches to the canvas as a node pointing at any
// tree node(s). Pricing is per-item (unit × qty) or bulk price breaks; a save is
// refused until a mode is chosen. Everything funnels through the product's
// template id so a caller can never touch another product's tree.

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function nullableStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}
function normHex(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return null;
}
function rev(productId: string) {
  revalidatePath(`/dashboard/products/${productId}/tree`);
}
async function templateIdOf(productId: string): Promise<string | null> {
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { templateId: true } });
  return p?.templateId ?? null;
}

const tierSchema = z.object({
  minQty: z.coerce.number().int().min(1),
  unitAmount: z.coerce.number().min(0),
});
const imageSchema = z.object({
  s3Key: z.string().min(1).max(500),
  thumbKey: z.string().max(500).nullish(),
  width: z.coerce.number().int().nullish(),
  height: z.coerce.number().int().nullish(),
});

type ParsedFields = {
  pricingMode: 'per_item' | 'bulk';
  unitPrice: number | null;
  tiers: { minQty: number; unitAmount: number }[];
  images: z.infer<typeof imageSchema>[];
};

// The pricing + images common to create and update. The product REFUSES to save
// until a pricing mode is chosen and its price(s) are present — the user's rule.
function parseFields(fd: FormData): ParsedFields | { error: string } {
  const mode = str(fd, 'pricingMode');
  if (mode !== 'per_item' && mode !== 'bulk') {
    return { error: 'Choose a pricing mode (per item or bulk) before saving.' };
  }
  let unitPrice: number | null = null;
  let tiers: { minQty: number; unitAmount: number }[] = [];
  if (mode === 'per_item') {
    const raw = str(fd, 'unitPrice');
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n) || n < 0) {
      return { error: 'Enter a unit price for per-item pricing.' };
    }
    unitPrice = n;
  } else {
    let raw: unknown;
    try {
      raw = JSON.parse(str(fd, 'tiersJson') || '[]');
    } catch {
      return { error: 'Could not read the bulk tiers.' };
    }
    const p = z.array(tierSchema).max(50).safeParse(raw);
    if (!p.success || p.data.length === 0) {
      return { error: 'Add at least one bulk tier (a quantity and its unit price).' };
    }
    const seen = new Set<number>();
    for (const t of p.data) {
      if (seen.has(t.minQty)) return { error: 'Each bulk tier needs a different quantity.' };
      seen.add(t.minQty);
    }
    tiers = [...p.data].sort((a, b) => a.minQty - b.minQty);
  }
  let images: z.infer<typeof imageSchema>[] = [];
  let rawImg: unknown;
  try {
    rawImg = JSON.parse(str(fd, 'imagesJson') || '[]');
  } catch {
    rawImg = [];
  }
  const pi = z.array(imageSchema).max(20).safeParse(rawImg);
  if (pi.success) images = pi.data;
  return { pricingMode: mode, unitPrice, tiers, images };
}

// Does an anchor point at something real in THIS product's template?
async function anchorResolves(templateId: string, kind: string, ref: string): Promise<boolean> {
  if (kind === 'product') {
    const v = await prisma.configVariant.findUnique({ where: { id: ref }, select: { templateId: true } });
    return !!v && v.templateId === templateId;
  }
  if (kind === 'base' || kind === 'anode') {
    const n = await prisma.configPriceNode.findUnique({
      where: { id: ref },
      select: { addonId: true, variant: { select: { templateId: true } } },
    });
    if (!n || n.variant.templateId !== templateId) return false;
    return kind === 'base' ? n.addonId === null : n.addonId !== null;
  }
  if (kind === 'addon') {
    const a = await prisma.configAddon.findUnique({
      where: { id: ref },
      select: { variant: { select: { templateId: true } } },
    });
    return !!a && a.variant.templateId === templateId;
  }
  return false;
}

async function attachInternal(
  templateId: string,
  accessoryId: string,
  productId: string,
  anchorKind: string,
  anchorRef: string,
): Promise<void> {
  if (!['product', 'base', 'anode', 'addon'].includes(anchorKind)) return;
  if (!(await anchorResolves(templateId, anchorKind, anchorRef))) return;
  await prisma.accessoryAttachment.upsert({
    where: {
      accessoryId_productId_anchorKind_anchorRef: { accessoryId, productId, anchorKind, anchorRef },
    },
    update: {},
    create: { id: uuidv7(), accessoryId, productId, anchorKind, anchorRef },
  });
}

// Available to this product = public, or privately owned by it.
async function availableHere(accessoryId: string, productId: string) {
  const acc = await prisma.accessory.findUnique({
    where: { id: accessoryId },
    select: { id: true, scope: true, ownerProductId: true },
  });
  if (!acc) return null;
  if (acc.scope !== 'public' && acc.ownerProductId !== productId) return null;
  return acc;
}

export async function createAccessory(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return { error: 'This is not a tree product.' };

  const name = str(fd, 'name');
  if (!name) return { error: 'Name the accessory.' };
  const parsed = parseFields(fd);
  if ('error' in parsed) return { error: parsed.error };

  const scope = str(fd, 'scope') === 'public' ? 'public' : 'private';
  const id = uuidv7();
  await prisma.$transaction(async (tx) => {
    await tx.accessory.create({
      data: {
        id,
        name,
        category: nullableStr(fd, 'category'),
        colorName: nullableStr(fd, 'colorName'),
        colorHex: normHex(str(fd, 'colorHex')),
        scope,
        ownerProductId: scope === 'private' ? productId : null,
        pricingMode: parsed.pricingMode,
        unitPrice: parsed.unitPrice,
        notes: nullableStr(fd, 'notes'),
      },
    });
    if (parsed.tiers.length) {
      await tx.accessoryPriceTier.createMany({
        data: parsed.tiers.map((t) => ({
          id: uuidv7(),
          accessoryId: id,
          minQty: t.minQty,
          unitAmount: t.unitAmount,
        })),
      });
    }
    if (parsed.images.length) {
      await tx.accessoryImage.createMany({
        data: parsed.images.map((im, i) => ({
          id: uuidv7(),
          accessoryId: id,
          sortOrder: i,
          s3Key: im.s3Key,
          thumbKey: im.thumbKey ?? null,
          width: im.width ?? null,
          height: im.height ?? null,
        })),
      });
    }
  });

  // Optionally place it straight away (created from a node on the canvas).
  const anchorKind = str(fd, 'anchorKind');
  const anchorRef = str(fd, 'anchorRef');
  if (anchorKind && anchorRef) await attachInternal(templateId, id, productId, anchorKind, anchorRef);

  await writeAudit({
    userId: user.id,
    entityType: 'accessory',
    entityId: id,
    action: 'create',
    diff: { name: { from: null, to: name } },
  });
  rev(productId);
  return { ok: true };
}

export async function updateAccessory(
  productId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return { error: 'This is not a tree product.' };

  const accessoryId = str(fd, 'accessoryId');
  const acc = await prisma.accessory.findUnique({
    where: { id: accessoryId },
    select: {
      scope: true,
      ownerProductId: true,
      attachments: { select: { productId: true } },
    },
  });
  if (!acc) return { error: 'Unknown accessory.' };
  if (acc.scope !== 'public' && acc.ownerProductId !== productId) {
    return { error: 'This accessory belongs to another product.' };
  }

  const name = str(fd, 'name');
  if (!name) return { error: 'Name the accessory.' };
  const parsed = parseFields(fd);
  if ('error' in parsed) return { error: parsed.error };

  // Scope: public → private only when it is not attached in any OTHER product.
  const wantScope = str(fd, 'scope') === 'public' ? 'public' : 'private';
  let ownerProductId = acc.ownerProductId;
  if (wantScope === 'public') {
    ownerProductId = null;
  } else {
    const others = new Set(
      acc.attachments.filter((x) => x.productId !== productId).map((x) => x.productId),
    );
    if (others.size > 0) {
      return {
        error: `Can't make this private — it's used by ${others.size} other tree product${
          others.size === 1 ? '' : 's'
        }. Remove it from them first.`,
      };
    }
    ownerProductId = productId;
  }

  await prisma.$transaction(async (tx) => {
    await tx.accessory.update({
      where: { id: accessoryId },
      data: {
        name,
        category: nullableStr(fd, 'category'),
        colorName: nullableStr(fd, 'colorName'),
        colorHex: normHex(str(fd, 'colorHex')),
        notes: nullableStr(fd, 'notes'),
        scope: wantScope,
        ownerProductId,
        pricingMode: parsed.pricingMode,
        unitPrice: parsed.unitPrice,
      },
    });
    await tx.accessoryPriceTier.deleteMany({ where: { accessoryId } });
    if (parsed.tiers.length) {
      await tx.accessoryPriceTier.createMany({
        data: parsed.tiers.map((t) => ({
          id: uuidv7(),
          accessoryId,
          minQty: t.minQty,
          unitAmount: t.unitAmount,
        })),
      });
    }
    await tx.accessoryImage.deleteMany({ where: { accessoryId } });
    if (parsed.images.length) {
      await tx.accessoryImage.createMany({
        data: parsed.images.map((im, i) => ({
          id: uuidv7(),
          accessoryId,
          sortOrder: i,
          s3Key: im.s3Key,
          thumbKey: im.thumbKey ?? null,
          width: im.width ?? null,
          height: im.height ?? null,
        })),
      });
    }
  });

  await writeAudit({
    userId: user.id,
    entityType: 'accessory',
    entityId: accessoryId,
    action: 'update',
    diff: { name: { from: null, to: name } },
  });
  rev(productId);
  return { ok: true };
}

export async function deleteAccessory(productId: string, fd: FormData): Promise<void> {
  const user = await requirePermission('pricing.write');
  const accessoryId = str(fd, 'accessoryId');
  const acc = await availableHere(accessoryId, productId);
  if (!acc) return;
  // Cascades its tiers, images and every attachment (in every product that used it).
  await prisma.accessory.delete({ where: { id: accessoryId } });
  await writeAudit({
    userId: user.id,
    entityType: 'accessory',
    entityId: accessoryId,
    action: 'delete',
    diff: { removed: { from: true, to: null } },
  });
  rev(productId);
}

export async function attachAccessory(productId: string, fd: FormData): Promise<void> {
  await requirePermission('pricing.write');
  const templateId = await templateIdOf(productId);
  if (!templateId) return;
  const accessoryId = str(fd, 'accessoryId');
  if (!(await availableHere(accessoryId, productId))) return;
  await attachInternal(templateId, accessoryId, productId, str(fd, 'anchorKind'), str(fd, 'anchorRef'));
  rev(productId);
}

export async function detachAccessory(productId: string, fd: FormData): Promise<void> {
  await requirePermission('pricing.write');
  const accessoryId = str(fd, 'accessoryId');
  const anchorKind = str(fd, 'anchorKind');
  const anchorRef = str(fd, 'anchorRef');
  await prisma.accessoryAttachment
    .delete({
      where: {
        accessoryId_productId_anchorKind_anchorRef: { accessoryId, productId, anchorKind, anchorRef },
      },
    })
    .catch(() => {});
  rev(productId);
}
