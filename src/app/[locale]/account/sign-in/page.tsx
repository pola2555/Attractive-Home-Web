import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isLocale, dirOf, type Locale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { requireCustomer } from '@/lib/customer-auth';
import AuthForm from '../AuthForm';
import { signInCustomer } from '../actions';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reset?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  if (await requireCustomer()) redirect(`/${locale}/account`);
  const [dict, { reset }] = await Promise.all([getDictionary(locale, 'account'), searchParams]);

  return (
    <section className="min-h-[70vh] flex items-center justify-center px-4 py-20 bg-bg">
      <div className="w-full max-w-sm bg-surface rounded-xl border border-line p-8 space-y-6">
        <h1 className="text-xl font-semibold text-heading text-center">{t(dict, 'signInHeading')}</h1>
        {reset && <p className="text-sm text-green-600 text-center">{t(dict, 'resetDone')}</p>}
        <AuthForm
          action={signInCustomer.bind(null, locale)}
          mode="sign-in"
          dir={dirOf(locale)}
          labels={{
            email: t(dict, 'email'),
            password: t(dict, 'password'),
            name: t(dict, 'name'),
            submit: t(dict, 'signIn'),
            submitting: t(dict, 'signingIn'),
            passwordHint: t(dict, 'passwordHint'),
          }}
        />
        <div className="text-center text-sm space-y-2">
          <p>
            <Link href={`/${locale}/account/forgot-password`} className="text-muted hover:text-ink hover:underline">
              {t(dict, 'forgotPassword')}
            </Link>
          </p>
          <p className="text-muted">
            {t(dict, 'needAccount')}{' '}
            <Link href={`/${locale}/account/sign-up`} className="text-accent hover:underline">
              {t(dict, 'signUp')}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
