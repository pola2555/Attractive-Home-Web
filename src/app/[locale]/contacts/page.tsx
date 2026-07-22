import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { getDictionary, t } from '@/i18n/getDictionary';
import { getContactSettings, getContentBlocks } from '@/lib/content';
import { alternates } from '@/lib/seo';
import LeafletMap from '@/components/LeafletMap';
import ContactForm, { type ContactFormLabels } from './ContactForm';

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale, 'contacts');
  return {
    title: t(dict, 'contactInfo'),
    description: t(dict, 'subtext'),
    alternates: alternates(locale, '/contacts'),
  };
}

// Contact info comes from DB settings (phones/email/geo) and the translatable
// address content block (docs/DATABASE.md §7) — edited in the dashboard, not
// in code.
export default async function ContactsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [dict, settings, blocks] = await Promise.all([
    getDictionary(locale, 'contacts'),
    getContactSettings(),
    getContentBlocks(locale),
  ]);

  const formLabels: ContactFormLabels = {
    nameLabel: t(dict, 'nameLabel'),
    namePlaceholder: t(dict, 'namePlaceholder'),
    phoneLabel: t(dict, 'phoneLabel'),
    phonePlaceholder: t(dict, 'phonePlaceholder'),
    send: t(dict, 'send'),
    sending: t(dict, 'sending'),
    thankYou: t(dict, 'thankYou'),
    thankYouSub: t(dict, 'thankYouSub'),
    errorGeneric: t(dict, 'errorGeneric'),
  };

  const [primaryPhone, landline] = [settings.phones[0]?.number, settings.phones[1]?.number];

  return (
    <section className="min-h-screen flex flex-col">
      <div className="min-h-[7.5rem] flex items-center px-4 sm:px-6 lg:px-10 py-5 bg-bg-deep" />

      <div className="bg-bg text-ink flex-grow flex items-center justify-center">
        <div className="max-w-4xl w-full bg-bg rounded-lg flex flex-col md:flex-row overflow-hidden shadow-lg">
          {/* Left — form */}
          <div className="w-full md:w-1/2 px-8 py-12">
            <h1 className="text-3xl font-bold mb-4 text-ink">{t(dict, 'headline')}</h1>
            <p className="mb-6 text-heading">{t(dict, 'subtext')}</p>
            <ContactForm locale={locale} sourcePath={`/${locale}/contacts`} labels={formLabels} />
          </div>

          {/* Right — contact info + mini map */}
          <div className="w-full md:w-1/2 bg-bg-deep text-heading px-8 py-12 flex flex-col space-y-6 justify-between">
            <div className={locale === 'ar' ? 'text-right' : undefined}>
              <h2 className="text-xl font-semibold">{t(dict, 'contactInfo')}</h2>
              <p>{t(dict, 'orderProject')}</p>
              {primaryPhone && <p dir="ltr">{primaryPhone}</p>}
              <p>{settings.email}</p>
            </div>
            <div className={locale === 'ar' ? 'text-right' : undefined}>
              <p>{t(dict, 'dubai')}</p>
              {landline && <p dir="ltr">{landline}</p>}
              <p>{blocks['contact.address']}</p>
            </div>
            {settings.geo && (
              <div className="rounded-lg overflow-hidden border border-line h-52 w-full flex-shrink-0">
                <LeafletMap
                  center={[settings.geo.lat, settings.geo.lng]}
                  zoom={15}
                  markers={[
                    {
                      lat: settings.geo.lat,
                      lng: settings.geo.lng,
                      title: t(dict, 'mapName'),
                      subtitle: t(dict, 'mapAddress'),
                    },
                  ]}
                  className="h-52 w-full"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
