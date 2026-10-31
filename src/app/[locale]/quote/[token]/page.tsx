import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LOCALES, isLocale, type Locale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { getSharedQuote } from '@/lib/quotes/shared';
import { formatMoney } from '@/lib/quotes/customerQuote';
import PrintButton from './PrintButton';

// Customer-facing quotation. NO auth: the unguessable token in the URL is the
// credential, so the page must never be indexed or cached. It reads straight
// from the DB on every request (revoking a link takes effect immediately).
export const dynamic = 'force-dynamic';

// Shipment / landed cost is intentionally never part of the customer quote:
// the flow is switched off (SHIPMENT_ENABLED in the staff quote page) and it is
// internal cost data in any case. getSharedQuote does not select any of it.

type Params = { locale: string; token: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, token } = await params;
  if (!isLocale(locale)) return {};
  const [dict, quote] = await Promise.all([getDictionary(locale, 'quote'), getSharedQuote(token)]);
  return {
    title: t(dict, 'documentTitle', { reference: quote?.reference ?? '' }).trim(),
    robots: { index: false, follow: false },
  };
}

function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

export default async function CustomerQuotePage({ params }: { params: Promise<Params> }) {
  const { locale: raw, token } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const [dict, quote] = await Promise.all([getDictionary(locale, 'quote'), getSharedQuote(token)]);
  if (!quote) notFound();

  const { view } = quote;
  const contact = [quote.contact.email, quote.contact.phone].filter(Boolean).join(' · ');

  return (
    <section className="bg-bg min-h-screen px-4 pt-28 pb-16 print:pt-0 print:pb-0">
      <div className="quote-sheet mx-auto max-w-4xl rounded-xl border border-line bg-white text-neutral-900 shadow-sm p-6 sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-200 pb-6">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={locale === 'ar' ? '/Logo AR.webp' : '/Logo EN.webp'}
              alt="Attractive Home"
              className="h-14 w-auto"
            />
            {contact && (
              <p className="mt-2 text-xs text-neutral-500" dir="ltr">
                {contact}
              </p>
            )}
          </div>
          <div className="text-start sm:text-end">
            <h1 className="text-3xl font-bold text-brand-brown">{t(dict, 'heading')}</h1>
            <dl className="mt-3 space-y-1 text-sm">
              <div>
                <dt className="inline text-neutral-500">{t(dict, 'reference')}: </dt>
                <dd className="inline font-semibold" dir="ltr" data-testid="quote-reference">
                  {quote.reference}
                </dd>
              </div>
              <div>
                <dt className="inline text-neutral-500">{t(dict, 'date')}: </dt>
                <dd className="inline">{formatDate(quote.issuedAt, locale)}</dd>
              </div>
              {quote.validUntil && (
                <div>
                  <dt className="inline text-neutral-500">{t(dict, 'validUntil')}: </dt>
                  <dd className="inline">{formatDate(quote.validUntil, locale)}</dd>
                </div>
              )}
            </dl>
          </div>
        </header>

        {(quote.clientName || quote.title) && (
          <div className="grid gap-4 sm:grid-cols-2 border-b border-neutral-200 py-5 text-sm">
            {quote.clientName && (
              <div>
                <p className="text-neutral-500">{t(dict, 'preparedFor')}</p>
                <p className="font-semibold">{quote.clientName}</p>
              </div>
            )}
            {quote.title && (
              <div>
                <p className="text-neutral-500">{t(dict, 'project')}</p>
                <p className="font-semibold">{quote.title}</p>
              </div>
            )}
          </div>
        )}

        {quote.isExpired && (
          <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            {t(dict, 'expired')}
          </p>
        )}

        {view.lines.length === 0 ? (
          <p className="py-8 text-neutral-500">{t(dict, 'noItems')}</p>
        ) : (
          <div className="overflow-x-auto" data-testid="quote-lines">
            <table className="mt-6 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-300 text-neutral-500">
                  <th className="py-2 pe-3 text-start font-medium">{t(dict, 'item')}</th>
                  <th className="py-2 pe-3 text-start font-medium">{t(dict, 'quantity')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t(dict, 'unitPrice')}</th>
                  <th className="py-2 text-end font-medium">{t(dict, 'lineTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {view.lines.map((line, i) => (
                  <tr key={i} className="border-b border-neutral-200 align-top">
                    <td className="py-3 pe-3">
                      <div className="font-semibold">{line.name}</div>
                      {line.code && <div className="text-xs text-neutral-500">{line.code}</div>}
                      {line.options && (
                        <div className="mt-1 text-neutral-600">
                          <span className="text-neutral-500">{t(dict, 'options')}: </span>
                          {line.options}
                        </div>
                      )}
                      {line.addons.length > 0 && (
                        <div className="mt-0.5 text-neutral-600">
                          <span className="text-neutral-500">{t(dict, 'addons')}: </span>
                          {line.addons
                            .map((a) => (a.quantity > 1 ? `${a.name} ×${a.quantity}` : a.name))
                            .join(', ')}
                        </div>
                      )}
                      {line.accessories.length > 0 && (
                        <div className="mt-0.5 text-neutral-600">
                          <span className="text-neutral-500">{t(dict, 'accessories')}: </span>
                          {line.accessories.map((a) => `${a.name} ×${a.quantity}`).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pe-3 whitespace-nowrap" dir="ltr">
                      {line.quantity}
                      {line.unit ? ` ${line.unit}` : ''}
                    </td>
                    <td className="py-3 pe-3 text-end whitespace-nowrap" dir="ltr">
                      {line.unitPrice === null
                        ? t(dict, 'priceOnRequest')
                        : formatMoney(line.unitPrice, line.currency)}
                    </td>
                    <td className="py-3 text-end whitespace-nowrap font-semibold" dir="ltr">
                      {line.lineTotal === null
                        ? t(dict, 'priceOnRequest')
                        : formatMoney(line.lineTotal, line.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {view.totals.map((total, i) => (
                  <tr key={total.currency} className="text-base font-bold">
                    <td colSpan={3} className="pt-4 pe-3 text-end">
                      {i === 0 ? t(dict, 'total') : ''}
                    </td>
                    <td
                      className="pt-4 text-end whitespace-nowrap text-brand-brown"
                      dir="ltr"
                      data-testid="quote-total"
                    >
                      {formatMoney(total.amount, total.currency)}
                    </td>
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        )}

        {quote.notes && (
          <div className="mt-8 text-sm">
            <p className="text-neutral-500">{t(dict, 'notes')}</p>
            <p className="mt-1 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}

        <p className="mt-8 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
          {t(dict, 'contact', { contact: contact || 'Attractive Home' })}
        </p>
      </div>

      <div className="print-hide mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-between gap-4">
        <nav aria-label={t(dict, 'language')} className="flex items-center gap-3 text-sm text-muted">
          {LOCALES.map((l) => (
            <Link
              key={l}
              href={`/${l}/quote/${token}`}
              hrefLang={l}
              className={l === locale ? 'font-semibold text-heading' : 'hover:text-heading'}
            >
              {l.toUpperCase()}
            </Link>
          ))}
        </nav>
        <PrintButton label={t(dict, 'print')} />
      </div>
    </section>
  );
}
