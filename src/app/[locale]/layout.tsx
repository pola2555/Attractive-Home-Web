import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cairo } from 'next/font/google';
import { LOCALES, isLocale, dirOf, type Locale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { getContactSettings, getContentBlocks, getTrackingSettings } from '@/lib/content';
import { getNavItems, getFooterVisibility } from '@/lib/sitePages.server';
import Navbar, { type NavbarLabels } from '@/components/Navbar';
import Footer, { type FooterLabels } from '@/components/Footer';
import WhatsAppButton from '@/components/WhatsAppButton';
import FavoritesProvider from '@/components/favorites/FavoritesProvider';
import TrackingScripts from '@/components/TrackingScripts';
import TrackingNoScript from '@/components/TrackingNoScript';
import RouteAnalytics from '@/components/RouteAnalytics';
import { SITE_URL, jsonLdHtml } from '@/lib/seo';
import { mediaOrigins } from '@/lib/media';
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
    metadataBase: new URL(SITE_URL),
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

  // Preconnect to the media + webfont hosts so the TLS handshake is already
  // done when the LCP image/video and the Brown Pro font start loading. Media
  // (images/video) are fetched without CORS; the font needs crossorigin.
  const mediaHosts = mediaOrigins();

  const [common, settings, blocks] = await Promise.all([
    getDictionary(locale, 'common'),
    getContactSettings(),
    getContentBlocks(locale),
  ]);

  // Visible, ordered top-nav items + footer link visibility come from the DB
  // (an admin manages them at /dashboard/pages); a hidden page drops out of
  // both. Labels fall back to the code i18n dictionary when not overridden.
  const [navItems, footerVisible] = await Promise.all([
    getNavItems(locale, (key) => t(common, `nav.${key}`)),
    getFooterVisibility(locale),
  ]);

  const navbarLabels: NavbarLabels = {
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
    menu: t(common, 'menu'),
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
    privacy: t(common, 'footer.privacy'),
    terms: t(common, 'footer.terms'),
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
      <head>
        {mediaHosts.map((origin) => (
          <link key={origin} rel="preconnect" href={origin} />
        ))}
        <link rel="preconnect" href="https://db.onlinewebfonts.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        <a href="#main" className="skip-link">
          {t(common, 'skipToContent')}
        </a>
        <TrackingNoScript />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(orgJsonLd) }}
        />
        <FavoritesProvider>
          <Navbar locale={locale} labels={navbarLabels} navItems={navItems} />
          <main id="main" tabIndex={-1}>{children}</main>
          <WhatsAppButton number={settings.whatsapp} label={t(common, 'whatsapp')} />
        </FavoritesProvider>
        <Footer
          locale={locale}
          labels={footerLabels}
          socialLinks={settings.socialLinks}
          visible={footerVisible}
        />
        <RouteAnalytics locale={locale} />
        <TrackingScripts />
      </body>
    </html>
  );
}
