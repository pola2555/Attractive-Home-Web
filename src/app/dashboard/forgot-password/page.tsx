import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/permissions';
import ForgotForm from './ForgotForm';

export const metadata: Metadata = { title: 'Reset password', robots: { index: false, follow: false } };

export default async function ForgotPasswordPage() {
  if (await requireUser()) redirect('/dashboard');
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-bg-deep rounded-xl border border-line p-8 space-y-6">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo EN.webp" alt="Attractive Home" className="h-16 mx-auto mb-2" />
          <h1 className="text-xl font-semibold text-heading">Reset your password</h1>
          <p className="text-sm text-muted mt-1">Enter your email and we&apos;ll send you a reset link.</p>
        </div>
        <ForgotForm />
      </div>
    </main>
  );
}
