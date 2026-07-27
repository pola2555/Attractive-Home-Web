import 'server-only';
import { prisma } from './prisma';

// Admin-side read-only customer + favorites reporting. Always paginated.

export type CustomerRow = {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  favoriteCount: number;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export async function listCustomers(opts: {
  q?: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: CustomerRow[]; total: number }> {
  const where = opts.q
    ? { OR: [{ email: { contains: opts.q, mode: 'insensitive' as const } }, { name: { contains: opts.q, mode: 'insensitive' as const } }] }
    : {};

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        _count: { select: { favorites: true } },
      },
    }),
  ]);

  return {
    total,
    rows: customers.map((c) => ({
      id: c.id,
      email: c.email,
      name: c.name,
      isActive: c.isActive,
      favoriteCount: c._count.favorites,
      lastLoginAt: c.lastLoginAt,
      createdAt: c.createdAt,
    })),
  };
}

export type TopProduct = { productId: string; name: string; count: number };

// Most-favorited products — uses the @@index([productId]) on customer_favorites.
export async function topFavoritedProducts(limit: number, locale = 'en'): Promise<TopProduct[]> {
  const grouped = await prisma.customerFavorite.groupBy({
    by: ['productId'],
    _count: { productId: true },
    orderBy: { _count: { productId: 'desc' } },
    take: limit,
  });
  if (grouped.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: grouped.map((g) => g.productId) } },
    select: {
      id: true,
      code: true,
      translations: { where: { localeCode: locale }, select: { name: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p.translations[0]?.name ?? p.code ?? p.id]));
  return grouped.map((g) => ({
    productId: g.productId,
    name: byId.get(g.productId) ?? g.productId,
    count: g._count.productId,
  }));
}
