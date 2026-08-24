import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import GridEditor, { type GridAxis } from './GridEditor';
import AxesForm from './AxesForm';

// The price grid for one variant: pick which questions form its axes, then
// fill in the supplier's numbers.

export default async function GridPage({
  params,
}: {
  params: Promise<{ id: string; variantId: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('pricing.write')) redirect('/dashboard');

  const { id, variantId } = await params;

  const variant = await prisma.configVariant.findUnique({
    where: { id: variantId },
    include: {
      template: { select: { id: true, name: true } },
      grid: {
        include: {
          axes: {
            orderBy: { position: 'asc' },
            include: { templateOption: { include: { group: true } } },
          },
          cells: true,
        },
      },
    },
  });
  if (!variant || variant.templateId !== id) notFound();

  // Only single-choice questions can be axes: a number has no finite set of
  // columns, and size is priced by bands instead.
  const bindable = await prisma.configTemplateOption.findMany({
    where: {
      templateId: id,
      OR: [{ variantId }, { variantId: null }],
      group: { inputKind: 'select' },
    },
    orderBy: { sortOrder: 'asc' },
    include: {
      group: { include: { translations: { where: { localeCode: 'en' } } } },
      values: {
        orderBy: { sortOrder: 'asc' },
        include: { value: { include: { translations: { where: { localeCode: 'en' } } } } },
      },
    },
  });

  const axes: GridAxis[] = (variant.grid?.axes ?? []).map((axis) => {
    const source = bindable.find((o) => o.id === axis.templateOptionId);
    return {
      groupCode: axis.templateOption.group.code,
      name: source?.group.translations[0]?.name ?? axis.templateOption.group.code,
      values: (source?.values ?? []).map((join) => ({
        code: join.value.code,
        name: join.value.translations[0]?.name ?? join.value.code,
      })),
    };
  });

  const cells: Record<string, number | null> = Object.fromEntries(
    (variant.grid?.cells ?? []).map((cell) => [
      cell.key,
      cell.amount === null ? null : cell.amount.toNumber(),
    ]),
  );

  const axisIsEmpty = axes.some((a) => a.values.length === 0);

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <Link
          href={`/dashboard/pricing/templates/${id}`}
          className="text-sm text-accent hover:underline"
        >
          ← {variant.template.name}
        </Link>
        <h1 className="text-2xl font-bold text-heading mt-2">{variant.name}</h1>
        <p className="text-muted text-sm mt-1">
          The base price of this variant, in the shape the supplier publishes it.
        </p>
      </div>

      <section className="bg-surface border border-line rounded-xl p-5">
        <h2 className="text-lg text-heading mb-1">Which answers set the price</h2>
        <p className="text-muted text-sm mb-4">
          Tick the questions that together decide the base price, in the order the supplier&rsquo;s
          table reads. Changing them clears the grid, because a cell keyed on two answers means
          nothing once there are three.
        </p>
        <AxesForm
          templateId={id}
          variantId={variantId}
          options={bindable.map((option) => ({
            id: option.id,
            label: option.group.translations[0]?.name ?? option.group.code,
            count: option.values.length,
          }))}
          selected={(variant.grid?.axes ?? []).map((a) => a.templateOptionId)}
        />
      </section>

      <section className="bg-surface border border-line rounded-xl p-5">
        <h2 className="text-lg text-heading mb-1">The prices</h2>
        {axes.length === 0 ? (
          <p className="text-muted text-sm">Choose the axes above and the grid appears here.</p>
        ) : axisIsEmpty ? (
          <p className="text-muted text-sm">
            One of the chosen questions has no answers bound to this variant yet, so the grid has no
            columns to draw.
          </p>
        ) : (
          <GridEditor
            templateId={id}
            variantId={variantId}
            axes={axes}
            initialCells={cells}
            currency={variant.grid?.currency ?? 'USD'}
          />
        )}
      </section>
    </div>
  );
}
