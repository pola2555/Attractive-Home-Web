import type { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

// docs/DATABASE.md §7 — settings KV. Values sourced from the old repo:
// phones/email/geo: client/src/components/Contacts.jsx
// whatsapp + social links: client/src/components/Footer.jsx (6 links)
// leads.notify_emails: lambda/api/handler.py CONTACT_RECIPIENTS defaults
const SETTINGS: { key: string; value: Prisma.InputJsonValue; description: string }[] = [
  {
    key: 'contact.phones',
    value: [
      { number: '+971 54 4666066', label: 'primary' },
      { number: '+971 43 420732', label: 'landline' },
    ],
    description: 'Phone numbers shown on the contacts page (display order preserved)',
  },
  {
    key: 'contact.email',
    value: 'info@attractivehome.ae',
    description: 'Public contact email',
  },
  {
    key: 'contact.whatsapp',
    value: '971544666066',
    description: 'WhatsApp number in wa.me format (digits only, country code, no +)',
  },
  {
    key: 'contact.geo',
    value: { lat: 25.1286, lng: 55.4192 },
    description: 'Company location for the contacts-page map (Al Qusais, Al Nahda 1, Dubai)',
  },
  {
    key: 'social.links',
    value: [
      { platform: 'whatsapp', url: 'https://wa.me/971544666066' },
      { platform: 'instagram', url: 'https://www.instagram.com/attractive_home' },
      { platform: 'pinterest', url: 'https://pin.it/4dHNZjnCY' },
      { platform: 'facebook', url: 'https://www.facebook.com/attractive.home.interiors' },
      { platform: 'tiktok', url: 'https://www.tiktok.com/@attractivehome' },
      {
        platform: 'linkedin',
        url: 'https://www.linkedin.com/company/attractive-home-interior-studio/',
      },
    ],
    description: 'Footer social links (display order preserved)',
  },
  {
    key: 'leads.notify_emails',
    value: [
      'fathyelbanna@attractivehome.ae',
      'roohi@attractivehome.ae',
      'mina.nassef@attractivehome.ae',
    ],
    description: 'Recipients of new-lead notification emails (was Lambda CONTACT_RECIPIENTS)',
  },
  // Marketing tracking / verification — seeded empty; set in the dashboard
  // Settings screen or via NEXT_PUBLIC_* env fallbacks. GTM is the single
  // container (GA4 + Meta Pixel configured inside it). Prod: GTM-MDBSFGWM / G-9KNQVR72P7.
  {
    key: 'analytics.gtm_id',
    value: '',
    description: 'Google Tag Manager container id (GTM-XXXXXXX) — the single tracking entry point',
  },
  {
    key: 'analytics.ga4_id',
    value: '',
    description:
      'GA4 measurement id (G-XXXXXXXXXX) — used as a direct tag only when no GTM id is set',
  },
  {
    key: 'tracking.meta_pixel_id',
    value: '',
    description: 'Meta (Facebook) Pixel id — only if not managed inside GTM',
  },
  {
    key: 'seo.google_verification',
    value: '',
    description:
      'Google Search Console verification token (renders the meta tag; DNS TXT is primary)',
  },
  // Landed cost (China -> UAE). Every key has a safe default so quoting works
  // before anyone opens the settings screen, and every read goes through
  // schema.catch(default).parse() so a bad edit degrades instead of breaking
  // the quote page.
  {
    key: 'landed.fx_rates',
    value: { USD: 3.6725, CNY: 0.5163, EUR: 4.0, AED: 1 },
    description:
      'Units of AED per 1 foreign unit. Snapshotted onto each quote at creation, so later moves never rewrite a quote already sent. AED is pegged to USD at 3.6725.',
  },
  {
    key: 'landed.vat_recoverable',
    value: true,
    description:
      'True when the importer is UAE VAT-registered, so import VAT is reverse-charged on the return: cash flow, not cost. Set false only if VAT is genuinely a sunk cost — it changes every quote by 5%.',
  },
  {
    key: 'landed.insurance_percent',
    value: 0.5,
    description: 'Marine insurance as a percentage of goods value (typical 0.3-0.8%)',
  },
  {
    key: 'landed.contingency_percent',
    value: 7.5,
    description: 'Default width of the high estimate band on a new quote, in percent',
  },
  {
    key: 'landed.default_hs_code',
    value: '',
    description:
      'HS code used when neither the quote item nor the product names one (blank = flag for review)',
  },
  {
    key: 'landed.freight_provider',
    value: 'rate_card',
    description:
      'Which adapter prices freight. "rate_card" reads freight_rates. A real API is a new file in src/lib/landed/providers/ named here — never a migration.',
  },
  {
    key: 'landed.customs_provider',
    value: 'rate_card',
    description: 'Which adapter prices customs duty and VAT. "rate_card" reads hs_codes.',
  },
  {
    key: 'landed.storage_provider',
    value: 'rate_card',
    description: 'Which adapter prices port storage. "rate_card" reads port_storage_rates.',
  },
];

export async function seedSettings(prisma: PrismaClient): Promise<void> {
  for (const setting of SETTINGS) {
    // update: {} — re-running the seed never clobbers admin-edited values.
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
  console.log(`  settings: ${SETTINGS.length} keys ensured`);
}
