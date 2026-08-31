import type { ReactNode } from 'react';
import { isLocale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import ShortlistBar, { type ShortlistLabels } from '@/components/ShortlistBar';

// The saved / compare / request-a-quote bar is a catalog-only surface, so it
// lives in the catalog segment layout rather than the global locale layout — it
// never mounts (or fetches) on the home, portfolio, or any other page. Building
// its labels here (from the catalog dictionary) also keeps that work off every
// other route. Pure dictionary read, no cookies → the catalog stays static/ISR.
export default async function CatalogLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return <>{children}</>;

  const catalog = await getDictionary(locale, 'catalog');
  const shortlistLabels: ShortlistLabels = {
    compare: t(catalog, 'compare'),
    compareNow: t(catalog, 'compareNow'),
    clear: t(catalog, 'clear'),
    saved: t(catalog, 'saved'),
    copyCodes: t(catalog, 'copyCodes'),
    copied: t(catalog, 'copied'),
    noSaved: t(catalog, 'noSaved'),
    close: t(catalog, 'close'),
    requestQuote: t(catalog, 'requestQuote'),
    quote: {
      title: t(catalog, 'quote.title'),
      intro: t(catalog, 'quote.intro'),
      name: t(catalog, 'quote.name'),
      phone: t(catalog, 'quote.phone'),
      email: t(catalog, 'quote.email'),
      emailOptional: t(catalog, 'quote.emailOptional'),
      message: t(catalog, 'quote.message'),
      submit: t(catalog, 'quote.submit'),
      submitting: t(catalog, 'quote.submitting'),
      success: t(catalog, 'quote.success'),
      error: t(catalog, 'quote.error'),
      cancel: t(catalog, 'quote.cancel'),
    },
    spec: {
      type: t(catalog, 'facet.type'),
      material: t(catalog, 'facet.material'),
      look: t(catalog, 'facet.look'),
      color: t(catalog, 'facet.color'),
      finish: t(catalog, 'spec.finish'),
      size: t(catalog, 'facet.size'),
      application: t(catalog, 'facet.application'),
      collection: t(catalog, 'facet.collection'),
      brand: t(catalog, 'facet.brand'),
    },
  };

  return (
    <>
      {children}
      <ShortlistBar locale={locale} labels={shortlistLabels} />
    </>
  );
}
