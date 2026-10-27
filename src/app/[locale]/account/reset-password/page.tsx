import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isLocale, dirOf, type Locale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { requireCustomer } from '@/lib/customer-auth';
import { resetCustomerPassword } from '../actions';
import AuthCardShell from '../AuthCardShell';
import CustomerResetForm from './CustomerResetForm';

export const metadata: Metadata = {
  title: 'Set New Password',
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  if (await requireCustomer()) redirect(`/${locale}/account`);
  const [{ token }, dict] = await Promise.all([searchParams, getDictionary(locale, 'account')]);

  return (
    <AuthCardShell>
      <h1 className="text-xl font-semibold text-heading text-center">{t(dict, 'resetHeading')}</h1>
      {token ? (
        <CustomerResetForm
          action={resetCustomerPassword.bind(null, locale)}
          token={token}
          dir={dirOf(locale)}
          labels={{
            newPassword: t(dict, 'newPassword'),
            confirmPassword: t(dict, 'confirmPassword'),
            submit: t(dict, 'setNewPassword'),
            submitting: t(dict, 'saving'),
            passwordHint: t(dict, 'passwordHint'),
          }}
        />
      ) : (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted">{t(dict, 'resetLinkInvalid')}</p>
          <p className="text-sm">
            <Link
              href={`/${locale}/account/forgot-password`}
              className="text-accent hover:underline"
            >
              {t(dict, 'requestNewLink')}
            </Link>
          </p>
        </div>
      )}
    </AuthCardShell>
  );
}
