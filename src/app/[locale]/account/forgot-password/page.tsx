import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isLocale, dirOf, type Locale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { requireCustomer } from '@/lib/customer-auth';
import { requestCustomerPasswordReset } from '../actions';
import CustomerForgotForm from './CustomerForgotForm';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  if (await requireCustomer()) redirect(`/${locale}/account`);
  const dict = await getDictionary(locale, 'account');

  return (
    <section className="min-h-[70vh] flex items-center justify-center px-4 py-20 bg-bg">
      <div className="w-full max-w-sm bg-surface rounded-xl border border-line p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-heading">{t(dict, 'forgotHeading')}</h1>
          <p className="text-sm text-muted mt-1">{t(dict, 'forgotIntro')}</p>
        </div>
        <CustomerForgotForm
          action={requestCustomerPasswordReset.bind(null, locale)}
          dir={dirOf(locale)}
          signInHref={`/${locale}/account/sign-in`}
          labels={{
            email: t(dict, 'email'),
            submit: t(dict, 'sendResetLink'),
            submitting: t(dict, 'sending'),
            requested: t(dict, 'resetRequested'),
            backToSignIn: t(dict, 'backToSignIn'),
          }}
        />
      </div>
    </section>
  );
}
