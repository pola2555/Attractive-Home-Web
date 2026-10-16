import 'server-only';
import { prisma } from '@/lib/prisma';

// Loads the accessories a tree product can use — the ones it privately owns PLUS
// every public one — each with its bulk tiers, images, this product's placements
// on the canvas, and a count of how many OTHER products also use it (so the editor
// can block turning a shared accessory private). The shapes here are the single
// source of truth the canvas, the palette and the edit modal all read.

export type AccTier = { minQty: number; unitAmount: number };
export type AccImage = {
  s3Key: string;
  thumbKey: string | null;
  url: string;
  width: number | null;
  height: number | null;
};
export type AccAnchorKind = 'product' | 'base' | 'anode' | 'addon';
export type AccAttachment = { id: string; anchorKind: AccAnchorKind; anchorRef: string };
export type AccessoryVM = {
  id: string;
  name: string;
  category: string | null;
  colorName: string | null;
  colorHex: string | null;
  scope: 'private' | 'public';
  ownerProductId: string | null;
  pricingMode: 'per_item' | 'bulk';
  unitPrice: number | null;
  notes: string | null;
  tiers: AccTier[];
  images: AccImage[];
  // Only THIS product's placements (the edges to draw on its canvas).
  attachments: AccAttachment[];
  // Distinct OTHER products this accessory is attached in — used to disable the
  // "make private" option on a shared accessory.
  usedElsewhere: number;
};

const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE ?? '').replace(/\/$/, '');
const imgUrl = (s3Key: string) =>
  /^https?:\/\//.test(s3Key) ? s3Key : `${MEDIA_BASE}/${s3Key.replace(/^\/+/, '')}`;

export async function getAccessories(productId: string): Promise<AccessoryVM[]> {
  const rows = await prisma.accessory.findMany({
    where: { isActive: true, OR: [{ scope: 'public' }, { ownerProductId: productId }] },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    include: {
      tiers: { orderBy: { minQty: 'asc' } },
      images: { orderBy: { sortOrder: 'asc' } },
      attachments: { select: { id: true, productId: true, anchorKind: true, anchorRef: true } },
    },
  });
  return rows.map((a) => {
    const here = a.attachments.filter((x) => x.productId === productId);
    const others = new Set(
      a.attachments.filter((x) => x.productId !== productId).map((x) => x.productId),
    );
    return {
      id: a.id,
      name: a.name,
      category: a.category,
      colorName: a.colorName,
      colorHex: a.colorHex,
      scope: a.scope === 'public' ? 'public' : 'private',
      ownerProductId: a.ownerProductId,
      pricingMode: a.pricingMode === 'bulk' ? 'bulk' : 'per_item',
      unitPrice: a.unitPrice === null ? null : a.unitPrice.toNumber(),
      notes: a.notes,
      tiers: a.tiers.map((t) => ({ minQty: t.minQty, unitAmount: t.unitAmount.toNumber() })),
      images: a.images.map((im) => ({
        s3Key: im.s3Key,
        thumbKey: im.thumbKey,
        url: imgUrl(im.s3Key),
        width: im.width,
        height: im.height,
      })),
      attachments: here.map((x) => ({
        id: x.id,
        anchorKind: x.anchorKind as AccAnchorKind,
        anchorRef: x.anchorRef,
      })),
      usedElsewhere: others.size,
    };
  });
}
