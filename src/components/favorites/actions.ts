'use server';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireCustomer } from '@/lib/customer-auth';

// Favorite mutations, called from the client FavoritesProvider. Kept on a
// bracket-free path so a client component can import them cleanly.

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

export async function toggleFavorite(productId: string): Promise<{ favorited: boolean; authed: boolean }> {
  const customer = await requireCustomer();
  if (!customer) return { favorited: false, authed: false };
  if (!UUID_RE.test(productId)) return { favorited: false, authed: true };

  const key = { customerId_productId: { customerId: customer.id, productId } };
  const existing = await prisma.customerFavorite.findUnique({ where: key, select: { customerId: true } });

  if (existing) {
    await prisma.customerFavorite.delete({ where: key });
    return { favorited: false, authed: true };
  }

  try {
    await prisma.customerFavorite.create({ data: { customerId: customer.id, productId } });
  } catch (err) {
    // Product no longer exists (P2003) — treat as not-favorited, never crash.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return { favorited: false, authed: true };
    }
    throw err;
  }
  return { favorited: true, authed: true };
}

// One-time merge of the anonymous localStorage shortlist into server favorites
// on first login. Ignores unknown/duplicate ids. Returns the full favorite set.
export async function mergeFavorites(productIds: string[]): Promise<{ ids: string[]; authed: boolean }> {
  const customer = await requireCustomer();
  if (!customer) return { ids: [], authed: false };

  const clean = Array.from(new Set(productIds.filter((id) => typeof id === 'string' && UUID_RE.test(id))));
  if (clean.length) {
    // Only reference products that actually exist to avoid FK errors.
    const existing = await prisma.product.findMany({ where: { id: { in: clean } }, select: { id: true } });
    if (existing.length) {
      await prisma.customerFavorite.createMany({
        data: existing.map((p) => ({ customerId: customer.id, productId: p.id })),
        skipDuplicates: true,
      });
    }
  }

  const rows = await prisma.customerFavorite.findMany({
    where: { customerId: customer.id },
    select: { productId: true },
  });
  return { ids: rows.map((r) => r.productId), authed: true };
}
