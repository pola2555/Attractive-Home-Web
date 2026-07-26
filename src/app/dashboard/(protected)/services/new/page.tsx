import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import ServiceForm from '../ServiceForm';
import { createService } from '../actions';

export default async function NewServicePage() {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('content.write')) redirect('/dashboard/services');

  return (
    <div>
      <Link href="/dashboard/services" className="text-sm text-accent hover:underline">
        ← Services
      </Link>
      <h1 className="text-2xl font-bold text-heading mt-2 mb-8">New service</h1>
      <ServiceForm action={createService} submitLabel="Create service" />
    </div>
  );
}
