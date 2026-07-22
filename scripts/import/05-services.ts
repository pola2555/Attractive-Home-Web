// §8 step 8 — the 12 services. Media paths from the old servicesData.js;
// titles/descriptions from the four services.json i18n namespaces (all four
// locales exist today — §7).
import { uuidv7 } from 'uuidv7';
import { MediaType } from '@prisma/client';
import { prisma, readJson, slugify, trimmed } from './lib';

type ServiceEntry = { id: string; video?: string; image?: string };
type ServicesI18n = { items: Record<string, { title?: string; description?: string }> };

export type ServicesReport = { services: number; translations: number };

export async function importServices(): Promise<ServicesReport> {
  const servicesData = ((await import('./data/services/servicesData.js')) as {
    default: ServiceEntry[];
  }).default;
  const i18n: Record<'en' | 'ar' | 'fr' | 'ru', ServicesI18n> = {
    en: readJson('services/services.en.json'),
    ar: readJson('services/services.ar.json'),
    fr: readJson('services/services.fr.json'),
    ru: readJson('services/services.ru.json'),
  };

  const report: ServicesReport = { services: 0, translations: 0 };

  for (const [index, svc] of servicesData.entries()) {
    const en = i18n.en.items[svc.id];
    if (!en?.title) throw new Error(`No English i18n entry for service "${svc.id}"`);

    const mediaPath = svc.video ?? svc.image ?? null;
    const row = await prisma.service.upsert({
      where: { legacyKey: svc.id },
      update: {},
      create: {
        id: uuidv7(),
        legacyKey: svc.id,
        slug: slugify(en.title),
        mediaType: svc.video ? MediaType.video : svc.image ? MediaType.image : null,
        mediaKey: mediaPath ? mediaPath.replace(/^\/+/, '') : null,
        sortOrder: index,
      },
    });
    report.services += 1;

    for (const locale of ['en', 'ar', 'fr', 'ru'] as const) {
      const t = i18n[locale].items[svc.id];
      const title = trimmed(t?.title);
      if (!title) continue;
      // §3 — skip locales that merely duplicate the en content.
      if (locale !== 'en' && title === trimmed(en.title) && trimmed(t?.description) === trimmed(en.description)) {
        continue;
      }
      await prisma.serviceTranslation.upsert({
        where: { serviceId_localeCode: { serviceId: row.id, localeCode: locale } },
        update: {},
        create: {
          id: uuidv7(),
          serviceId: row.id,
          localeCode: locale,
          title,
          description: trimmed(t?.description) || null,
        },
      });
      report.translations += 1;
    }
  }

  console.log(`05-services: ${report.services} services, ${report.translations} translation rows ensured`);
  return report;
}
