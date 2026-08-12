import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/permissions';
import ResetForm from './ResetForm';

export const metadata: Metadata = { title: 'Set a new password', robots: { index: false, follow: false } };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (await requireUser()) redirect('/dashboard');
  const { token } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-bg-deep rounded-xl border border-line p-8 space-y-6">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo EN.webp" alt="Attractive Home" className="h-16 mx-auto mb-2" />
          <h1 className="text-xl font-semibold text-heading">Set a new password</h1>
        </div>
        {token ? (
          <ResetForm token={token} />
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted">This reset link is missing or invalid.</p>
            <p className="text-sm">
              <Link href="/dashboard/forgot-password" className="text-accent hover:underline">
                Request a new reset link
              </Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
