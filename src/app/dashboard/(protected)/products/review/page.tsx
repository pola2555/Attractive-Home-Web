import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getFacetOptions } from '@/lib/catalogAdmin';
import { productMediaUrl } from '@/lib/media';
import ReviewSession, { type ReviewProduct } from './ReviewSession';

type SP = Record<string, string | undefined>;

// Review sessions pull only the NOT-reviewed, stock catalog. The grid's filters
// carry over through the query string so a session can be scoped (e.g. only
// Rexin laminates, or only one-image products).
const FACET_FIELD: Record<string, keyof Prisma.ProductWhereInput> = {
  source: 'sourceId',
  type: 'typeId',
  look: 'lookId',
  material: 'materialId',
  collection: 'collectionId',
};
const CAP = 150; // never load more than this into one session screen

export default async function ReviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('catalog.write')) redirect('/dashboard/products');

  const sp = await searchParams;
  const and: Prisma.ProductWhereInput[] = [{ reviewStatus: 'new' }, { kind: 'stock' }];
  const q = sp.q?.trim();
  if (q) {
    and.push({
      OR: [
        { code: { contains: q, mode: 'insensitive' } },
        { translations: { some: { name: { contains: q, mode: 'insensitive' } } } },
      ],
    });
  }
  for (const [param, field] of Object.entries(FACET_FIELD)) {
    if (sp[param]) and.push({ [field]: sp[param] } as Prisma.ProductWhereInput);
  }
  if (sp.img === 'no') and.push({ images: { none: {} } });
  if (sp.noname === '1') and.push({ translations: { none: { localeCode: 'en' } } });
  if (sp.nomat === '1') and.push({ materialId: null });
  const where: Prisma.ProductWhereInput = { AND: and };

  const [total, products, facets] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ legacyId: 'asc' }],
      take: CAP,
      include: {
        translations: { where: { localeCode: 'en' }, select: { name: true } },
        images: { orderBy: { sortOrder: 'asc' }, select: { thumbKey: true, s3Key: true } },
        source: { select: { code: true } },
        applications: { select: { applicationId: true } },
      },
    }),
    getFacetOptions(),
  ]);

  const queue: ReviewProduct[] = products.map((p) => ({
    id: p.id,
    code: p.code ?? '',
    name: p.translations[0]?.name ?? p.code ?? '—',
    sourceCode: p.source.code,
    typeId: p.typeId ?? '',
    lookId: p.lookId ?? '',
    materialId: p.materialId ?? '',
    collectionId: p.collectionId ?? '',
    applicationIds: p.applications.map((a) => a.applicationId),
    images: p.images.map((im) => ({
      s3Key: im.s3Key,
      url: productMediaUrl(im.thumbKey ?? im.s3Key, p.source.code),
    })),
  }));

  return (
    <ReviewSession
      queue={queue}
      total={total}
      capped={total > CAP}
      types={facets.types}
      looks={facets.looks}
      materials={facets.materials}
      collections={facets.collections}
      applications={facets.applications}
    />
  );
}
