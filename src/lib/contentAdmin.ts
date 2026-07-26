import 'server-only';
import { prisma } from './prisma';
import { LOCALES, type Locale } from '@/i18n/config';

// Admin-side content-block helpers. Content blocks are a fixed set of keys that
// the public pages read (docs/DATABASE.md §7) — the editor edits their per-
// locale body + notes; it never creates or deletes keys (those are code-bound).

export type ContentBlockRow = {
  id: string;
  key: string;
  notes: string | null;
  preview: string; // en (or first available) body, truncated
  locales: Locale[]; // which locales have a body
};

export async function listContentBlocks(): Promise<ContentBlockRow[]> {
  const blocks = await prisma.contentBlock.findMany({
    orderBy: { key: 'asc' },
    include: { translations: true },
  });
  return blocks.map((b) => {
    const en = b.translations.find((t) => t.localeCode === 'en');
    const any = en ?? b.translations[0];
    const body = any?.body ?? '';
    return {
      id: b.id,
      key: b.key,
      notes: b.notes,
      preview: body.length > 90 ? `${body.slice(0, 90)}…` : body,
      locales: LOCALES.filter((l) => b.translations.some((t) => t.localeCode === l)),
    };
  });
}

export type ContentBlockFormInitial = {
  id: string;
  key: string;
  notes: string;
  bodies: Record<Locale, string>;
};

export async function getContentBlockForEdit(id: string): Promise<ContentBlockFormInitial | null> {
  const b = await prisma.contentBlock.findUnique({
    where: { id },
    include: { translations: true },
  });
  if (!b) return null;

  const bodies = {} as Record<Locale, string>;
  for (const locale of LOCALES) {
    bodies[locale] = b.translations.find((t) => t.localeCode === locale)?.body ?? '';
  }
  return { id: b.id, key: b.key, notes: b.notes ?? '', bodies };
}
