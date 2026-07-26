import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { listContentBlocks } from '@/lib/contentAdmin';

// Content blocks — the fixed set of admin-editable marketing copy the public
// pages read (docs/DATABASE.md §7). Keys are code-bound: edit-only, no add/remove.
export default async function ContentDashboardPage() {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('content.write')) redirect('/dashboard');

  const blocks = await listContentBlocks();

  return (
    <div>
      <h1 className="text-2xl font-bold text-heading mb-2">Content</h1>
      <p className="text-muted mb-8">Marketing copy shown across the public pages. Blank languages fall back to English.</p>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-muted border-b border-line">
            <th className="text-start py-2 pe-4">Key</th>
            <th className="text-start py-2 pe-4">Preview</th>
            <th className="text-start py-2 pe-4">Languages</th>
            <th className="text-start py-2">Edit</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((b) => (
            <tr key={b.id} className="border-b border-line/50 hover:bg-surface/60 align-top">
              <td className="py-2 pe-4">
                <span className="text-ink font-mono text-xs">{b.key}</span>
                {b.notes && <span className="block text-muted text-xs mt-0.5">{b.notes}</span>}
              </td>
              <td className="py-2 pe-4 text-muted max-w-md">{b.preview}</td>
              <td className="py-2 pe-4">
                <span className="text-muted text-xs uppercase">{b.locales.join(' · ') || '—'}</span>
              </td>
              <td className="py-2">
                <Link href={`/dashboard/content/${b.id}/edit`} className="text-accent hover:underline">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
          {blocks.length === 0 && (
            <tr>
              <td colSpan={4} className="py-8 text-center text-muted">
                No content blocks.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
