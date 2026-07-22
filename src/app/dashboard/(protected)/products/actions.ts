'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';

// Price entry — the reason prices exist on products now (docs/DATABASE.md
// "Locked decisions"): default 0, data-entry fills them. The price_unit
// vocabulary is an OPEN DECISION (README), so it stays free text here.
const priceSchema = z.object({
  price: z.coerce.number().min(0).max(9_999_999_999),
  priceUnit: z
    .string()
    .trim()
    .max(50)
    .transform((v) => v || null),
});

export async function updateProductPrice(productId: string, formData: FormData): Promise<void> {
  const user = await requirePermission('catalog.write');
  const parsed = priceSchema.safeParse({
    price: formData.get('price'),
    priceUnit: formData.get('priceUnit') ?? '',
  });
  if (!parsed.success) return;

  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  const oldPrice = Number(product.price);
  if (oldPrice === parsed.data.price && product.priceUnit === parsed.data.priceUnit) return;

  await prisma.product.update({
    where: { id: productId },
    data: { price: parsed.data.price, priceUnit: parsed.data.priceUnit },
  });
  await writeAudit({
    userId: user.id,
    entityType: 'product',
    entityId: product.legacyId,
    action: 'update',
    diff: {
      price: { from: oldPrice, to: parsed.data.price },
      price_unit: { from: product.priceUnit, to: parsed.data.priceUnit },
    },
  });
  revalidatePath('/dashboard/products');
}
