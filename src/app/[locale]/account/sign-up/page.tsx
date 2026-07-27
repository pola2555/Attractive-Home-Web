import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isLocale, dirOf, type Locale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { requireCustomer } from '@/lib/customer-auth';
import AuthForm from '../AuthForm';
import { signUpCustomer } from '../actions';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  if (await requireCustomer()) redirect(`/${locale}/account`);
  const dict = await getDictionary(locale, 'account');

  return (
    <section className="min-h-[70vh] flex items-center justify-center px-4 py-20 bg-bg">
      <div className="w-full max-w-sm bg-surface rounded-xl border border-line p-8 space-y-6">
        <h1 className="text-xl font-semibold text-heading text-center">{t(dict, 'signUpHeading')}</h1>
        <AuthForm
          action={signUpCustomer.bind(null, locale)}
          mode="sign-up"
          dir={dirOf(locale)}
          labels={{
            email: t(dict, 'email'),
            password: t(dict, 'password'),
            name: t(dict, 'nameOptional'),
            submit: t(dict, 'signUp'),
            submitting: t(dict, 'creating'),
            passwordHint: t(dict, 'passwordHint'),
          }}
        />
        <p className="text-center text-sm text-muted">
          {t(dict, 'haveAccount')}{' '}
          <Link href={`/${locale}/account/sign-in`} className="text-accent hover:underline">
            {t(dict, 'signIn')}
          </Link>
        </p>
      </div>
    </section>
  );
}
