import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getServiceForEdit } from '@/lib/servicesAdmin';
import DeleteButton from '../../../products/DeleteButton';
import ServiceForm from '../../ServiceForm';
import { updateService, deleteService } from '../../actions';

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('content.write')) redirect('/dashboard/services');

  const service = await getServiceForEdit(id);
  if (!service) notFound();

  return (
    <div>
      <Link href="/dashboard/services" className="text-sm text-accent hover:underline">
        ← Services
      </Link>
      <div className="flex items-start justify-between mt-2 mb-8 gap-4">
        <h1 className="text-2xl font-bold text-heading">Edit service</h1>
        <DeleteButton action={deleteService.bind(null, id)} confirmText={`Delete "${service.slug}"?`} />
      </div>
      <ServiceForm action={updateService.bind(null, id)} initial={service} submitLabel="Save changes" />
    </div>
  );
}
