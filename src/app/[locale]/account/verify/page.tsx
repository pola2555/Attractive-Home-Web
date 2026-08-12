import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { verifyCustomerEmail } from '../actions';
import ConfirmButton from './ConfirmButton';

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Email confirmation. The emailed link lands here with ?token=…; the customer
// clicks a button that POSTs to verifyCustomerEmail (so link-prefetch / mail
// scanners can't silently consume the single-use token on GET). The action
// redirects back with ?status=ok|invalid.
export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const [{ token, status }, dict] = await Promise.all([searchParams, getDictionary(locale, 'account')]);
  const accountHref = `/${locale}/account`;
  const signInHref = `/${locale}/account/sign-in`;

  let body;
  if (status === 'ok') {
    body = (
      <div className="space-y-4 text-center">
        <p className="text-sm text-green-600">{t(dict, 'verifyOk')}</p>
        <Link
          href={accountHref}
          className="inline-block px-5 py-2.5 rounded-lg bg-brand-brown text-white hover:bg-brand-brown-hover"
        >
          {t(dict, 'goToAccount')}
        </Link>
      </div>
    );
  } else if (token && status !== 'invalid') {
    body = (
      <div className="space-y-4">
        <p className="text-sm text-ink text-center">{t(dict, 'verifyIntro')}</p>
        <form action={verifyCustomerEmail.bind(null, locale)}>
          <input type="hidden" name="token" value={token} />
          <ConfirmButton label={t(dict, 'confirmEmail')} pendingLabel={t(dict, 'confirming')} />
        </form>
      </div>
    );
  } else {
    body = (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted">{t(dict, 'verifyInvalid')}</p>
        <p className="text-sm">
          <Link href={signInHref} className="text-accent hover:underline">
            {t(dict, 'backToSignIn')}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <section className="min-h-[70vh] flex items-center justify-center px-4 py-20 bg-bg">
      <div className="w-full max-w-sm bg-surface rounded-xl border border-line p-8 space-y-6">
        <h1 className="text-xl font-semibold text-heading text-center">{t(dict, 'verifyHeading')}</h1>
        {body}
      </div>
    </section>
  );
}
