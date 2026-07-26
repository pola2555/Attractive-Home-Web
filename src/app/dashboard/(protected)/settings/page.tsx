import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getSettingsForEdit } from '@/lib/settingsAdmin';
import SettingsForm from './SettingsForm';
import { updateSettings } from './actions';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('settings.write')) redirect('/dashboard');

  const [settings, sp] = await Promise.all([getSettingsForEdit(), searchParams]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-heading mb-2">Settings</h1>
      <p className="text-muted mb-8">Contact details, social links and lead-notification recipients.</p>
      <SettingsForm action={updateSettings} initial={settings} saved={sp.saved === '1'} />
    </div>
  );
}
