import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { listServices } from '@/lib/servicesAdmin';
import DeleteButton from '../products/DeleteButton';
import { toggleService, deleteService } from './actions';

export default async function ServicesDashboardPage() {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('content.write')) redirect('/dashboard');

  const services = await listServices();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-heading">
          Services <span className="text-muted text-base font-normal">({services.length})</span>
        </h1>
        <Link
          href="/dashboard/services/new"
          className="px-4 py-2 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white text-sm"
        >
          + New service
        </Link>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-muted border-b border-line">
            <th className="text-start py-2 pe-4 w-16"></th>
            <th className="text-start py-2 pe-4">Title</th>
            <th className="text-start py-2 pe-4">Slug</th>
            <th className="text-start py-2 pe-4">Order</th>
            <th className="text-start py-2 pe-4">Published</th>
            <th className="text-start py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id} className="border-b border-line/50 hover:bg-surface/60">
              <td className="py-2 pe-4">
                <div className="w-14 h-10 rounded bg-surface-2 overflow-hidden grid place-items-center text-muted text-[10px]">
                  {s.mediaType === 'video' ? (
                    '▶'
                  ) : s.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.mediaUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                  ) : null}
                </div>
              </td>
              <td className="py-2 pe-4 text-ink">{s.title}</td>
              <td className="py-2 pe-4 text-muted">{s.slug}</td>
              <td className="py-2 pe-4 text-muted">{s.sortOrder}</td>
              <td className="py-2 pe-4">
                <form action={toggleService.bind(null, s.id, !s.isPublished)}>
                  <button
                    className={`px-2 py-0.5 rounded-full text-xs border ${s.isPublished ? 'border-green-500/50 text-green-300' : 'border-line text-muted'}`}
                  >
                    {s.isPublished ? 'Published' : 'Hidden'}
                  </button>
                </form>
              </td>
              <td className="py-2">
                <div className="flex items-center gap-3">
                  <Link href={`/dashboard/services/${s.id}/edit`} className="text-accent hover:underline">
                    Edit
                  </Link>
                  <DeleteButton
                    action={deleteService.bind(null, s.id)}
                    confirmText={`Delete "${s.title}"?`}
                    label="Delete"
                    className="text-red-300 hover:text-red-200 text-sm"
                  />
                </div>
              </td>
            </tr>
          ))}
          {services.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-muted">
                No services yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
