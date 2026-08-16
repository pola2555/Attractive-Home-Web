import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/permissions';
import { DEFAULT_LOCALE } from '@/i18n/config';

// The dashboard no longer has its own sign-in form — staff sign in through the
// single site-wide form. Logged-in staff go straight to the dashboard; everyone
// else is sent to the unified sign-in. Kept as a redirect so existing
// /dashboard/login links (and Auth.js's signIn page target) still resolve.
export default async function DashboardLoginRedirect() {
  if (await requireUser()) redirect('/dashboard');
  redirect(`/${DEFAULT_LOCALE}/account/sign-in`);
}
