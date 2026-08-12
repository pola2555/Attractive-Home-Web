import 'server-only';
import { z } from 'zod';
import { prisma } from './prisma';

// Admin-side settings read. Mirrors the public content.ts fallbacks so the
// editor shows exactly what the site would resolve, even from a partial/legacy
// value. Keys are the fixed KV set (docs/DATABASE.md §7).

const phoneListSchema = z.array(z.object({ number: z.string(), label: z.string().optional() }));
const geoSchema = z.object({ lat: z.number(), lng: z.number() });
const socialLinksSchema = z.array(z.object({ platform: z.string(), url: z.string() }));
const emailListSchema = z.array(z.string());

export const SETTINGS_KEYS = [
  'contact.phones',
  'contact.email',
  'contact.whatsapp',
  'contact.geo',
  'social.links',
  'leads.notify_emails',
  'analytics.gtm_id',
  'analytics.ga4_id',
  'tracking.meta_pixel_id',
  'seo.google_verification',
] as const;

export type SettingsForm = {
  phones: { number: string; label: string }[];
  email: string;
  whatsapp: string;
  geo: { lat: number; lng: number } | null;
  social: { platform: string; url: string }[];
  notifyEmails: string[];
  gtmId: string;
  ga4Id: string;
  metaPixelId: string;
  googleVerification: string;
};

export async function getSettingsForEdit(): Promise<SettingsForm> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...SETTINGS_KEYS] } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const phones = phoneListSchema.catch([]).parse(byKey.get('contact.phones') ?? []);
  const social = socialLinksSchema.catch([]).parse(byKey.get('social.links') ?? []);

  const strOf = (key: string) => z.string().catch('').parse(byKey.get(key) ?? '');

  return {
    phones: phones.map((p) => ({ number: p.number, label: p.label ?? '' })),
    email: z.string().catch('').parse(byKey.get('contact.email') ?? ''),
    whatsapp: z.string().catch('').parse(byKey.get('contact.whatsapp') ?? ''),
    geo: geoSchema.nullable().catch(null).parse(byKey.get('contact.geo') ?? null),
    social,
    notifyEmails: emailListSchema.catch([]).parse(byKey.get('leads.notify_emails') ?? []),
    gtmId: strOf('analytics.gtm_id'),
    ga4Id: strOf('analytics.ga4_id'),
    metaPixelId: strOf('tracking.meta_pixel_id'),
    googleVerification: strOf('seo.google_verification'),
  };
}
