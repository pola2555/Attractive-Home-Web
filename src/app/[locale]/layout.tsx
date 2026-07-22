import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cairo } from 'next/font/google';
import { LOCALES, isLocale, dirOf, type Locale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { getContactSettings } from '@/lib/content';
import Navbar, { type NavbarLabels } from '@/components/Navbar';
import Footer, { type FooterLabels } from '@/components/Footer';
import WhatsAppButton from '@/components/WhatsAppButton';
import Analytics from '@/components/Analytics';
import { SITE_URL } from '@/lib/seo';
import '../globals.css';

// Cairo carries the Arabic glyphs; Brown Pro (loaded via @font-face in
// globals.css) stays the primary Latin face, matching the old site.
const cairo = Cairo({ subsets: ['arabic', 'latin'], weight: ['400', '600', '700'], variable: '--font-cairo' });

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
  const common = await getDictionary(locale, 'common');
  return {
    title: { default: t(common, 'documentTitle'), template: '%s | Attractive Home' },
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

  const [common, settings] = await Promise.all([getDictionary(locale, 'common'), getContactSettings()]);

  const navbarLabels: NavbarLabels = {
    about: t(common, 'nav.about'),
    portfolio: t(common, 'nav.portfolio'),
    catalog: t(common, 'nav.catalog'),
    contacts: t(common, 'nav.contacts'),
    services: t(common, 'nav.services'),
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

  // Organization structured data — name/phone/socials from DB settings.
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Attractive Home',
    url: SITE_URL,
    logo: `${SITE_URL}/Logo EN.webp`,
    email: settings.email,
    telephone: settings.phones[0]?.number,
    sameAs: settings.socialLinks.map((l) => l.url),
  };

  return (
    <html lang={locale} dir={dirOf(locale)} className={cairo.variable}>
      <body className="antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        <Navbar locale={locale} labels={navbarLabels} />
        <main>{children}</main>
        <WhatsAppButton number={settings.whatsapp} label={t(common, 'whatsapp')} />
        <Footer locale={locale} labels={footerLabels} socialLinks={settings.socialLinks} />
        <Analytics />
      </body>
    </html>
  );
}
