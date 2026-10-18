import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getFacetOptions } from '@/lib/catalogAdmin';
import { productMediaUrl } from '@/lib/media';
import ProductsToolbar from './ProductsToolbar';
import ProductsTable, { type ProductRow } from './ProductsTable';
import ProductsGrid from './ProductsGrid';
import ReviewTour from './ReviewTour';

type SP = Record<string, string | undefined>;

const ORDER: Record<string, Prisma.ProductOrderByWithRelationInput[]> = {
  new: [{ createdAt: 'desc' }, { legacyId: 'asc' }],
  updated: [{ updatedAt: 'desc' }, { legacyId: 'asc' }],
  priceAsc: [{ price: 'asc' }, { legacyId: 'asc' }],
  priceDesc: [{ price: 'desc' }, { legacyId: 'asc' }],
  featured: [{ featuredRank: 'asc' }, { legacyId: 'asc' }],
  code: [{ code: 'asc' }, { legacyId: 'asc' }],
};

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

// Which query param maps to which product scalar FK.
const FACET_FIELD: Record<string, keyof Prisma.ProductWhereInput> = {
  source: 'sourceId',
  type: 'typeId',
  material: 'materialId',
  look: 'lookId',
  color: 'colorId',
  brand: 'brandId',
  collection: 'collectionId',
};

function buildWhere(sp: SP): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};
  const and: Prisma.ProductWhereInput[] = [];

  const q = sp.q?.trim();
  if (q) {
    and.push({
      OR: [
        { code: { contains: q, mode: 'insensitive' } },
        { legacyId: { contains: q, mode: 'insensitive' } },
        { translations: { some: { name: { contains: q, mode: 'insensitive' } } } },
      ],
    });
  }

  for (const [param, field] of Object.entries(FACET_FIELD)) {
    const val = sp[param];
    if (val) and.push({ [field]: val } as Prisma.ProductWhereInput);
  }

  if (sp.pub === 'no') and.push({ isPublished: false });
  if (sp.pub === 'yes') and.push({ isPublished: true });
  if (sp.avail === 'no') and.push({ isAvailable: false });
  if (sp.avail === 'yes') and.push({ isAvailable: true });
  if (sp.img === 'no') and.push({ images: { none: {} } });
  if (sp.img === 'yes') and.push({ images: { some: {} } });
  if (sp.priced === 'no') and.push({ price: 0 });
  if (sp.priced === 'yes') and.push({ price: { gt: 0 } });
  if (sp.featured === '1') and.push({ featuredRank: { not: null } });
  if (sp.noname === '1') and.push({ translations: { none: { localeCode: 'en' } } });
  if (sp.nomat === '1') and.push({ materialId: null });
  if (sp.notype === '1') and.push({ typeId: null });
  if (sp.noroom === '1') and.push({ applications: { none: {} } });
  if (sp.review === 'new' || sp.review === 'reviewed' || sp.review === 'ask_client') {
    and.push({ reviewStatus: sp.review });
  }

  if (and.length) where.AND = and;
  return where;
}

export default async function DashboardProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('catalog.read')) redirect('/dashboard');
  const canWrite = permissions.has('catalog.write');

  const sp = await searchParams;
  const view = sp.view === 'cards' ? 'cards' : 'table';
  const size = [50, 100, 200].includes(Number(sp.size)) ? Number(sp.size) : 50;
  const page = Math.max(1, Number(sp.page) || 1);
  const orderBy = ORDER[sp.sort ?? 'new'] ?? ORDER.new;
  const where = buildWhere(sp);

  const [total, products, facets] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * size,
      take: size,
      include: {
        translations: { where: { localeCode: 'en' }, select: { name: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        source: { select: { code: true } },
        type: { select: { code: true, translations: { where: { localeCode: 'en' }, select: { name: true } } } },
        _count: { select: { images: true } },
      },
    }),
    getFacetOptions(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / size));

  const rows: ProductRow[] = products.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.translations[0]?.name ?? p.code ?? '—',
    thumb: p.images[0] ? productMediaUrl(p.images[0].thumbKey ?? p.images[0].s3Key, p.source.code) : null,
    price: Number(p.price),
    priceUnit: p.priceUnit ?? '',
    featuredRank: p.featuredRank === null ? '' : String(p.featuredRank),
    isPublished: p.isPublished,
    isAvailable: p.isAvailable,
    hasImage: p._count.images > 0,
    sourceCode: p.source.code,
    typeName: p.type ? (p.type.translations[0]?.name ?? p.type.code) : '',
    reviewStatus: p.reviewStatus,
    updated: dateFmt.format(p.updatedAt),
  }));

  const buildHref = (o: { page?: number; view?: string }) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== 'page' && k !== 'view') params.set(k, v);
    const nextView = o.view ?? view;
    if (nextView === 'cards') params.set('view', 'cards');
    if ((o.page ?? 1) > 1) params.set('page', String(o.page));
    const s = params.toString();
    return `/dashboard/products${s ? `?${s}` : ''}`;
  };

  // Carry the current filters into a review session (status is forced to
  // not-reviewed there, so review/pub/avail/etc. are dropped).
  const reviewParams = new URLSearchParams();
  const CARRY = ['q', 'source', 'type', 'look', 'material', 'collection', 'img', 'noname', 'nomat'];
  for (const [k, v] of Object.entries(sp)) if (v && CARRY.includes(k)) reviewParams.set(k, v);
  const reviewHref = `/dashboard/products/review${reviewParams.toString() ? `?${reviewParams}` : ''}`;

  const tabCls = (on: boolean) => `px-3 py-2 text-sm ${on ? 'bg-accent-2/15 text-heading font-medium' : 'text-ink hover:bg-accent-2/10'}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-heading">
          Products <span className="text-muted text-base font-normal">({total.toLocaleString()})</span>
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-line overflow-hidden">
            <Link href={buildHref({ view: 'table', page: 1 })} className={tabCls(view === 'table')}>
              Table
            </Link>
            <Link href={buildHref({ view: 'cards', page: 1 })} className={tabCls(view === 'cards')}>
              Cards
            </Link>
          </div>
          <ReviewTour />
          {canWrite && (
            <Link href={reviewHref} className="px-4 py-2 rounded-lg border border-accent text-accent hover:bg-accent-2/10 text-sm whitespace-nowrap">
              ▶ Review session
            </Link>
          )}
          {canWrite && (
            <Link href="/dashboard/products/new" className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white text-sm whitespace-nowrap">
              + New product
            </Link>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <ProductsToolbar facets={facets} total={total} />
      </Suspense>

      {view === 'cards' ? (
        <ProductsGrid key={JSON.stringify(sp)} rows={rows} canWrite={canWrite} />
      ) : (
        <ProductsTable key={JSON.stringify(sp)} rows={rows} facets={facets} canWrite={canWrite} />
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-4 mt-8" aria-label="Pagination">
          {page > 1 && (
            <Link href={buildHref({ page: page - 1 })} className="px-4 py-2 rounded-lg bg-surface border border-line text-ink">
              Previous
            </Link>
          )}
          <span className="text-muted text-sm">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={buildHref({ page: page + 1 })} className="px-4 py-2 rounded-lg bg-surface border border-line text-ink">
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
