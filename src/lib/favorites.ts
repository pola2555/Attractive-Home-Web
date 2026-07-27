import 'server-only';
import { prisma } from './prisma';
import { productCardInclude } from './catalog';

// Server-side customer favorites reads. Mutations live in the account server
// actions; these helpers feed the favorites provider + the favorites page.

// The ids a customer has favorited (small, bounded per customer) — used to mark
// cards site-wide via the client FavoritesProvider.
export async function getFavoriteProductIds(customerId: string): Promise<string[]> {
  const rows = await prisma.customerFavorite.findMany({
    where: { customerId },
    select: { productId: true },
  });
  return rows.map((r) => r.productId);
}

// Favorited products, newest first, shaped for ProductCard. Unpublished ones are
// skipped so the account page never surfaces hidden catalog entries.
export async function listFavoriteProducts(customerId: string, locale: string) {
  const rows = await prisma.customerFavorite.findMany({
    where: { customerId, product: { isPublished: true } },
    orderBy: { createdAt: 'desc' },
    include: { product: { include: productCardInclude(locale) } },
  });
  return rows.map((r) => r.product);
}
