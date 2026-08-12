'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';

export type FormState = { error?: string; ok?: boolean };

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function parseJsonArray(fd: FormData, key: string): unknown[] {
  try {
    const raw = JSON.parse(str(fd, key) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

const emailSchema = z.string().email();

export async function updateSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission('settings.write');

  // Phones — keep rows with a non-empty number, preserve order.
  const phones = parseJsonArray(formData, 'phonesJson')
    .map((r) => {
      const rec = r as Record<string, unknown>;
      const number = typeof rec.number === 'string' ? rec.number.trim() : '';
      const label = typeof rec.label === 'string' ? rec.label.trim() : '';
      return number ? (label ? { number, label } : { number }) : null;
    })
    .filter((p): p is { number: string; label?: string } => p !== null);

  // Social links — need both platform and a valid URL.
  const social = parseJsonArray(formData, 'socialJson')
    .map((r) => {
      const rec = r as Record<string, unknown>;
      const platform = typeof rec.platform === 'string' ? rec.platform.trim() : '';
      const url = typeof rec.url === 'string' ? rec.url.trim() : '';
      return platform && z.string().url().safeParse(url).success ? { platform, url } : null;
    })
    .filter((s): s is { platform: string; url: string } => s !== null);

  // Notify emails — keep valid, de-duplicated addresses.
  const notifyEmails = Array.from(
    new Set(
      parseJsonArray(formData, 'notifyJson')
        .map((r) => (typeof r === 'string' ? r.trim() : ''))
        .filter((e) => emailSchema.safeParse(e).success),
    ),
  );

  const email = str(formData, 'email');
  if (email && !emailSchema.safeParse(email).success) {
    return { error: 'The contact email is not a valid address.' };
  }
  const whatsapp = str(formData, 'whatsapp').replace(/[^\d]/g, ''); // wa.me wants digits only

  const latRaw = str(formData, 'geoLat');
  const lngRaw = str(formData, 'geoLng');
  let geo: { lat: number; lng: number } | null = null;
  if (latRaw || lngRaw) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return { error: 'Latitude must be −90…90 and longitude −180…180 (or clear both).' };
    }
    geo = { lat, lng };
  }

  // Tracking & SEO ids — each optional (empty disables the tag). Uppercased for
  // the GTM/GA4 formats; validated so a typo never renders a broken script id.
  const gtmId = str(formData, 'gtmId').toUpperCase();
  if (gtmId && !/^GTM-[A-Z0-9]+$/.test(gtmId)) {
    return { error: 'Google Tag Manager id must look like GTM-XXXXXXX.' };
  }
  const ga4Id = str(formData, 'ga4Id').toUpperCase();
  if (ga4Id && !/^G-[A-Z0-9]+$/.test(ga4Id)) {
    return { error: 'GA4 measurement id must look like G-XXXXXXXXXX.' };
  }
  const metaPixelId = str(formData, 'metaPixelId').replace(/[^\d]/g, '');
  const googleVerification = str(formData, 'googleVerification');

  const values: Record<string, Prisma.InputJsonValue> = {
    'contact.phones': phones,
    'contact.email': email,
    'contact.whatsapp': whatsapp,
    'contact.geo': geo === null ? {} : geo, // {} sentinel; read side treats non-{lat,lng} as null
    'social.links': social,
    'leads.notify_emails': notifyEmails,
    'analytics.gtm_id': gtmId,
    'analytics.ga4_id': ga4Id,
    'tracking.meta_pixel_id': metaPixelId,
    'seo.google_verification': googleVerification,
  };

  await prisma.$transaction(
    Object.entries(values).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value, updatedBy: user.id },
        create: { key, value, updatedBy: user.id },
      }),
    ),
  );

  await writeAudit({
    userId: user.id,
    entityType: 'settings',
    entityId: 'site',
    action: 'update',
    diff: { keys: { from: null, to: Object.keys(values).join(',') } },
  });
  revalidatePath('/dashboard/settings');
  revalidatePath('/', 'layout');
  redirect('/dashboard/settings?saved=1');
}
