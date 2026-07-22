import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/permissions';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  if (await requireUser()) redirect('/dashboard');
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-bg-deep rounded-xl border border-line p-8 space-y-6">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo EN.webp" alt="Attractive Home" className="h-16 mx-auto mb-2" />
          <h1 className="text-xl font-semibold text-heading">Dashboard sign in</h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
