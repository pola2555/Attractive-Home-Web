import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getTemplate } from '@/lib/configuratorAdmin';
import TreeEditor from './TreeEditor';
import { buildEditorModel } from './model';
import { getPriceTrees, getVocabulary, getPriceUnits } from './priceTree';

export default async function TreeProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  // The canvas shows internal cost basis, so it lives behind pricing.write —
  // the same bar as the rest of the configurator.
  if (!permissions.has('pricing.write')) redirect('/dashboard/products');

  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      templateId: true,
      translations: { where: { localeCode: 'en' }, select: { name: true } },
    },
  });
  if (!product) redirect('/dashboard/products');
  if (!product.templateId) redirect(`/dashboard/products/${id}/edit`);

  const [def, colourRows, priceTrees, vocab, priceUnits] = await Promise.all([
    getTemplate(product.templateId),
    prisma.color.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: { id: true, hex: true, translations: { where: { localeCode: 'en' }, select: { name: true } } },
    }),
    getPriceTrees(product.templateId),
    getVocabulary(),
    getPriceUnits(),
  ]);
  const productName = product.translations[0]?.name ?? 'Product';
  const colours = colourRows.map((c) => ({
    id: c.id,
    name: c.translations[0]?.name ?? '',
    hex: c.hex,
  }));

  return (
    <div>
      <Link href="/dashboard/products" className="text-sm text-accent hover:underline">
        ← Products
      </Link>
      <div className="flex items-center justify-between gap-4 flex-wrap mt-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">{productName}</h1>
          <p className="text-muted text-sm">Tree product · configurable pricing</p>
        </div>
        <Link
          href={`/dashboard/products/${id}/edit`}
          className="text-sm text-accent hover:underline"
        >
          Product details →
        </Link>
      </div>

      {def ? (
        <TreeEditor
          productId={id}
          productName={productName}
          model={buildEditorModel(def)}
          colours={colours}
          priceTrees={priceTrees}
          vocab={vocab}
          priceUnits={priceUnits}
        />
      ) : (
        <p className="text-muted">This product has no configurator template.</p>
      )}
    </div>
  );
}
