import { z } from 'zod';

// The public "outer" pages an admin manages from /dashboard/pages. The SET of
// pages, their routes, and which of them may be hidden live HERE in code (not
// the DB) so the rules — above all "the home page can never be hidden" — are
// enforced in code and can't be bypassed by a stray DB edit. The DB (SitePage)
// stores only the mutable flags + per-locale label/SEO overrides; a missing row
// means "use the defaults below".
//
// This module is PURE (no prisma, no server-only) so the logic is unit-tested
// directly; the DB-backed wrappers live in sitePages.server.ts.

export type SitePageKey =
  | 'home'
  | 'about'
  | 'portfolio'
  | 'catalog'
  | 'contacts'
  | 'services'
  | 'legal';

export type PageDef = {
  key: SitePageKey;
  /** Route under /[locale]; '' is the home page. Sub-routes inherit visibility. */
  path: string;
  /** Human label for the dashboard list (the public menu label is editable). */
  title: string;
  /** false only for home — its toggle is locked and the server refuses to hide it. */
  canHide: boolean;
  /** Can appear in the top navigation bar. */
  navEligible: boolean;
  /** Can appear in the footer link columns. */
  footerEligible: boolean;
  /** common.json i18n key for the default menu label when no override is set. */
  navLabelKey: string;
  /** content_block key prefixes whose copy is editable under this page. */
  contentPrefixes: string[];
  /** Default position in the nav (and the dashboard list). */
  defaultNavOrder: number;
};

export const PAGE_REGISTRY: readonly PageDef[] = [
  {
    key: 'home',
    path: '',
    title: 'Home',
    canHide: false,
    navEligible: false, // the logo links home; it is not a nav item
    footerEligible: false,
    navLabelKey: 'nav.about', // unused (not nav-eligible)
    contentPrefixes: ['home.'],
    defaultNavOrder: 0,
  },
  {
    key: 'about',
    path: '/about',
    title: 'About',
    canHide: true,
    navEligible: true,
    footerEligible: true,
    navLabelKey: 'nav.about',
    contentPrefixes: ['about.'],
    defaultNavOrder: 1,
  },
  {
    key: 'portfolio',
    path: '/portfolio',
    title: 'Portfolio',
    canHide: true,
    navEligible: true,
    footerEligible: true,
    navLabelKey: 'nav.portfolio',
    contentPrefixes: ['portfolio.'],
    defaultNavOrder: 2,
  },
  {
    key: 'catalog',
    path: '/catalog',
    title: 'Catalog',
    canHide: true,
    navEligible: true,
    footerEligible: false,
    navLabelKey: 'nav.catalog',
    contentPrefixes: ['catalog.'],
    defaultNavOrder: 3,
  },
  {
    key: 'contacts',
    path: '/contacts',
    title: 'Contacts',
    canHide: true,
    navEligible: true,
    footerEligible: true,
    navLabelKey: 'nav.contacts',
    contentPrefixes: ['contact.'],
    defaultNavOrder: 4,
  },
  {
    key: 'services',
    path: '/services',
    title: 'Services',
    canHide: true,
    navEligible: true,
    footerEligible: true,
    navLabelKey: 'nav.services',
    contentPrefixes: ['services.'],
    defaultNavOrder: 5,
  },
  {
    key: 'legal',
    path: '/legal',
    title: 'Legal (Privacy & Terms)',
    canHide: true,
    navEligible: false, // footer-only
    footerEligible: true,
    navLabelKey: 'footer.privacy',
    contentPrefixes: ['legal.'],
    defaultNavOrder: 6,
  },
] as const;

export const PAGE_KEYS: readonly SitePageKey[] = PAGE_REGISTRY.map((p) => p.key);

export function pageDef(key: string): PageDef | undefined {
  return PAGE_REGISTRY.find((p) => p.key === key);
}

export function isSitePageKey(key: string): key is SitePageKey {
  return PAGE_REGISTRY.some((p) => p.key === key);
}

/** content_block key → the page that owns it (first matching prefix wins). */
export function pageKeyForContentKey(contentKey: string): SitePageKey | undefined {
  return PAGE_REGISTRY.find((p) => p.contentPrefixes.some((pre) => contentKey.startsWith(pre)))?.key;
}

// ---------------------------------------------------------------------------
// State + override shapes
// ---------------------------------------------------------------------------

export type PageState = {
  isPublished: boolean;
  showInNav: boolean;
  showInFooter: boolean;
  navSortOrder: number;
};

export type PageOverride = {
  navLabel: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

/** Minimal shape of a persisted SitePage row (decoupled from Prisma types). */
export type PageRowInput = {
  key: string;
  isPublished: boolean;
  showInNav: boolean;
  showInFooter: boolean;
  navSortOrder: number;
} | undefined;

export type TranslationRowInput = {
  localeCode: string;
  navLabel: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

// ---------------------------------------------------------------------------
// Pure builders — the heart of the feature, unit-tested directly.
// ---------------------------------------------------------------------------

/**
 * Merge a persisted row with the code defaults. A non-hideable page (home) is
 * ALWAYS published regardless of what the row says — the one invariant that
 * keeps the site's front door online.
 */
export function mergeState(def: PageDef, row: PageRowInput): PageState {
  return {
    isPublished: def.canHide ? (row?.isPublished ?? true) : true,
    showInNav: row?.showInNav ?? true,
    showInFooter: row?.showInFooter ?? true,
    navSortOrder: row?.navSortOrder ?? def.defaultNavOrder,
  };
}

/**
 * Resolve one override field through the [requested, 'en'] fallback chain, per
 * field — a locale row may set metaTitle but leave navLabel blank, and each
 * field falls back independently.
 */
export function resolveField(
  rows: TranslationRowInput[],
  locale: string,
  field: 'navLabel' | 'metaTitle' | 'metaDescription',
): string | null {
  const reqd = rows.find((r) => r.localeCode === locale)?.[field];
  if (reqd && reqd.trim()) return reqd;
  const en = rows.find((r) => r.localeCode === 'en')?.[field];
  if (en && en.trim()) return en;
  return null;
}

export function buildOverride(rows: TranslationRowInput[], locale: string): PageOverride {
  return {
    navLabel: resolveField(rows, locale, 'navLabel'),
    metaTitle: resolveField(rows, locale, 'metaTitle'),
    metaDescription: resolveField(rows, locale, 'metaDescription'),
  };
}

export type NavItem = { key: string; path: string; label: string };

/**
 * Ordered, visible top-nav items. `codeLabel` supplies the fallback menu label
 * from the code i18n dictionary when a page has no DB override.
 */
export function buildNavItems(
  states: Record<SitePageKey, PageState>,
  overrides: Record<SitePageKey, PageOverride>,
  codeLabel: (key: SitePageKey) => string,
): NavItem[] {
  return PAGE_REGISTRY.filter(
    (def) => def.navEligible && states[def.key].isPublished && states[def.key].showInNav,
  )
    .slice()
    .sort((a, b) => states[a.key].navSortOrder - states[b.key].navSortOrder)
    .map((def) => ({
      key: def.key,
      path: def.path,
      label: overrides[def.key].navLabel ?? codeLabel(def.key),
    }));
}

/** Which footer-eligible pages are currently shown in the footer. */
export function buildFooterVisibility(
  states: Record<SitePageKey, PageState>,
): Record<SitePageKey, boolean> {
  const out = {} as Record<SitePageKey, boolean>;
  for (const def of PAGE_REGISTRY) {
    out[def.key] =
      def.footerEligible && states[def.key].isPublished && states[def.key].showInFooter;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Validation (used by the dashboard server actions; pure → unit-tested)
// ---------------------------------------------------------------------------

export class SitePageError extends Error {}

/** Throw if an admin tries to hide a page that may never be hidden (home). */
export function assertHideable(key: string): void {
  const def = pageDef(key);
  if (!def) throw new SitePageError(`Unknown page: ${key}`);
  if (!def.canHide) throw new SitePageError(`The "${def.title}" page cannot be hidden.`);
}

export const flagsSchema = z.object({
  isPublished: z.boolean().optional(),
  showInNav: z.boolean().optional(),
  showInFooter: z.boolean().optional(),
});
export type FlagsInput = z.infer<typeof flagsSchema>;

// Blank → null (falls back to the code default). Trim + cap length so a mis-edit
// can't inject an enormous <title>. Caps are generous but bounded.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const translationSchema = z.object({
  navLabel: optionalText(80),
  metaTitle: optionalText(160),
  metaDescription: optionalText(320),
});
export type TranslationInput = z.infer<typeof translationSchema>;

export const contentBlockEditSchema = z.object({
  // Body copy can be long (page intros); cap at a sane 8k.
  body: z.string().trim().max(8000),
});
