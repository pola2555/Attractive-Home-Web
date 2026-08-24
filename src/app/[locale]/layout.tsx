import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cairo } from 'next/font/google';
import { LOCALES, isLocale, dirOf, type Locale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { getContactSettings, getContentBlocks, getTrackingSettings } from '@/lib/content';
import Navbar, { type NavbarLabels } from '@/components/Navbar';
import Footer, { type FooterLabels } from '@/components/Footer';
import WhatsAppButton from '@/components/WhatsAppButton';
import ShortlistBar, { type ShortlistLabels } from '@/components/ShortlistBar';
import FavoritesProvider from '@/components/favorites/FavoritesProvider';
import TrackingScripts from '@/components/TrackingScripts';
import TrackingNoScript from '@/components/TrackingNoScript';
import RouteAnalytics from '@/components/RouteAnalytics';
import { SITE_URL } from '@/lib/seo';
import '../globals.css';

// Cairo carries the Arabic glyphs; Brown Pro (loaded via @font-face in
// globals.css) stays the primary Latin face, matching the old site.
const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '600', '700'],
  variable: '--font-cairo',
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const [common, tracking] = await Promise.all([
    getDictionary(locale, 'common'),
    getTrackingSettings(),
  ]);
  return {
    title: { default: t(common, 'documentTitle'), template: '%s | Attractive Home' },
    // Google Search Console verification meta tag (DNS TXT is the primary method).
    ...(tracking.googleVerification
      ? { verification: { google: tracking.googleVerification } }
      : {}),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const [common, catalog, settings, blocks] = await Promise.all([
    getDictionary(locale, 'common'),
    getDictionary(locale, 'catalog'),
    getContactSettings(),
    getContentBlocks(locale),
  ]);

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
    // Threaded down as a prop, like every other label: client components never
    // import getDictionary.
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

  const navbarLabels: NavbarLabels = {
    about: t(common, 'nav.about'),
    portfolio: t(common, 'nav.portfolio'),
    catalog: t(common, 'nav.catalog'),
    contacts: t(common, 'nav.contacts'),
    services: t(common, 'nav.services'),
    signIn: t(common, 'nav.signIn'),
    account: t(common, 'nav.account'),
    dashboard: t(common, 'nav.dashboard'),
    languageLabel: t(common, 'language.label'),
    languageNames: {
      en: t(common, 'language.en'),
      ar: t(common, 'language.ar'),
      fr: t(common, 'language.fr'),
      ru: t(common, 'language.ru'),
    },
  };
  const footerLabels: FooterLabels = {
    aboutUs: t(common, 'footer.aboutUs'),
    contacts: t(common, 'footer.contacts'),
    services: t(common, 'footer.services'),
    portfolio: t(common, 'footer.portfolio'),
    architectural: t(common, 'footer.architectural'),
    interior: t(common, 'footer.interior'),
    fitOut: t(common, 'footer.fitOut'),
    companyName: t(common, 'footer.companyName'),
    rights: t(common, 'footer.rights'),
  };

  // ProfessionalService structured data — name/phone/socials/address/geo from DB
  // settings + content blocks (matches the old site's richer JSON-LD).
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: 'Attractive Home',
    url: SITE_URL,
    logo: `${SITE_URL}/Logo EN.webp`,
    image: `${SITE_URL}/Logo EN.webp`,
    email: settings.email,
    telephone: settings.phones[0]?.number,
    foundingDate: '2013',
    areaServed: 'AE',
    ...(blocks['contact.address']
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: blocks['contact.address'],
            addressLocality: 'Dubai',
            addressCountry: 'AE',
          },
        }
      : {}),
    ...(settings.geo
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: settings.geo.lat,
            longitude: settings.geo.lng,
          },
        }
      : {}),
    sameAs: settings.socialLinks.map((l) => l.url),
  };

  return (
    <html lang={locale} dir={dirOf(locale)} className={cairo.variable}>
      <body className="antialiased">
        <TrackingNoScript />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        <FavoritesProvider>
          <Navbar locale={locale} labels={navbarLabels} />
          <main>{children}</main>
          <WhatsAppButton number={settings.whatsapp} label={t(common, 'whatsapp')} />
          <ShortlistBar locale={locale} labels={shortlistLabels} />
        </FavoritesProvider>
        <Footer locale={locale} labels={footerLabels} socialLinks={settings.socialLinks} />
        <RouteAnalytics locale={locale} />
        <TrackingScripts />
      </body>
    </html>
  );
}
