import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isLocale, type Locale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { requireCustomer } from '@/lib/customer-auth';
import { listFavoriteProducts } from '@/lib/favorites';
import ProductCard from '@/components/ProductCard';
import { signOutCustomer, resendCustomerVerification } from './actions';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ verify_sent?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const customer = await requireCustomer();
  if (!customer) redirect(`/${locale}/account/sign-in`);

  const [dict, favorites, { verify_sent }] = await Promise.all([
    getDictionary(locale, 'account'),
    listFavoriteProducts(customer.id, locale),
    searchParams,
  ]);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-8 pt-28 sm:pt-32 pb-16 bg-bg min-h-[70vh]">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <h1 className="text-3xl font-bold text-heading">{t(dict, 'title')}</h1>
        <form action={signOutCustomer.bind(null, locale)}>
          <button className="px-4 py-2 rounded-lg border border-line text-ink text-sm hover:border-accent/60">
            {t(dict, 'signOut')}
          </button>
        </form>
      </div>
      <p className="text-muted mb-6">{t(dict, 'signedInAs', { email: customer.email })}</p>

      {verify_sent && <p className="mb-6 text-sm text-green-600">{t(dict, 'verificationSent')}</p>}

      {!customer.emailVerifiedAt && (
        <div className="mb-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <p className="text-sm text-ink">{t(dict, 'emailUnverified')}</p>
          <form action={resendCustomerVerification.bind(null, locale)}>
            <button className="px-3 py-1.5 rounded-lg border border-line-strong text-ink text-sm hover:border-accent/60">
              {t(dict, 'resendVerification')}
            </button>
          </form>
        </div>
      )}

      <h2 className="text-xl font-semibold text-heading mb-6">{t(dict, 'favorites')}</h2>

      {favorites.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted mb-4">{t(dict, 'noFavorites')}</p>
          <Link
            href={`/${locale}/catalog`}
            className="inline-block px-5 py-2.5 rounded-lg bg-brand-brown text-white hover:bg-brand-brown-hover"
          >
            {t(dict, 'browseCatalog')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {favorites.map((product) => (
            <ProductCard key={product.id} product={product} locale={locale} />
          ))}
        </div>
      )}
    </section>
  );
}
