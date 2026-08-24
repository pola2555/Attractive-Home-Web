import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { listTemplates } from '@/lib/configuratorAdmin';
import TemplateForm from './TemplateForm';

export default async function TemplatesPage() {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('pricing.write')) redirect('/dashboard');

  const [templates, hsCodes] = await Promise.all([
    listTemplates(),
    prisma.hsCode.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, description: true },
    }),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/dashboard/pricing" className="text-sm text-accent hover:underline">
          ← Pricing
        </Link>
        <h1 className="text-2xl font-bold text-heading mt-2">Product templates</h1>
        <p className="text-muted text-sm mt-1">
          A template is one configurable product authored once: which questions are asked, in what
          order, what each answer unlocks, and what it costs.
        </p>
      </div>

      {templates.length === 0 ? (
        <p className="text-muted text-sm">No templates yet.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-start text-muted border-b border-line">
              <th className="text-start py-2 pe-4">Code</th>
              <th className="text-start py-2 pe-4">Name</th>
              <th className="text-start py-2 pe-4">Currency</th>
              <th className="text-start py-2 pe-4">Options</th>
              <th className="text-start py-2 pe-4">Rules</th>
              <th className="text-start py-2 pe-4">Products</th>
              <th className="text-start py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id} className="border-b border-line/50">
                <td className="py-2 pe-4">
                  <Link
                    href={`/dashboard/pricing/templates/${template.id}`}
                    className="text-accent hover:underline"
                  >
                    {template.code}
                  </Link>
                </td>
                <td className="py-2 pe-4">{template.name}</td>
                <td className="py-2 pe-4 text-muted">{template.currency}</td>
                <td className="py-2 pe-4">{template.optionCount}</td>
                <td className="py-2 pe-4">{template.ruleCount}</td>
                <td className="py-2 pe-4">{template.productCount}</td>
                <td className="py-2 text-muted">{template.isActive ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section className="border border-line rounded-lg p-4 bg-surface/40">
        <h2 className="text-lg font-semibold text-heading mb-3">New template</h2>
        <TemplateForm hsCodes={hsCodes} />
      </section>
    </div>
  );
}
