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
      { platform: 'linkedin', url: 'https://www.linkedin.com/company/attractive-home-interior-studio/' },
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
