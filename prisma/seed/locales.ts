import type { PrismaClient } from '@prisma/client';

// docs/DATABASE.md §3 — en/ar/fr/ru public (ar RTL), zh non-public Chinese
// source language (1,695 product names — kept, never displayed).
const LOCALES = [
  {
    code: 'en',
    nameEn: 'English',
    nativeName: 'English',
    isRtl: false,
    isPublic: true,
    isDefault: true,
    sortOrder: 1,
  },
  {
    code: 'ar',
    nameEn: 'Arabic',
    nativeName: 'العربية',
    isRtl: true,
    isPublic: true,
    isDefault: false,
    sortOrder: 2,
  },
  {
    code: 'fr',
    nameEn: 'French',
    nativeName: 'Français',
    isRtl: false,
    isPublic: true,
    isDefault: false,
    sortOrder: 3,
  },
  {
    code: 'ru',
    nameEn: 'Russian',
    nativeName: 'Русский',
    isRtl: false,
    isPublic: true,
    isDefault: false,
    sortOrder: 4,
  },
  {
    code: 'zh',
    nameEn: 'Chinese',
    nativeName: '中文',
    isRtl: false,
    isPublic: false,
    isDefault: false,
    sortOrder: 5,
  },
];

export async function seedLocales(prisma: PrismaClient): Promise<void> {
  for (const locale of LOCALES) {
    await prisma.locale.upsert({
      where: { code: locale.code },
      update: {},
      create: locale,
    });
  }
  console.log(`  locales: ${LOCALES.length} ensured`);
}
