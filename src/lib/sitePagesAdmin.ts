import 'server-only';
import { uuidv7 } from 'uuidv7';
import { prisma } from './prisma';
import { LOCALES, type Locale } from '@/i18n/config';
import {
  PAGE_REGISTRY,
  pageDef,
  mergeState,
  assertHideable,
  flagsSchema,
  translationSchema,
  contentBlockEditSchema,
  SitePageError,
  type SitePageKey,
  type FlagsInput,
} from './sitePages';

// Admin read + write for /dashboard/pages. Writes return a `diff` the caller
// records via writeAudit(); revalidation + auth live in the server actions.

export type AdminPageRow = {
  key: SitePageKey;
  title: string;
  path: string;
  canHide: boolean;
  navEligible: boolean;
  footerEligible: boolean;
  isPublished: boolean;
  showInNav: boolean;
  showInFooter: boolean;
  navSortOrder: number;
};

export async function listAdminPages(): Promise<AdminPageRow[]> {
  const rows = await prisma.sitePage.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return PAGE_REGISTRY.map((def) => {
    const state = mergeState(def, byKey.get(def.key));
    return {
      key: def.key,
      title: def.title,
      path: def.path,
      canHide: def.canHide,
      navEligible: def.navEligible,
      footerEligible: def.footerEligible,
      ...state,
    };
  }).sort((a, b) => a.navSortOrder - b.navSortOrder);
}

export type LocaleTranslation = { navLabel: string; metaTitle: string; metaDescription: string };
export type ContentBlockEdit = { id: string; key: string; notes: string | null; bodies: Record<string, string> };

export type PageEditData = {
  key: SitePageKey;
  title: string;
  path: string;
  canHide: boolean;
  navEligible: boolean;
  footerEligible: boolean;
  isPublished: boolean;
  showInNav: boolean;
  showInFooter: boolean;
  /** Raw per-locale overrides (no fallback) so each language box shows its own value. */
  translations: Record<string, LocaleTranslation>;
  /** This page's editable marketing copy, with every locale's body. */
  contentBlocks: ContentBlockEdit[];
};

export async function getPageEditData(key: string): Promise<PageEditData | null> {
  const def = pageDef(key);
  if (!def) return null;

  const [row, blocks] = await Promise.all([
    prisma.sitePage.findUnique({ where: { key }, include: { translations: true } }),
    prisma.contentBlock.findMany({ include: { translations: true } }),
  ]);

  const state = mergeState(def, row ?? undefined);

  const translations: Record<string, LocaleTranslation> = {};
  for (const loc of LOCALES) {
    const tx = row?.translations.find((t) => t.localeCode === loc);
    translations[loc] = {
      navLabel: tx?.navLabel ?? '',
      metaTitle: tx?.metaTitle ?? '',
      metaDescription: tx?.metaDescription ?? '',
    };
  }

  const contentBlocks: ContentBlockEdit[] = blocks
    .filter((b) => def.contentPrefixes.some((pre) => b.key.startsWith(pre)))
    .map((b) => {
      const bodies: Record<string, string> = {};
      for (const loc of LOCALES) {
        bodies[loc] = b.translations.find((t) => t.localeCode === loc)?.body ?? '';
      }
      return { id: b.id, key: b.key, notes: b.notes, bodies };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    key: def.key,
    title: def.title,
    path: def.path,
    canHide: def.canHide,
    navEligible: def.navEligible,
    footerEligible: def.footerEligible,
    ...state,
    translations,
    contentBlocks,
  };
}

export type AuditDiff = Record<string, { from: unknown; to: unknown }>;

/**
 * Apply a visibility/flag change. Enforces the home-can't-be-hidden rule in
 * code (assertHideable), upserts the row, and returns an audit diff. Throws
 * SitePageError on a protected or unknown page.
 */
export async function savePageFlags(key: string, input: FlagsInput): Promise<AuditDiff> {
  const def = pageDef(key);
  if (!def) throw new SitePageError(`Unknown page: ${key}`);
  const flags = flagsSchema.parse(input);

  // Any attempt to hide a non-hideable page is refused — even if the UI allowed it.
  if (flags.isPublished === false) assertHideable(key);

  const current = await prisma.sitePage.findUnique({ where: { key } });
  const before = mergeState(def, current ?? undefined);

  const data = {
    isPublished: flags.isPublished ?? before.isPublished,
    showInNav: flags.showInNav ?? before.showInNav,
    showInFooter: flags.showInFooter ?? before.showInFooter,
  };
  // A protected page is always published, belt-and-braces.
  if (!def.canHide) data.isPublished = true;

  await prisma.sitePage.upsert({
    where: { key },
    update: data,
    create: {
      id: uuidv7(),
      key,
      navSortOrder: def.defaultNavOrder,
      ...data,
    },
  });

  const diff: AuditDiff = {};
  for (const f of ['isPublished', 'showInNav', 'showInFooter'] as const) {
    if (before[f] !== data[f]) diff[f] = { from: before[f], to: data[f] };
  }
  return diff;
}

/**
 * Save the per-locale menu label + SEO overrides for a page. Blank fields clear
 * to null (fall back to the code default). Returns an audit diff of the locales
 * that changed. Never writes the non-public `zh` source language.
 */
export async function savePageTranslations(
  key: string,
  perLocale: Record<string, { navLabel?: string; metaTitle?: string; metaDescription?: string }>,
): Promise<AuditDiff> {
  const def = pageDef(key);
  if (!def) throw new SitePageError(`Unknown page: ${key}`);

  const row = await prisma.sitePage.upsert({
    where: { key },
    update: {},
    create: { id: uuidv7(), key, navSortOrder: def.defaultNavOrder },
    include: { translations: true },
  });

  const diff: AuditDiff = {};
  for (const loc of LOCALES) {
    const raw = perLocale[loc];
    if (!raw) continue;
    const parsed = translationSchema.parse(raw); // trims; blank → null; caps length
    const existing = row.translations.find((t) => t.localeCode === loc);
    const before = {
      navLabel: existing?.navLabel ?? null,
      metaTitle: existing?.metaTitle ?? null,
      metaDescription: existing?.metaDescription ?? null,
    };
    if (
      before.navLabel === parsed.navLabel &&
      before.metaTitle === parsed.metaTitle &&
      before.metaDescription === parsed.metaDescription
    ) {
      continue; // nothing changed for this locale
    }

    if (existing) {
      await prisma.sitePageTranslation.update({
        where: { sitePageId_localeCode: { sitePageId: row.id, localeCode: loc } },
        data: parsed,
      });
    } else {
      await prisma.sitePageTranslation.create({
        data: { id: uuidv7(), sitePageId: row.id, localeCode: loc, ...parsed },
      });
    }
    diff[loc] = { from: before, to: parsed };
  }
  return diff;
}

/**
 * Save edited body copy for a page's content blocks. `edits` maps
 * `${blockId}:${localeCode}` → body. A blank body deletes that locale's row
 * (so it falls back to English); English is never deleted out from under a
 * block that still shows copy. Returns an audit diff.
 */
export async function savePageContent(
  key: string,
  edits: Record<string, string>,
): Promise<AuditDiff> {
  const def = pageDef(key);
  if (!def) throw new SitePageError(`Unknown page: ${key}`);

  // Only allow writing blocks that actually belong to this page.
  const blocks = await prisma.contentBlock.findMany({
    include: { translations: true },
  });
  const owned = new Map(
    blocks
      .filter((b) => def.contentPrefixes.some((pre) => b.key.startsWith(pre)))
      .map((b) => [b.id, b]),
  );

  const diff: AuditDiff = {};
  for (const [composite, rawBody] of Object.entries(edits)) {
    const sep = composite.lastIndexOf(':');
    if (sep < 0) continue;
    const blockId = composite.slice(0, sep);
    const loc = composite.slice(sep + 1) as Locale;
    if (!LOCALES.includes(loc)) continue;
    const block = owned.get(blockId);
    if (!block) continue; // not a block this page owns — ignore

    const body = contentBlockEditSchema.parse({ body: rawBody }).body;
    const existing = block.translations.find((t) => t.localeCode === loc);
    const before = existing?.body ?? '';
    if (before === body) continue;

    if (body.length === 0) {
      if (existing) {
        await prisma.contentBlockTranslation.delete({
          where: { contentBlockId_localeCode: { contentBlockId: blockId, localeCode: loc } },
        });
      }
    } else if (existing) {
      await prisma.contentBlockTranslation.update({
        where: { contentBlockId_localeCode: { contentBlockId: blockId, localeCode: loc } },
        data: { body },
      });
    } else {
      await prisma.contentBlockTranslation.create({
        data: { id: uuidv7(), contentBlockId: blockId, localeCode: loc, body },
      });
    }
    diff[`${block.key}:${loc}`] = { from: before, to: body };
  }
  return diff;
}
