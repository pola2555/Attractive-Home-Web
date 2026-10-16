import 'server-only';
import { prisma } from '@/lib/prisma';
import type { AccessoryDef } from '@/lib/configurator/accessories';

// Accessories offered when configuring a template in a quote: every PUBLIC one,
// plus the PRIVATE ones owned by any product that uses this template. (Tree
// products are 1:1 with their cloned template, so in practice that is this
// product's own accessories.) Returns the pure `AccessoryDef` shape the quote
// configurator and the pricing engine both read.
export async function getAccessoryDefsForTemplate(templateId: string): Promise<AccessoryDef[]> {
  const products = await prisma.product.findMany({
    where: { templateId },
    select: { id: true },
  });
  const productIds = products.map((p) => p.id);

  const rows = await prisma.accessory.findMany({
    where: {
      isActive: true,
      OR: [
        { scope: 'public' },
        ...(productIds.length ? [{ ownerProductId: { in: productIds } }] : []),
      ],
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    include: { tiers: { orderBy: { minQty: 'asc' } } },
  });

  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    colorName: a.colorName,
    pricingMode: a.pricingMode === 'bulk' ? 'bulk' : 'per_item',
    unitPrice: a.unitPrice === null ? null : a.unitPrice.toNumber(),
    tiers: a.tiers.map((t) => ({ minQty: t.minQty, unitAmount: t.unitAmount.toNumber() })),
  }));
}
