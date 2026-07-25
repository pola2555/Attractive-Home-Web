import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { localeFilter, pickTranslation } from '@/lib/translate';
import { productMediaUrl } from '@/lib/media';
import { isLocale } from '@/i18n/config';

// Product data for the client shortlist/compare bar, fetched by id. Read-only,
// published products only, capped at 60 ids.
export const dynamic = 'force-dynamic';

type NamedRow = { translations: { localeCode: string; name: string }[] } | null;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const locale = searchParams.get('locale') ?? 'en';
  if (!isLocale(locale)) return NextResponse.json({ items: [] });

  const ids = (searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 60);
  if (ids.length === 0) return NextResponse.json({ items: [] });

  const named = {
    select: { translations: { where: localeFilter(locale), select: { localeCode: true, name: true } } },
  };
  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, isPublished: true },
    include: {
      translations: { where: localeFilter(locale) },
      images: { where: { sortOrder: 0 } },
      source: { select: { code: true } },
      type: named,
      material: named,
      look: named,
      finish: named,
      collection: named,
      brand: named,
      color: {
        select: { hex: true, translations: { where: localeFilter(locale), select: { localeCode: true, name: true } } },
      },
      applications: { include: { application: named } },
    },
  });

  const nameOf = (n: NamedRow) => (n ? pickTranslation(n.translations, locale)?.name ?? null : null);

  const items = rows.map((p) => {
    const img = p.images[0];
    return {
      id: p.id,
      slug: p.slug,
      code: p.code,
      name: pickTranslation(p.translations, locale)?.name ?? p.code ?? '',
      image: img
        ? { src: productMediaUrl(img.thumbKey ?? img.s3Key, p.source.code), fallback: img.supplierUrl }
        : null,
      type: nameOf(p.type),
      material: nameOf(p.material),
      look: nameOf(p.look),
      finish: nameOf(p.finish),
      collection: nameOf(p.collection),
      brand: p.source.code === 'attractivehome' ? 'Attractive Home' : nameOf(p.brand),
      size: p.sizeLabel,
      color: p.color
        ? { name: pickTranslation(p.color.translations, locale)?.name ?? null, hex: p.color.hex }
        : null,
      applications: p.applications.map((a) => nameOf(a.application)).filter(Boolean),
      source: p.source.code,
    };
  });

  return NextResponse.json({ items });
}
