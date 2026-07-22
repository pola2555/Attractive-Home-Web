import { cache } from 'react';
import { z } from 'zod';
import { prisma } from './prisma';
import { pickTranslation, localeFilter } from './translate';
import type { Locale } from '@/i18n/config';

// Settings are validated by zod schemas per key in app code
// (docs/DATABASE.md §7). Bad/missing DB values fall back to safe defaults so a
// mis-edit in the dashboard can never take the public site down.
const phoneListSchema = z.array(z.object({ number: z.string(), label: z.string().optional() }));
const geoSchema = z.object({ lat: z.number(), lng: z.number() });
const socialLinksSchema = z.array(z.object({ platform: z.string(), url: z.string() }));

export type ContactSettings = {
  phones: z.infer<typeof phoneListSchema>;
  email: string;
  whatsapp: string;
  geo: z.infer<typeof geoSchema> | null;
  socialLinks: z.infer<typeof socialLinksSchema>;
};

export const getContactSettings = cache(async (): Promise<ContactSettings> => {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ['contact.phones', 'contact.email', 'contact.whatsapp', 'contact.geo', 'social.links'] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    phones: phoneListSchema.catch([]).parse(byKey.get('contact.phones') ?? []),
    email: z.string().catch('info@attractivehome.ae').parse(byKey.get('contact.email') ?? ''),
    whatsapp: z.string().catch('971544666066').parse(byKey.get('contact.whatsapp') ?? ''),
    geo: geoSchema.nullable().catch(null).parse(byKey.get('contact.geo') ?? null),
    socialLinks: socialLinksSchema.catch([]).parse(byKey.get('social.links') ?? []),
  };
});

// All content blocks for a locale, resolved through the [requested, 'en']
// fallback chain — returns key → body.
export const getContentBlocks = cache(async (locale: Locale): Promise<Record<string, string>> => {
  const blocks = await prisma.contentBlock.findMany({
    include: { translations: { where: localeFilter(locale) } },
  });
  const out: Record<string, string> = {};
  for (const block of blocks) {
    const row = pickTranslation(block.translations, locale);
    if (row) out[block.key] = row.body;
  }
  return out;
});
